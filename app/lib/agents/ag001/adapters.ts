import type { AgentInvokeRequest } from "../../contracts";
import type { CommonAIPlatformPort, CommonDomainDataPort } from "../../runtime-ports";
import { DEMO_PRODUCT_CATALOG } from "./catalog";
import type { ComparisonIntent, DemoProduct, HardConstraint, NumericDimension, RequestedFeature } from "./types";

export interface AIPlatformPort extends CommonAIPlatformPort {
  understandComparisonRequest(request: AgentInvokeRequest, options?: { signal?: AbortSignal }): Promise<ComparisonIntent>;
}
export interface BusinessDataPort extends CommonDomainDataPort {
  listProducts(options?: { signal?: AbortSignal }): Promise<DemoProduct[]>;
  getProducts(ids: string[], options?: { signal?: AbortSignal }): Promise<DemoProduct[]>;
}

const focusKeywords: Array<[NumericDimension, string[]]> = [
  ["priceYuan", ["预算", "价格", "成本"]], ["enduranceMinutes", ["续航", "航时", "长航时"]],
  ["payloadKg", ["载荷", "负载", "挂载"]], ["windResistanceMps", ["抗风", "风速", "复杂环境"]],
  ["maxOperatingAltitudeM", ["海拔", "作业高度", "高原"]],
  ["deliveryDays", ["交付", "到货", "周期"]], ["warrantyMonths", ["质保", "售后", "保修"]],
];
function parseBudget(input: string): { value: number | null; ambiguous: boolean } {
  const match = input.match(/(?:预算|价格|成本)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万(?:元)?|万元|元)?/);
  if (!match) return { value: null, ambiguous: false };
  if (!match[2]) return { value: null, ambiguous: true };
  return { value: Math.round(Number(match[1]) * (match[2].startsWith("万") ? 10000 : 1)), ambiguous: false };
}
function addConstraint(list: HardConstraint[], constraint: HardConstraint | null) {
  if (!constraint) return;
  const same = list.find((item) => item.dimension === constraint.dimension && item.operator === constraint.operator);
  if (!same) list.push(constraint);
  else if ((constraint.operator === "gte" && constraint.value > same.value) || (constraint.operator === "lte" && constraint.value < same.value)) Object.assign(same, constraint);
}
function parseQuantityConstraints(input: string, dimension: NumericDimension, label: string, keyword: string, units: Record<string, { factor: number; canonicalUnit: string }>): HardConstraint[] {
  const unitPattern = Object.keys(units).sort((left, right) => right.length - left.length).join("|");
  const regex = new RegExp(`${keyword}(?:能力|时间|周期|期|高度)?\\s*(至少|不低于|不少于|以上|不超过|不高于|以内|以下|<=|>=|≤|≥)?\\s*(\\d+(?:\\.\\d+)?)\\s*(${unitPattern})`, "gi");
  return [...input.matchAll(regex)].map((match) => {
    const operator = /不超过|不高于|以内|以下|<=|≤/.test(match[1] ?? "") ? "lte" as const : "gte" as const;
    const conversion = units[match[3]];
    const value = Number((Number(match[2]) * conversion.factor).toFixed(3));
    return { dimension, operator, value, label: `${label}${operator === "gte" ? "不低于" : "不超过"}${value}${conversion.canonicalUnit}` };
  });
}
function parseRequestedFeatures(input: string): { features: RequestedFeature[]; unverified: string[] } {
  const features: RequestedFeature[] = [];
  const unverified: string[] = [];
  const ingress = input.match(/\bIP\s*(\d{2})\s*(以上|及以上|不低于)?/i);
  if (ingress) features.push({ key: "ingressProtection", operator: ingress[2] ? "gte" : "eq", value: `IP${ingress[1]}`, label: `防护等级${ingress[2] ? "不低于" : "达到"}IP${ingress[1]}` });
  const supportedCapabilities = ["RTK", "热成像"];
  for (const capability of supportedCapabilities) {
    const index = input.toLowerCase().indexOf(capability.toLowerCase());
    if (index < 0) continue;
    const prefix = input.slice(Math.max(0, index - 8), index);
    if (/不需要|无需|不要求|不必|可不配|不要/.test(prefix)) continue;
    features.push({ key: "capability", operator: "contains", value: capability, label: `支持${capability}` });
  }
  const windScale = input.match(/(?:抗风|风力)(?:能力)?\s*(?:至少|不低于|不小于|达到|达)?\s*(\d+(?:\.\d+)?)\s*级/);
  if (windScale) unverified.push(`抗风${windScale[1]}级缺少厂商等级口径，请换算为米/秒后再校验`);
  const requestedSegments = [...input.matchAll(/支持([^，。；？?]+)/g)].flatMap((match) => match[1].split(/[和及、/]/));
  for (const segment of requestedSegments) {
    const cleaned = segment.trim().replace(/(?:功能|能力)$/, "");
    if (!cleaned || supportedCapabilities.some((item) => cleaned.toLowerCase().includes(item.toLowerCase())) || /^(?:哪些|什么|推荐|型号|产品)/.test(cleaned)) continue;
    unverified.push(`“支持${cleaned}”尚无结构化参数或权威资料可核验`);
  }
  return { features: features.filter((item, index, list) => list.findIndex((candidate) => candidate.key === item.key && candidate.value === item.value) === index), unverified: [...new Set(unverified)] };
}
function findInputConflicts(constraints: HardConstraint[]): string[] {
  const conflicts: string[] = [];
  for (const dimension of [...new Set(constraints.map((item) => item.dimension))]) {
    const lower = constraints.filter((item) => item.dimension === dimension && item.operator === "gte").sort((a, b) => b.value - a.value)[0];
    const upper = constraints.filter((item) => item.dimension === dimension && item.operator === "lte").sort((a, b) => a.value - b.value)[0];
    if (lower && upper && lower.value > upper.value) conflicts.push(`${lower.label}与${upper.label}相互冲突`);
  }
  return conflicts;
}
function inferUseCases(input: string): string[] {
  const mappings: Array<[string, string[]]> = [
    ["山区巡检", ["山区", "山地", "复杂地形"]], ["电力巡检", ["电力", "电网", "输电", "杆塔"]], ["应急保障", ["应急", "救援", "保障"]],
    ["物资投送", ["投送", "运输", "物资"]], ["测绘", ["测绘", "勘察", "建模"]], ["轻量航拍", ["航拍", "摄影", "视频"]], ["园区巡检", ["园区", "厂区"]],
  ];
  return mappings.filter(([, keywords]) => keywords.some((keyword) => input.includes(keyword))).map(([useCase]) => useCase);
}

