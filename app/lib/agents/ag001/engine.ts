import type { ComparisonTableRow } from "../../contracts";
import type { ComparisonIntent, DemoProduct, NumericDimension, ProductEvaluation } from "./types";
import { AG001_CONFIG } from "./config";

const meta: Record<NumericDimension, { label: string; unit: string; better: "higher" | "lower"; display: (value: number) => string }> = {
  priceYuan: { label: "参考价格", unit: "万元", better: "lower", display: (value) => `${(value / 10000).toFixed(1)} 万` },
  enduranceMinutes: { label: "标称续航", unit: "分钟", better: "higher", display: (value) => `${value} 分钟` },
  payloadKg: { label: "有效载荷", unit: "公斤", better: "higher", display: (value) => `${value} kg` },
  windResistanceMps: { label: "抗风能力", unit: "米/秒", better: "higher", display: (value) => `${value} m/s` },
  deliveryDays: { label: "样例交付周期", unit: "天", better: "lower", display: (value) => `${value} 天` },
  warrantyMonths: { label: "质保期", unit: "个月", better: "higher", display: (value) => `${value} 个月` },
};

function desiredCandidateCount(input: string) {
  if (/两款|2\s*款|两个/.test(input)) return 2;
  if (/三款|3\s*款|三个/.test(input)) return 3;
  return AG001_CONFIG.maxCandidates;
}

function passesConstraint(product: DemoProduct, constraint: ComparisonIntent["hardConstraints"][number]): boolean {
  const actual = product[constraint.dimension];
  return constraint.operator === "gte" ? actual >= constraint.value : actual <= constraint.value;
}

export function selectCandidates(catalog: DemoProduct[], intent: ComparisonIntent, input: string): DemoProduct[] {
  if (intent.requestedProductIds.length) {
    const requested = new Set(intent.requestedProductIds);
    return catalog.filter((product) => requested.has(product.id));
  }
  const ranked = [...catalog].sort((a, b) => {
    const passedA = intent.hardConstraints.filter((constraint) => passesConstraint(a, constraint)).length;
    const passedB = intent.hardConstraints.filter((constraint) => passesConstraint(b, constraint)).length;
    const eligibleA = passedA === intent.hardConstraints.length ? 1 : 0;
    const eligibleB = passedB === intent.hardConstraints.length ? 1 : 0;
    if (eligibleA !== eligibleB) return eligibleB - eligibleA;
    if (passedA !== passedB) return passedB - passedA;
    const scenarioA = intent.useCases.filter((useCase) => a.scenarios.includes(useCase)).length;
    const scenarioB = intent.useCases.filter((useCase) => b.scenarios.includes(useCase)).length;
    if (scenarioA !== scenarioB) return scenarioB - scenarioA;
    return b.enduranceMinutes - a.enduranceMinutes;
  });
  return ranked.slice(0, desiredCandidateCount(input));
}

function constraintValue(product: DemoProduct, dimension: NumericDimension) {
  return product[dimension];
}

function normalizedScore(value: number, values: number[], better: "higher" | "lower") {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 0.5;
  const ratio = (value - min) / (max - min);
  return better === "higher" ? ratio : 1 - ratio;
}

function scenarioFit(product: DemoProduct, useCases: string[]) {
  if (!useCases.length) return `可用于${product.scenarios.slice(0, 2).join("、")}等样例场景。`;
  const matched = useCases.filter((useCase) => product.scenarios.includes(useCase));
  if (matched.length === useCases.length) return `样例场景标签覆盖“${useCases.join("、")}”。`;
  if (matched.length) return `样例场景标签覆盖“${matched.join("、")}”，其余场景条件需要复核。`;
  return `样例场景标签未直接覆盖“${useCases.join("、")}”，需要结合实际任务复核。`;
}

