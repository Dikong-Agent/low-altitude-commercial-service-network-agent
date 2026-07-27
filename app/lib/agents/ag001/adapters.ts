import type { AgentInvokeRequest } from "../../contracts";
import { DEMO_PRODUCT_CATALOG } from "./catalog";
import type { ComparisonIntent, DemoProduct, HardConstraint, NumericDimension } from "./types";

export interface AIPlatformPort {
  understandComparisonRequest(request: AgentInvokeRequest, options?: { signal?: AbortSignal }): Promise<ComparisonIntent>;
}

export interface BusinessDataPort {
  listProducts(options?: { signal?: AbortSignal }): Promise<DemoProduct[]>;
  getProducts(ids: string[], options?: { signal?: AbortSignal }): Promise<DemoProduct[]>;
}

const focusKeywords: Array<[NumericDimension, string[]]> = [
  ["priceYuan", ["预算", "价格", "成本"]],
  ["enduranceMinutes", ["续航", "航时", "长航时"]],
  ["payloadKg", ["载荷", "负载", "挂载"]],
  ["windResistanceMps", ["抗风", "风速", "复杂环境"]],
  ["deliveryDays", ["交付", "到货", "周期"]],
  ["warrantyMonths", ["质保", "售后", "保修"]],
];

function firstNumber(input: string, pattern: RegExp): number | null {
  const match = input.match(pattern);
  return match ? Number(match[1]) : null;
}

function parseBudget(input: string): { value: number | null; ambiguous: boolean } {
  const match = input.match(/预算[^\d]{0,6}(\d+(?:\.\d+)?)\s*(万(?:元)?|元)?/);
  if (!match) return { value: null, ambiguous: false };
  if (!match[2]) return { value: null, ambiguous: true };
  return { value: Math.round(Number(match[1]) * (match[2].startsWith("万") ? 10000 : 1)), ambiguous: false };
}

function addConstraint(list: HardConstraint[], constraint: HardConstraint | null) {
  if (!constraint) return;
  if (!list.some((item) => item.dimension === constraint.dimension && item.operator === constraint.operator)) list.push(constraint);
}

function parseConstraint(
  input: string,
  dimension: NumericDimension,
  label: string,
  keyword: string,
  unit: string,
): HardConstraint | null {
  const gte = firstNumber(input, new RegExp(`${keyword}[^，。；、]{0,10}?(?:至少|不低于|不少于|>=|≥)\\s*(\\d+(?:\\.\\d+)?)`, "i"));
  if (gte !== null) return { dimension, operator: "gte", value: gte, label: `${label}不低于${gte}${unit}` };
  const lte = firstNumber(input, new RegExp(`${keyword}[^，。；、]{0,10}?(?:不超过|不高于|以内|<=|≤)\\s*(\\d+(?:\\.\\d+)?)`, "i"));
  if (lte !== null) return { dimension, operator: "lte", value: lte, label: `${label}不超过${lte}${unit}` };
  return null;
}

function inferUseCases(input: string): string[] {
  const mappings: Array<[string, string[]]> = [
    ["山区巡检", ["山区", "山地", "复杂地形"]],
    ["电力巡检", ["电力", "电网", "输电", "杆塔"]],
    ["应急保障", ["应急", "救援", "保障"]],
    ["物资投送", ["投送", "运输", "物资"]],
    ["测绘", ["测绘", "勘察", "建模"]],
    ["轻量航拍", ["航拍", "摄影", "视频"]],
    ["园区巡检", ["园区", "厂区"]],
  ];
  return mappings
    .filter(([, keywords]) => keywords.some((keyword) => input.includes(keyword)))
    .map(([useCase]) => useCase);
}

export class DemoAIPlatformAdapter implements AIPlatformPort {
  async understandComparisonRequest(request: AgentInvokeRequest): Promise<ComparisonIntent> {
    const input = request.input.trim();
    const contextIds = Array.isArray(request.context?.product_ids)
      ? request.context.product_ids.filter((item): item is string => typeof item === "string")
      : [];
    const requestedProductIds = new Set(contextIds);
    for (const product of DEMO_PRODUCT_CATALOG) {
      if (product.aliases.some((alias) => input.toLowerCase().includes(alias.toLowerCase()))) requestedProductIds.add(product.id);
    }

    const budget = parseBudget(input);
    const budgetYuan = budget.value;
    const hardConstraints: HardConstraint[] = [];
    if (budgetYuan !== null) addConstraint(hardConstraints, { dimension: "priceYuan", operator: "lte", value: budgetYuan, label: `预算不超过${Math.round(budgetYuan / 10000)}万元` });
    addConstraint(hardConstraints, parseConstraint(input, "enduranceMinutes", "续航", "(?:续航|航时)", "分钟"));
    addConstraint(hardConstraints, parseConstraint(input, "payloadKg", "有效载荷", "(?:载荷|负载|挂载)", "公斤"));
    addConstraint(hardConstraints, parseConstraint(input, "windResistanceMps", "抗风能力", "(?:抗风|风速)", "米/秒"));
    addConstraint(hardConstraints, parseConstraint(input, "deliveryDays", "交付周期", "(?:交付期?|到货周期)", "天"));
    addConstraint(hardConstraints, parseConstraint(input, "warrantyMonths", "质保期", "(?:质保|保修)", "个月"));

    const focusDimensions = focusKeywords
      .filter(([, keywords]) => keywords.some((keyword) => input.includes(keyword)))
      .map(([dimension]) => dimension);
    for (const constraint of hardConstraints) {
      if (!focusDimensions.includes(constraint.dimension)) focusDimensions.push(constraint.dimension);
    }

    const useCases = inferUseCases(input);
    const hasComparisonSignal = /对比|比较|型号|产品|无人机|推荐|选型|选购/.test(input);
    const singleProductComparison = /对比|比较/.test(input) && requestedProductIds.size === 1;
    const needsClarification = budget.ambiguous
      || singleProductComparison
      || !hasComparisonSignal
      || (requestedProductIds.size === 0 && useCases.length === 0 && focusDimensions.length === 0);
    const clarificationMessage = budget.ambiguous
      ? "预算金额缺少单位，请明确填写“元”或“万元”。"
      : singleProductComparison
        ? "当前只识别到一个型号，请至少补充另一个型号，或改为说明用途和选型条件。"
        : needsClarification
          ? "请补充要比较的型号，或说明用途、预算、载荷、续航等选型条件。"
          : null;

    return {
      requestedProductIds: [...requestedProductIds],
      useCases,
      budgetYuan,
      focusDimensions,
      hardConstraints,
      needsClarification,
      clarificationMessage,
    };
  }
}

export class MockBusinessDataAdapter implements BusinessDataPort {
  async listProducts() {
    return DEMO_PRODUCT_CATALOG.map((product) => ({ ...product }));
  }

  async getProducts(ids: string[]) {
    const wanted = new Set(ids);
    return DEMO_PRODUCT_CATALOG.filter((product) => wanted.has(product.id)).map((product) => ({ ...product }));
  }
}
