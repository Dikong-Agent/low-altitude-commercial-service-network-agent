import type { ComparisonTableRow } from "../../contracts";
import type { ComparisonIntent, DemoProduct, NumericDimension, ProductEvaluation } from "./types";
import { AG001_CONFIG } from "./config";

type QualityStatus = "verified" | "master_only" | "conflict" | "missing";
const meta: Record<NumericDimension, { label: string; unit: string; better: "higher" | "lower"; display: (value: number | null) => string }> = {
  priceYuan: { label: "参考价格", unit: "万元", better: "lower", display: (v) => v === null ? "资料缺失" : `${(v / 10000).toFixed(1)} 万` },
  enduranceMinutes: { label: "标称续航", unit: "分钟", better: "higher", display: (v) => v === null ? "资料缺失" : `${v} 分钟` },
  payloadKg: { label: "有效载荷", unit: "公斤", better: "higher", display: (v) => v === null ? "资料缺失" : `${v} kg` },
  windResistanceMps: { label: "抗风能力", unit: "米/秒", better: "higher", display: (v) => v === null ? "资料缺失" : `${v} m/s` },
  maxOperatingAltitudeM: { label: "最大作业海拔", unit: "米", better: "higher", display: (v) => v === null ? "资料缺失" : `${v} 米` },
  deliveryDays: { label: "样例交付周期", unit: "天", better: "lower", display: (v) => v === null ? "资料缺失" : `${v} 天` },
  warrantyMonths: { label: "质保期", unit: "个月", better: "higher", display: (v) => v === null ? "资料缺失" : `${v} 个月` },
};

interface Observation { dimension: NumericDimension; raw: string; normalized: number; sourceId: string }
function observations(product: DemoProduct): Observation[] {
  const result: Observation[] = [];
  const patterns: Array<{ dimension: NumericDimension; regex: RegExp; factor: (unit: string) => number }> = [
    { dimension: "priceYuan", regex: /(?:参考价格|价格)\s*(\d+(?:\.\d+)?)\s*(万元|元)/, factor: (u) => u === "万元" ? 10000 : 1 },
    { dimension: "enduranceMinutes", regex: /(?:标称续航|标准工况续航|续航)\s*(\d+(?:\.\d+)?)\s*(小时|分钟)/, factor: (u) => u === "小时" ? 60 : 1 },
    { dimension: "payloadKg", regex: /(?:有效载荷|载荷)\s*(\d+(?:\.\d+)?)\s*(公斤|千克|克)/, factor: (u) => u === "克" ? 0.001 : 1 },
    { dimension: "windResistanceMps", regex: /抗风\s*(\d+(?:\.\d+)?)\s*(公里\/小时|米\/秒)/, factor: (u) => u === "公里/小时" ? 1 / 3.6 : 1 },
    { dimension: "maxOperatingAltitudeM", regex: /(?:最大作业海拔|作业海拔)\s*(\d+(?:\.\d+)?)\s*(千米|公里|米)/, factor: (u) => /千米|公里/.test(u) ? 1000 : 1 },
    { dimension: "deliveryDays", regex: /交付(?:周期)?\s*(\d+(?:\.\d+)?)\s*(周|天)/, factor: (u) => u === "周" ? 7 : 1 },
    { dimension: "warrantyMonths", regex: /质保\s*(\d+(?:\.\d+)?)\s*(年|个月)/, factor: (u) => u === "年" ? 12 : 1 },
  ];
  for (const source of product.sourceRecords) for (const pattern of patterns) {
    const match = source.content.match(pattern.regex);
    if (match) result.push({ dimension: pattern.dimension, raw: `${match[1]}${match[2]}`, normalized: Number((Number(match[1]) * pattern.factor(match[2])).toFixed(3)), sourceId: source.id });
  }
  return result;
}
function evidenceFor(product: DemoProduct, dimension: NumericDimension) {
  const actual = product[dimension];
  const found = observations(product).filter((item) => item.dimension === dimension);
  const refs = [...new Set(found.map((item) => item.sourceId))];
  const unique = [...new Set(found.map((item) => item.normalized))];
  const quality: QualityStatus = actual === null ? "missing" : !found.length ? "master_only" : unique.length > 1 ? "conflict" : "verified";
  return { actual, found, refs, unique, quality };
}
function desiredCandidateCount(input: string) { return /两款|2\s*款|两个/.test(input) ? 2 : /三款|3\s*款|三个/.test(input) ? 3 : AG001_CONFIG.maxCandidates; }
function passesNumeric(actual: number | null, operator: "gte" | "lte", expected: number) { return actual !== null && (operator === "gte" ? actual >= expected : actual <= expected); }
function ingressRank(value: string) { const match = value.toUpperCase().match(/^IP(\d)(\d)$/); return match ? Number(match[1]) * 10 + Number(match[2]) : null; }
function featureActual(product: DemoProduct, feature: ComparisonIntent["requestedFeatures"][number]) { return feature.key === "ingressProtection" ? product.ingressProtection : product.capabilities.join("、") || "资料未提供"; }
function passesFeature(product: DemoProduct, feature: ComparisonIntent["requestedFeatures"][number]) {
  if (feature.key === "ingressProtection") {
    if (feature.operator === "gte") { const actual = ingressRank(product.ingressProtection); const expected = ingressRank(feature.value); return actual !== null && expected !== null && actual >= expected; }
    return product.ingressProtection.toUpperCase() === feature.value.toUpperCase();
  }
  return product.capabilities.some((item) => item.toLowerCase().includes(feature.value.toLowerCase()));
}