export class DemoAIPlatformAdapter implements AIPlatformPort {
  readonly portKind = "ai-platform" as const;
  readonly capabilities = ["understanding"] as const;
  async understandComparisonRequest(request: AgentInvokeRequest): Promise<ComparisonIntent> {
    const input = request.input.trim();
    const contextIds = Array.isArray(request.context?.product_ids) ? request.context.product_ids.filter((item): item is string => typeof item === "string") : [];
    const requestedProductIds = new Set(contextIds);
    for (const product of DEMO_PRODUCT_CATALOG) if (product.aliases.some((alias) => input.toLowerCase().includes(alias.toLowerCase()))) requestedProductIds.add(product.id);
    const budget = parseBudget(input);
    const budgetYuan = budget.value;
    const hardConstraints: HardConstraint[] = [];
    if (budgetYuan !== null) addConstraint(hardConstraints, { dimension: "priceYuan", operator: "lte", value: budgetYuan, label: `预算不超过${Number((budgetYuan / 10000).toFixed(2))}万元` });
    for (const constraint of parseQuantityConstraints(input, "enduranceMinutes", "续航", "(?:续航|航时)", { 小时: { factor: 60, canonicalUnit: "分钟" }, 时: { factor: 60, canonicalUnit: "分钟" }, 分钟: { factor: 1, canonicalUnit: "分钟" }, 分: { factor: 1, canonicalUnit: "分钟" } })) addConstraint(hardConstraints, constraint);
    for (const constraint of parseQuantityConstraints(input, "payloadKg", "有效载荷", "(?:有效载荷|载荷|负载|挂载)", { 公斤: { factor: 1, canonicalUnit: "公斤" }, 千克: { factor: 1, canonicalUnit: "公斤" }, kg: { factor: 1, canonicalUnit: "公斤" }, 克: { factor: 0.001, canonicalUnit: "公斤" }, g: { factor: 0.001, canonicalUnit: "公斤" } })) addConstraint(hardConstraints, constraint);
    for (const constraint of parseQuantityConstraints(input, "windResistanceMps", "抗风能力", "(?:抗风|风速)", { "米/秒": { factor: 1, canonicalUnit: "米/秒" }, "m/s": { factor: 1, canonicalUnit: "米/秒" }, "公里/小时": { factor: 1 / 3.6, canonicalUnit: "米/秒" }, "km/h": { factor: 1 / 3.6, canonicalUnit: "米/秒" } })) addConstraint(hardConstraints, constraint);
    for (const constraint of parseQuantityConstraints(input, "maxOperatingAltitudeM", "最大作业海拔", "(?:最大作业海拔|作业海拔|海拔|作业高度)", { 米: { factor: 1, canonicalUnit: "米" }, m: { factor: 1, canonicalUnit: "米" }, 千米: { factor: 1000, canonicalUnit: "米" }, 公里: { factor: 1000, canonicalUnit: "米" } })) addConstraint(hardConstraints, constraint);
    for (const constraint of parseQuantityConstraints(input, "deliveryDays", "交付周期", "(?:交付|到货)", { 天: { factor: 1, canonicalUnit: "天" }, 日: { factor: 1, canonicalUnit: "天" }, 周: { factor: 7, canonicalUnit: "天" }, 星期: { factor: 7, canonicalUnit: "天" } })) addConstraint(hardConstraints, constraint);
    for (const constraint of parseQuantityConstraints(input, "warrantyMonths", "质保期", "(?:质保|保修)", { 个月: { factor: 1, canonicalUnit: "个月" }, 月: { factor: 1, canonicalUnit: "个月" }, 年: { factor: 12, canonicalUnit: "个月" } })) addConstraint(hardConstraints, constraint);
    const requested = parseRequestedFeatures(input);
    const focusDimensions = focusKeywords.filter(([, keywords]) => keywords.some((keyword) => input.includes(keyword))).map(([dimension]) => dimension);
    for (const constraint of hardConstraints) if (!focusDimensions.includes(constraint.dimension)) focusDimensions.push(constraint.dimension);
    const useCases = inferUseCases(input);
    const inputConflicts = findInputConflicts(hardConstraints);
    const unknownContextIds = contextIds.filter((id) => !DEMO_PRODUCT_CATALOG.some((product) => product.id === id));
    if (unknownContextIds.length) inputConflicts.push(`上下文中的产品编号无法识别：${unknownContextIds.join("、")}`);
    const hasComparisonSignal = /对比|比较|型号|产品|无人机|推荐|选型|选购/.test(input);
    const decisionRequested = /推荐|选型|选购|首选|哪款|哪个更|更适合|选择|建议|合适型号|有.{0,6}合适|满足条件的型号/.test(input);
    const singleProductComparison = /对比|比较/.test(input) && requestedProductIds.size === 1;
    const needsClarification = budget.ambiguous || inputConflicts.length > 0 || singleProductComparison || !hasComparisonSignal || (requestedProductIds.size === 0 && useCases.length === 0 && focusDimensions.length === 0 && requested.features.length === 0 && requested.unverified.length === 0);
    const clarificationMessage = budget.ambiguous ? "预算金额缺少单位，请明确填写“元”或“万元”。" : inputConflicts.length ? `输入条件需要确认：${inputConflicts.join("；")}。` : singleProductComparison ? "当前只识别到一个型号，请至少补充另一个型号，或改为说明用途和选型条件。" : needsClarification ? "请补充要比较的型号，或说明用途、预算、载荷、续航等选型条件。" : null;
    return { requestedProductIds: [...requestedProductIds].filter((id) => DEMO_PRODUCT_CATALOG.some((product) => product.id === id)), useCases, budgetYuan, focusDimensions, hardConstraints, requestedFeatures: requested.features, unverifiedConditions: requested.unverified, inputConflicts, decisionRequested, needsClarification, clarificationMessage };
  }
}

export class MockBusinessDataAdapter implements BusinessDataPort {
  readonly portKind = "domain-data" as const;
  readonly domain = "product" as const;
  async listProducts() { return DEMO_PRODUCT_CATALOG.map((product) => structuredClone(product)); }
  async getProducts(ids: string[]) { const wanted = new Set(ids); return DEMO_PRODUCT_CATALOG.filter((product) => wanted.has(product.id)).map((product) => structuredClone(product)); }
}
