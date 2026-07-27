import type { AgentInvokeRequest } from "../../contracts";
import { DEMO_PRODUCT_CATALOG } from "../ag001/catalog";
import type { DemoProduct, HardConstraint, NumericDimension } from "../ag001/types";
import { DEMO_SCENARIO_SOLUTIONS } from "./catalog";
import type { RecommendationIntent, ScenarioSolution } from "./types";

export interface AIPlatformPort {
  understandRecommendationRequest(request: AgentInvokeRequest, options?: { signal?: AbortSignal }): Promise<RecommendationIntent>;
}

export interface BusinessDataPort {
  listProducts(options?: { signal?: AbortSignal }): Promise<DemoProduct[]>;
  listScenarioSolutions(options?: { signal?: AbortSignal }): Promise<ScenarioSolution[]>;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s·_-]/g, "");
}

function parseBudget(input: string): { value: number | null; ambiguous: boolean } {
  const match = input.match(/预算[^\d]{0,8}(\d+(?:\.\d+)?)\s*(万(?:元)?|元)?/);
  if (!match) return { value: null, ambiguous: false };
  if (!match[2]) return { value: null, ambiguous: true };
  return { value: Math.round(Number(match[1]) * (match[2].startsWith("万") ? 10_000 : 1)), ambiguous: false };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatBudget(value: number): string {
  return value >= 10_000 ? `${formatNumber(value / 10_000)}万元` : `${formatNumber(value)}元`;
}

function parseNumericConstraint(input: string, dimension: NumericDimension, label: string, keywords: string, unit: string): HardConstraint | null {
  const keywordFirstAtLeast = new RegExp(`(?:${keywords})[^，。；]{0,12}(?:至少|不低于|不少于|>=|≥)\\s*(\\d+(?:\\.\\d+)?)`, "i");
  const operatorFirstAtLeast = new RegExp(`(?:至少|不低于|不少于|>=|≥)\\s*(?:${keywords})[^，。；\\d]{0,6}(\\d+(?:\\.\\d+)?)`, "i");
  const keywordFirstAtMost = new RegExp(`(?:${keywords})[^，。；]{0,12}(?:不超过|不高于|至多|以内|<=|≤)\\s*(\\d+(?:\\.\\d+)?)`, "i");
  const operatorFirstAtMost = new RegExp(`(?:不超过|不高于|至多|<=|≤)\\s*(?:${keywords})[^，。；\\d]{0,6}(\\d+(?:\\.\\d+)?)`, "i");
  const atLeast = input.match(keywordFirstAtLeast) ?? input.match(operatorFirstAtLeast);
  if (atLeast) return { dimension, operator: "gte", value: Number(atLeast[1]), label: `${label}不低于${atLeast[1]}${unit}` };
  const atMost = input.match(keywordFirstAtMost) ?? input.match(operatorFirstAtMost);
  if (atMost) return { dimension, operator: "lte", value: Number(atMost[1]), label: `${label}不超过${atMost[1]}${unit}` };
  return null;
}

function inferUseCases(input: string): string[] {
  const mappings: Array<[string, string[]]> = [
    ["山区巡检", ["山区", "山地", "复杂地形"]],
    ["电力巡检", ["电力", "电网", "杆塔", "输电"]],
    ["园区巡检", ["园区", "厂区"]],
    ["应急保障", ["应急", "救援", "保障"]],
    ["物资投送", ["投送", "运输", "物资"]],
    ["测绘", ["测绘", "勘察", "建模"]],
    ["轻量航拍", ["航拍", "摄影", "拍摄", "视频"]],
    ["培训教学", ["教学", "培训", "新手", "入门"]],
  ];
  return mappings.filter(([, keywords]) => keywords.some((keyword) => input.includes(keyword))).map(([useCase]) => useCase);
}

function keywordPolarity(input: string, keyword: string): "positive" | "ignored" | "excluded" | null {
  let cursor = 0;
  let result: "positive" | "ignored" | "excluded" | null = null;
  while (cursor < input.length) {
    const index = input.indexOf(keyword, cursor);
    if (index < 0) break;
    const prefix = input.slice(Math.max(0, index - 10), index);
    const suffix = input.slice(index + keyword.length, index + keyword.length + 8);
    if (/(?:不要|不需要|无需|不考虑|不必).{0,3}$/.test(prefix)) result ??= "excluded";
    else if (/(?:不强调|不看重).{0,3}$/.test(prefix) || /^.{0,3}(?:不是重点|不重要|不限)/.test(suffix)) result ??= "ignored";
    else return "positive";
    cursor = index + keyword.length;
  }
  return result;
}

function inferFocusTags(input: string): { focus: string[]; ignored: string[]; excluded: string[] } {
  const mappings: Array<[string, string[]]> = [
    ["抗风", ["抗风", "大风", "风速", "复杂环境"]],
    ["长续航", ["长续航", "续航", "航时"]],
    ["重载", ["重载", "载荷", "负载", "挂载"]],
    ["快速交付", ["快速交付", "尽快到货", "交付周期"]],
    ["便携", ["便携", "轻便", "携带"]],
    ["新手友好", ["新手", "入门", "初学"]],
    ["专业作业", ["专业", "行业", "作业"]],
  ];
  const focus: string[] = [];
  const ignored: string[] = [];
  const excluded: string[] = [];
  for (const [tag, keywords] of mappings) {
    const polarities = keywords.map((keyword) => keywordPolarity(input, keyword)).filter((item): item is "positive" | "ignored" | "excluded" => item !== null);
    if (polarities.includes("positive")) focus.push(tag);
    else if (polarities.includes("excluded")) excluded.push(tag);
    else if (polarities.includes("ignored")) ignored.push(tag);
  }
  return { focus, ignored, excluded };
}

function inferCategories(useCases: string[], experienceLevel: "beginner" | "professional" | "unspecified", mode: RecommendationIntent["mode"]): string[] {
  if (mode === "scenario_solution") {
    const categories = new Set<string>();
    if (useCases.some((item) => item.includes("应急") || item.includes("投送"))) categories.add("应急场景方案");
    if (useCases.some((item) => item.includes("巡检"))) categories.add("巡检场景方案");
    return [...categories];
  }
  const categories = new Set<string>();
  if (useCases.includes("轻量航拍") || useCases.includes("培训教学") || experienceLevel === "beginner") categories.add("入门航拍无人机");
  if (useCases.some((item) => item.includes("巡检"))) categories.add("行业巡检无人机");
  if (useCases.includes("测绘")) categories.add("测绘无人机");
  if (useCases.includes("应急保障") || useCases.includes("物资投送")) categories.add("应急保障无人机");
  return [...categories];
}

const corrections: Array<[string, string]> = [
  ["云训x8", "云巡X8"], ["云寻x8", "云巡X8"], ["山岳t6o", "山岳T60"], ["轻冀a2", "轻翼A2"], ["晴空cl", "晴空C1"],
];

export class DemoAIPlatformAdapter implements AIPlatformPort {
  async understandRecommendationRequest(request: AgentInvokeRequest): Promise<RecommendationIntent> {
    const input = request.input.trim();
    const normalized = normalize(input);
    const correctedTerms = corrections
      .filter(([from]) => normalized.includes(normalize(from)))
      .map(([from, to]) => ({ from, to }));
    const queryTerms = new Set<string>();
    const requestedProductIds = new Set<string>();
    for (const product of DEMO_PRODUCT_CATALOG) {
      const directMatch = product.aliases.some((alias) => normalized.includes(normalize(alias)));
      const correctedMatch = correctedTerms.some((item) => product.aliases.some((alias) => normalize(alias) === normalize(item.to)));
      if (directMatch || correctedMatch) {
        queryTerms.add(product.aliases[0]);
        requestedProductIds.add(product.id);
      }
    }

    const imageRequested = /图片|拍照|以图|上传图|相似商品/.test(input);
    const c2cRequested = /C2C|二手|同城|卖家|闲置|零件交易/i.test(input);
    const mode = imageRequested
      ? "image_search"
      : c2cRequested
        ? "c2c_recommendation"
        : /一套|方案|组合|成套/.test(input)
          ? "scenario_solution"
          : "product_search";
    const useCases = inferUseCases(input);
    const focusAnalysis = inferFocusTags(input);
    const budget = parseBudget(input);
    const hardConstraints: HardConstraint[] = [];
    if (budget.value !== null) hardConstraints.push({ dimension: "priceYuan", operator: "lte", value: budget.value, label: `预算不超过${formatBudget(budget.value)}` });
    for (const constraint of [
      parseNumericConstraint(input, "enduranceMinutes", "续航", "续航|航时", "分钟"),
      parseNumericConstraint(input, "payloadKg", "有效载荷", "载荷|负载|挂载|载重", "公斤"),
      parseNumericConstraint(input, "windResistanceMps", "抗风能力", "抗风|风速", "米/秒"),
    ]) if (constraint) hardConstraints.push(constraint);

    const experienceLevel = /新手|入门|初学/.test(input) ? "beginner" : /专业|行业作业|资深/.test(input) ? "professional" : "unspecified";
    const inferredCategories = inferCategories(useCases, experienceLevel, mode);
    for (const product of DEMO_PRODUCT_CATALOG) {
      if (requestedProductIds.has(product.id) && !inferredCategories.includes(product.category)) inferredCategories.push(product.category);
    }
    const businessSignal = /推荐|导购|选购|如何选|找|搜索|产品|商品|无人机|型号|方案|航拍|巡检|测绘|应急/.test(input);
    const needsClarification = budget.ambiguous || (!imageRequested && !c2cRequested && !businessSignal)
      || (!imageRequested && !c2cRequested && !useCases.length && !focusAnalysis.focus.length && !focusAnalysis.excluded.length && !requestedProductIds.size && budget.value === null);
    const clarificationMessage = budget.ambiguous
      ? "预算金额缺少单位，请明确填写“元”或“万元”。"
      : needsClarification
        ? "请补充想找的产品或方案，并说明用途、预算或关键条件。"
        : null;
    const adapterMessage = imageRequested
      ? "已识别为图片找货需求。当前演示尚未接入图片识别与正式商品可售信息，因此暂不生成相似商品推荐。"
      : c2cRequested
        ? "已识别为二手商品推荐需求。当前演示尚未接入真实在售信息、卖家信用、用户偏好和同城履约数据，因此暂不生成个性化推荐。"
        : null;

    return {
      mode, useCases, budgetYuan: budget.value, focusTags: focusAnalysis.focus,
      ignoredFocusTags: focusAnalysis.ignored, excludedFocusTags: focusAnalysis.excluded, inferredCategories,
      queryTerms: [...queryTerms], requestedProductIds: [...requestedProductIds], correctedTerms,
      experienceLevel, hardConstraints, needsClarification, clarificationMessage, adapterMessage,
    };
  }
}

export class MockBusinessDataAdapter implements BusinessDataPort {
  async listProducts(): Promise<DemoProduct[]> {
    return DEMO_PRODUCT_CATALOG.map((product) => ({ ...product, aliases: [...product.aliases], scenarios: [...product.scenarios] }));
  }

  async listScenarioSolutions(): Promise<ScenarioSolution[]> {
    return DEMO_SCENARIO_SOLUTIONS.map((solution) => ({
      ...solution, productIds: [...solution.productIds], tags: [...solution.tags],
      suitableConditions: [...solution.suitableConditions], limitations: [...solution.limitations],
    }));
  }
}