export function selectCandidates(catalog: DemoProduct[], intent: ComparisonIntent, input: string): DemoProduct[] {
  if (intent.requestedProductIds.length) { const requested = new Set(intent.requestedProductIds); return catalog.filter((product) => requested.has(product.id)); }
  return [...catalog].sort((a, b) => {
    const pa = intent.hardConstraints.filter((c) => passesNumeric(a[c.dimension], c.operator, c.value)).length + intent.requestedFeatures.filter((f) => passesFeature(a, f)).length;
    const pb = intent.hardConstraints.filter((c) => passesNumeric(b[c.dimension], c.operator, c.value)).length + intent.requestedFeatures.filter((f) => passesFeature(b, f)).length;
    const total = intent.hardConstraints.length + intent.requestedFeatures.length;
    if (Number(pb === total) !== Number(pa === total)) return Number(pb === total) - Number(pa === total);
    if (pa !== pb) return pb - pa;
    const sa = intent.useCases.filter((item) => a.scenarios.includes(item)).length;
    const sb = intent.useCases.filter((item) => b.scenarios.includes(item)).length;
    return sb !== sa ? sb - sa : b.enduranceMinutes - a.enduranceMinutes;
  }).slice(0, desiredCandidateCount(input));
}
function normalizedScore(value: number | null, values: Array<number | null>, better: "higher" | "lower") {
  if (value === null) return 0;
  const available = values.filter((item): item is number => item !== null);
  if (!available.length) return 0;
  const min = Math.min(...available), max = Math.max(...available);
  if (max === min) return 0.5;
  const ratio = (value - min) / (max - min);
  return better === "higher" ? ratio : 1 - ratio;
}
function scenarioFit(product: DemoProduct, useCases: string[]) {
  if (!useCases.length) return `产品资料列明的适用场景包括${product.scenarios.slice(0, 2).join("、")}。`;
  const matched = useCases.filter((item) => product.scenarios.includes(item));
  if (matched.length === useCases.length) return `产品资料覆盖目标场景“${useCases.join("、")}”。`;
  if (matched.length) return `产品资料覆盖“${matched.join("、")}”，其余目标场景需进一步核验。`;
  return `产品资料未直接覆盖“${useCases.join("、")}”，不宜仅凭参数表判断适用性。`;
}
function numericCheck(product: DemoProduct, constraint: ComparisonIntent["hardConstraints"][number]) {
  const evidence = evidenceFor(product, constraint.dimension);
  if (evidence.quality === "missing") return { label: constraint.label, passed: false, actual: "资料缺失", determination: "needs_review" as const, evidenceStatus: "missing" as const };
  const values = evidence.found.length ? evidence.unique : [evidence.actual as number];
  const results = values.map((value) => passesNumeric(value, constraint.operator, constraint.value));
  const determination = results.every(Boolean) ? "passed" as const : results.some(Boolean) ? "needs_review" as const : "failed" as const;
  return { label: constraint.label, passed: determination === "passed", actual: evidence.quality === "conflict" ? evidence.unique.map((v) => meta[constraint.dimension].display(v)).join(" / ") : meta[constraint.dimension].display(evidence.actual), determination, evidenceStatus: evidence.quality };
}

