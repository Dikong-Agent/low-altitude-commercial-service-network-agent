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

function parseNumericConstraint(input: string, dimension: NumericDimension, label: string, keywords: string, unit: string): HardConstraint | null {
  const atLeast = input.match(new RegExp(`(?:${keywords})[^，。；]{0,12}(?:至少|不低于|不少于|>=|≥)\\s*(\\d+(?:\\.\\d+)?)`, "i"));
  if (atLeast) return { dimension, operator: "gte", value: Number(atLeast[1]), label: `${label}不低于${atLeast[1]}${unit}` };
  const atMost = input.match(new RegExp(`(?:${keywords})[^，。；]{0,12}(?:不超过|不高于|以内|<=|≤)\\s*(\\d+(?:\\.\\d+)?)`, "i"));
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

function inferFocusTags(input: string): string[] {
  const mappings: Array<[string, string[]]> = [
    ["抗风", ["抗风", "大风", "风速", "复杂环境"]],
    ["长续航", ["长续航", "续航", "航时"]],
    ["重载", ["重载", "载荷", "负载", "挂载"]],
    ["快速交付", ["快速交付", "尽快到货", "交付周期"]],
    ["便携", ["便携", "轻便", "携带"]],
    ["新手友好", ["新手", "入门", "初学"]],
    ["专业作业", ["专业", "行业", "作业"]],
  ];
  return mappings.filter(([, keywords]) => keywords.some((keyword) => input.includes(keyword))).map(([tag]) => tag);
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
    const queryTerms = new Set<string>(correctedTerms.map((item) => item.to));
    for (const product of DEMO_PRODUCT_CATALOG) {
      if (product.aliases.some((alias) => normalized.includes(normalize(alias)))) queryTerms.add(product.aliases[0]);
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
    const focusTags = inferFocusTags(input);
    const budget = parseBudget(input);
    const hardConstraints: HardConstraint[] = [];
    if (budget.value !== null) hardConstraints.push({ dimension: "priceYuan", operator: "lte", value: budget.value, label: `预算不超过${Math.round(budget.value / 10_000)}万元` });
    for (const constraint of [
      parseNumericConstraint(input, "enduranceMinutes", "续航", "续航|航时", "分钟"),
      parseNumericConstraint(input, "payloadKg", "有效载荷", "载荷|负载|挂载", "公斤"),
      parseNumericConstraint(input, "windResistanceMps", "抗风能力", "抗风|风速", "米/秒"),
    ]) if (constraint) hardConstraints.push(constraint);

    const experienceLevel = /新手|入门|初学/.test(input) ? "beginner" : /专业|行业作业|资深/.test(input) ? "professional" : "unspecified";
    const businessSignal = /推荐|导购|选购|如何选|找|搜索|产品|商品|无人机|型号|方案|航拍|巡检|测绘|应急/.test(input);
    const needsClarification = budget.ambiguous || (!imageRequested && !c2cRequested && !businessSignal)
      || (!imageRequested && !c2cRequested && !useCases.length && !focusTags.length && !queryTerms.size && budget.value === null);
    const clarificationMessage = budget.ambiguous
      ? "预算金额缺少单位，请明确填写“元”或“万元”。"
      : needsClarification
        ? "请补充想找的产品或方案，并说明用途、预算或关键条件。"
        : null;
    const adapterMessage = imageRequested
      ? "已识别为图片找货需求。当前演示未接入图片上传、视觉识别和正式商品可售状态，不能伪造识别结果。"
      : c2cRequested
        ? "已识别为 C2C 推荐需求。当前演示没有真实用户行为、卖家信用、在售状态和同城可达性数据，不能形成个性化推荐。"
        : null;

    return {
      mode, useCases, budgetYuan: budget.value, focusTags, queryTerms: [...queryTerms], correctedTerms,
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