export function evaluateProducts(products: DemoProduct[], intent: ComparisonIntent): ProductEvaluation[] {
  const defaultFocusByScenario: Record<string, readonly NumericDimension[]> = AG001_CONFIG.defaultFocus;
  const inferredFocus: NumericDimension[] = intent.useCases.flatMap((useCase) => [...(defaultFocusByScenario[useCase] ?? [])]);
  const focus: NumericDimension[] = intent.focusDimensions.length
    ? intent.focusDimensions
    : inferredFocus.length
      ? Array.from(new Set<NumericDimension>(inferredFocus))
      : ["enduranceMinutes", "payloadKg", "windResistanceMps", "priceYuan"];
  const valueSets = Object.fromEntries(focus.map((dimension) => [dimension, products.map((product) => constraintValue(product, dimension))])) as Record<NumericDimension, number[]>;

  return products.map((product) => {
    const constraintFailures = intent.hardConstraints.flatMap((constraint) => {
      const actual = constraintValue(product, constraint.dimension);
      const passes = constraint.operator === "gte" ? actual >= constraint.value : actual <= constraint.value;
      return passes ? [] : [`${constraint.label}（当前${meta[constraint.dimension].display(actual)}）`];
    });
    const dimensionScores = focus.map((dimension) => normalizedScore(constraintValue(product, dimension), valueSets[dimension], meta[dimension].better));
    const focusScore = dimensionScores.reduce((sum, value) => sum + value, 0) / Math.max(1, dimensionScores.length);
    const matchedScenarioCount = intent.useCases.filter((useCase) => product.scenarios.includes(useCase)).length;
    const scenarioScore = !intent.useCases.length
      ? AG001_CONFIG.scoring.noScenario
      : matchedScenarioCount === intent.useCases.length
        ? AG001_CONFIG.scoring.scenarioAll
        : matchedScenarioCount > 0
          ? AG001_CONFIG.scoring.scenarioPartial
          : AG001_CONFIG.scoring.scenarioNone;
    const rawScore = Math.round(AG001_CONFIG.scoring.base + focusScore * AG001_CONFIG.scoring.focusWeight + scenarioScore);
    const eligible = constraintFailures.length === 0;
    const score = eligible ? rawScore : Math.min(rawScore, AG001_CONFIG.scoring.ineligibleCap);

    const advantages = focus
      .filter((dimension) => normalizedScore(constraintValue(product, dimension), valueSets[dimension], meta[dimension].better) >= 0.75)
      .slice(0, 3)
      .map((dimension) => `${meta[dimension].label}表现突出（${meta[dimension].display(constraintValue(product, dimension))}）`);
    const limitations = [
      ...constraintFailures,
      ...focus.filter((dimension) => normalizedScore(constraintValue(product, dimension), valueSets[dimension], meta[dimension].better) <= 0.25)
        .map((dimension) => `${meta[dimension].label}相对候选方案不占优（${meta[dimension].display(constraintValue(product, dimension))}）`),
    ].filter((item, index, list) => list.indexOf(item) === index).slice(0, 3);

    return { product, score, eligible, constraintFailures, advantages, limitations, scenarioFit: scenarioFit(product, intent.useCases) };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}

function numericRow(products: DemoProduct[], dimension: NumericDimension): ComparisonTableRow {
  const values = products.map((product) => product[dimension]);
  const best = meta[dimension].better === "higher" ? Math.max(...values) : Math.min(...values);
  return {
    key: dimension,
    label: meta[dimension].label,
    unit: meta[dimension].unit,
    values: products.map((product) => ({ product_id: product.id, display: meta[dimension].display(product[dimension]), raw: product[dimension] })),
    best_product_ids: products.filter((product) => product[dimension] === best).map((product) => product.id),
  };
}

export function buildComparisonTable(products: DemoProduct[]): ComparisonTableRow[] {
  return [
    numericRow(products, "priceYuan"), numericRow(products, "enduranceMinutes"), numericRow(products, "payloadKg"),
    numericRow(products, "windResistanceMps"),
    { key: "ingressProtection", label: "防护等级", unit: "", values: products.map((product) => ({ product_id: product.id, display: product.ingressProtection, raw: product.ingressProtection })), best_product_ids: [] },
    numericRow(products, "deliveryDays"), numericRow(products, "warrantyMonths"),
    { key: "trainingIncluded", label: "培训服务", unit: "", values: products.map((product) => ({ product_id: product.id, display: product.trainingIncluded ? "包含" : "未包含", raw: product.trainingIncluded })), best_product_ids: products.filter((product) => product.trainingIncluded).map((product) => product.id) },
  ];
}