export function evaluateProducts(products: DemoProduct[], intent: ComparisonIntent): ProductEvaluation[] {
  const inferred = intent.useCases.flatMap((item) => [...(AG001_CONFIG.defaultFocus[item as keyof typeof AG001_CONFIG.defaultFocus] ?? [])]);
  const focus: NumericDimension[] = intent.focusDimensions.length ? intent.focusDimensions : inferred.length ? [...new Set(inferred)] : ["enduranceMinutes", "payloadKg", "windResistanceMps", "priceYuan"];
  const valueSets = Object.fromEntries(focus.map((d) => [d, products.map((p) => p[d])])) as Record<NumericDimension, Array<number | null>>;
  return products.map((product) => {
    const numericChecks = intent.hardConstraints.map((c) => numericCheck(product, c));
    const featureChecks = intent.requestedFeatures.map((feature) => { const passed = passesFeature(product, feature); const refs = product.sourceRecords.filter((s) => s.content.toLowerCase().includes(feature.value.toLowerCase())); return { label: feature.label, passed, actual: featureActual(product, feature), determination: passed ? "passed" as const : "failed" as const, evidenceStatus: refs.length ? "verified" as const : "master_only" as const }; });
    const checks = [...numericChecks, ...featureChecks];
    const failures = checks.filter((item) => item.determination !== "passed").map((item) => `${item.label}（当前${item.actual}${item.determination === "needs_review" ? "，需复核" : ""}）`);
    const dimensionScores = focus.map((d) => normalizedScore(product[d], valueSets[d], meta[d].better));
    const matched = intent.useCases.filter((item) => product.scenarios.includes(item)).length;
    const scenarioScore = !intent.useCases.length ? AG001_CONFIG.scoring.noScenario : matched === intent.useCases.length ? AG001_CONFIG.scoring.scenarioAll : matched ? AG001_CONFIG.scoring.scenarioPartial : AG001_CONFIG.scoring.scenarioNone;
    const preferenceScore = Math.round(dimensionScores.reduce((sum, v) => sum + v, 0) / Math.max(1, dimensionScores.length) * AG001_CONFIG.scoring.focusWeight);
    const rawScore = Math.round(AG001_CONFIG.scoring.base + preferenceScore + scenarioScore);
    const eligible = checks.every((item) => item.determination === "passed");
    const score = eligible ? rawScore : Math.min(rawScore, AG001_CONFIG.scoring.ineligibleCap);
    const advantages = focus.filter((d) => normalizedScore(product[d], valueSets[d], meta[d].better) >= .75).slice(0, 3).map((d) => `${meta[d].label}在本次候选中占优（${meta[d].display(product[d])}）`);
    const limitations = [...failures, ...product.useLimitations, ...focus.filter((d) => product[d] === null || normalizedScore(product[d], valueSets[d], meta[d].better) <= .25).map((d) => product[d] === null ? `${meta[d].label}资料缺失` : `${meta[d].label}在本次候选中不占优（${meta[d].display(product[d])}）`)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
    const passedCount = checks.filter((item) => item.determination === "passed").length;
    return {
      product, score, eligible, constraintFailures: failures, advantages, limitations, scenarioFit: scenarioFit(product, intent.useCases), constraintChecks: checks,
      capabilityProfile: {
        performance: [`标称续航：${meta.enduranceMinutes.display(product.enduranceMinutes)}`, `有效载荷：${meta.payloadKg.display(product.payloadKg)}`, `抗风能力：${meta.windResistanceMps.display(product.windResistanceMps)}`, `最大作业海拔：${meta.maxOperatingAltitudeM.display(product.maxOperatingAltitudeM)}`],
        costAndService: [`参考价格：${meta.priceYuan.display(product.priceYuan)}`, `交付周期：${meta.deliveryDays.display(product.deliveryDays)}`, `质保：${meta.warrantyMonths.display(product.warrantyMonths)}`, product.trainingIncluded ? "包含培训服务" : "未包含培训服务"],
        applicableScenarios: product.scenarios, usageLimits: product.useLimitations, evidenceRefs: product.sourceRecords.map((source) => source.id),
      },
      scoreBreakdown: { hardConstraintPassed: passedCount, hardConstraintTotal: checks.length, scenarioScore, preferenceScore, total: score, explanation: [!intent.useCases.length ? "未指定使用场景，场景项采用中性值" : matched === intent.useCases.length ? `覆盖全部${intent.useCases.length}个目标场景` : `覆盖${matched}/${intent.useCases.length}个目标场景`, `关注维度贡献${preferenceScore}分`, checks.length ? `必要条件通过${passedCount}/${checks.length}项` : "未设置必要条件"] },
    };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}

export interface ParameterQualityReport {
  source_count: number;
  normalized_conversions: Array<{ product_id: string; product_name: string; field: string; raw: string; normalized: string; source_id: string }>;
  missing_items: Array<{ product_id: string; product_name: string; field: string; detail: string }>;
  source_gap_items: Array<{ product_id: string; product_name: string; field: string; detail: string }>;
  conflict_items: Array<{ product_id: string; product_name: string; field: string; detail: string; source_ids: string[] }>;
}
export function analyzeParameterQuality(products: DemoProduct[], intent: ComparisonIntent): ParameterQualityReport {
  const dimensions = [...new Set<NumericDimension>([...intent.focusDimensions, ...intent.hardConstraints.map((item) => item.dimension), ...(!intent.focusDimensions.length && !intent.hardConstraints.length ? ["enduranceMinutes", "payloadKg", "windResistanceMps"] as NumericDimension[] : [])])];
  const report: ParameterQualityReport = { source_count: products.reduce((sum, p) => sum + p.sourceRecords.length, 0), normalized_conversions: [], missing_items: [], source_gap_items: [], conflict_items: [] };
  for (const product of products) for (const dimension of dimensions) {
    const evidence = evidenceFor(product, dimension);
    if (evidence.quality === "missing") report.missing_items.push({ product_id: product.id, product_name: product.name, field: meta[dimension].label, detail: `${meta[dimension].label}在主数据和关联资料中均未提供。` });
    else if (evidence.quality === "master_only") report.source_gap_items.push({ product_id: product.id, product_name: product.name, field: meta[dimension].label, detail: `${meta[dimension].label}仅有主数据值，关联资料未提供可核验出处。` });
    for (const value of evidence.found) { const normalized = meta[dimension].display(value.normalized); if (value.raw.replace(/\s/g, "") !== normalized.replace(/\s/g, "")) report.normalized_conversions.push({ product_id: product.id, product_name: product.name, field: meta[dimension].label, raw: value.raw, normalized, source_id: value.sourceId }); }
    if (evidence.quality === "conflict") report.conflict_items.push({ product_id: product.id, product_name: product.name, field: meta[dimension].label, detail: `${meta[dimension].label}存在${evidence.unique.map((v) => meta[dimension].display(v)).join("、")}等不同口径，暂不自动裁定。`, source_ids: evidence.refs });
  }
  report.normalized_conversions = report.normalized_conversions.slice(0, 8);
  return report;
}
function numericRow(products: DemoProduct[], dimension: NumericDimension): ComparisonTableRow {
  const available = products.map((p) => p[dimension]).filter((v): v is number => v !== null);
  const best = available.length ? (meta[dimension].better === "higher" ? Math.max(...available) : Math.min(...available)) : null;
  return { key: dimension, label: meta[dimension].label, unit: meta[dimension].unit, values: products.map((product) => { const e = evidenceFor(product, dimension); return { product_id: product.id, display: meta[dimension].display(e.actual), raw: e.actual, source_refs: e.refs, quality_status: e.quality }; }), best_product_ids: best === null ? [] : products.filter((p) => p[dimension] === best).map((p) => p.id) };
}
function textEvidence(product: DemoProduct, value: string) { const refs = product.sourceRecords.filter((s) => s.content.toLowerCase().includes(value.toLowerCase())).map((s) => s.id); return { source_refs: refs, quality_status: refs.length ? "verified" as const : "master_only" as const }; }
export function buildComparisonTable(products: DemoProduct[]): ComparisonTableRow[] {
  return [numericRow(products, "priceYuan"), numericRow(products, "enduranceMinutes"), numericRow(products, "payloadKg"), numericRow(products, "windResistanceMps"), numericRow(products, "maxOperatingAltitudeM"),
    { key: "ingressProtection", label: "防护等级", unit: "", values: products.map((p) => ({ product_id: p.id, display: p.ingressProtection, raw: p.ingressProtection, ...textEvidence(p, p.ingressProtection) })), best_product_ids: [] }, numericRow(products, "deliveryDays"), numericRow(products, "warrantyMonths"),
    { key: "trainingIncluded", label: "培训服务", unit: "", values: products.map((p) => ({ product_id: p.id, display: p.trainingIncluded ? "包含" : "未包含", raw: p.trainingIncluded, ...textEvidence(p, "培训") })), best_product_ids: products.filter((p) => p.trainingIncluded).map((p) => p.id) }];
}
