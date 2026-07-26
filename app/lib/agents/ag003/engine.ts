import type { AgentRecommendationOutput, RecommendationCandidate } from "../../contracts";
import type { DemoProduct, HardConstraint, NumericDimension } from "../ag001/types";
import { AG003_CAPABILITY_COVERAGE } from "./catalog";
import { AG003_CONFIG } from "./config";
import type { Ag003Catalog, RecommendationEvaluation, RecommendationIntent, ScenarioSolution } from "./types";

function numericValue(item: DemoProduct | ScenarioSolution, dimension: NumericDimension): number | null {
  if (dimension === "priceYuan" || dimension === "enduranceMinutes" || dimension === "payloadKg" || dimension === "windResistanceMps") return item[dimension];
  if ("deliveryDays" in item && (dimension === "deliveryDays" || dimension === "warrantyMonths")) return item[dimension];
  return null;
}

function constraintFailure(item: DemoProduct | ScenarioSolution, constraint: HardConstraint): string | null {
  const actual = numericValue(item, constraint.dimension);
  if (actual === null) return `缺少“${constraint.label}”对应的样例数据`;
  const passed = constraint.operator === "gte" ? actual >= constraint.value : actual <= constraint.value;
  return passed ? null : `未满足${constraint.label}`;
}

function scenarioMatches(candidateScenarios: string[], requested: string[]): string[] {
  return requested.filter((request) => candidateScenarios.some((candidate) => candidate === request || candidate.includes(request) || request.includes(candidate)));
}

function productMatchesTag(product: DemoProduct, tag: string): boolean {
  if (tag === "抗风") return product.windResistanceMps >= 12;
  if (tag === "长续航") return product.enduranceMinutes >= 45;
  if (tag === "重载") return product.payloadKg >= 3;
  if (tag === "快速交付") return product.deliveryDays <= 14;
  if (tag === "便携") return product.payloadKg <= 1.5;
  if (tag === "新手友好") return product.category.includes("入门") || product.trainingIncluded;
  if (tag === "专业作业") return !product.category.includes("入门");
  return false;
}

function evaluateProduct(product: DemoProduct, intent: RecommendationIntent): RecommendationEvaluation {
  const hardFailures = intent.hardConstraints.map((constraint) => constraintFailure(product, constraint)).filter((item): item is string => Boolean(item));
  const matchedScenarios = scenarioMatches(product.scenarios, intent.useCases);
  const matchedTags = [...matchedScenarios];
  for (const tag of intent.focusTags) if (productMatchesTag(product, tag)) matchedTags.push(tag);
  if (intent.experienceLevel === "beginner" && product.category.includes("入门")) matchedTags.push("新手友好");
  const requestMatch = intent.requestedProductIds.length === 0 || intent.requestedProductIds.includes(product.id);
  if (requestMatch && intent.requestedProductIds.length) matchedTags.push("目标型号");
  const suitabilityFailures: string[] = [];
  if (intent.useCases.length && !matchedScenarios.length) suitabilityFailures.push(`产品适用场景未覆盖${intent.useCases.join("、")}`);
  for (const tag of intent.excludedFocusTags) {
    if (productMatchesTag(product, tag)) suitabilityFailures.push(`用户已排除“${tag}”特征`);
  }
  const failures = [...hardFailures, ...suitabilityFailures];
  let score = 45 + matchedScenarios.length * 14 + matchedTags.length * 5;
  if (requestMatch && intent.requestedProductIds.length) score += 28;
  if (intent.inferredCategories.some((category) => product.category === category)) score += 8;
  if (intent.experienceLevel === "beginner" && product.priceYuan <= 30_000) score += 12;
  if (intent.experienceLevel === "beginner" && product.trainingIncluded) score += 5;
  if (failures.length) score -= failures.length * 18;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const reason = matchedTags.length
    ? `${product.description} 匹配${[...new Set(matchedTags)].join("、")}；样例价${(product.priceYuan / 10_000).toFixed(1)}万元。`
    : `${product.description} 当前仅形成基础类目候选；样例价${(product.priceYuan / 10_000).toFixed(1)}万元。`;
  const suitableConditions = [`适用场景：${product.scenarios.join("、")}`, product.trainingIncluded ? "包含样例培训支持" : "未包含样例培训支持"];
  return {
    id: product.id, name: product.name, candidateType: "product", category: product.category, score,
    eligible: failures.length === 0, priceYuan: product.priceYuan, matchedTags: [...new Set(matchedTags)],
    limitations: failures, requestMatch, suitableConditions,
    conditionAssessment: failures.length ? `未通过：${failures.join("；")}` : `通过硬条件与${matchedScenarios.length ? "场景" : "基础类目"}适配检查。`,
    reason, source: product.source,
  };
}

function evaluateSolution(solution: ScenarioSolution, intent: RecommendationIntent): RecommendationEvaluation {
  const hardFailures = intent.hardConstraints.map((constraint) => constraintFailure(solution, constraint)).filter((item): item is string => Boolean(item));
  const matchedScenarios = scenarioMatches([solution.scenario, ...solution.tags], intent.useCases);
  const matchedTags = [...matchedScenarios, ...intent.focusTags.filter((tag) => solution.tags.includes(tag))];
  const requestMatch = intent.requestedProductIds.length === 0 || intent.requestedProductIds.every((id) => solution.productIds.includes(id));
  if (requestMatch && intent.requestedProductIds.length) matchedTags.push("包含目标型号");
  const suitabilityFailures: string[] = [];
  if (intent.useCases.length && !matchedScenarios.length) suitabilityFailures.push(`方案适用场景未覆盖${intent.useCases.join("、")}`);
  if (intent.experienceLevel === "beginner" && solution.tags.includes("专业作业")) suitabilityFailures.push("方案要求专业作业能力，不适合作为新手方案直接推荐");
  for (const tag of intent.excludedFocusTags) {
    if (solution.tags.includes(tag)) suitabilityFailures.push(`用户已排除“${tag}”特征`);
  }
  const failures = [...hardFailures, ...suitabilityFailures];
  let score = 42 + matchedScenarios.length * 16 + matchedTags.length * 6;
  if (requestMatch && intent.requestedProductIds.length) score += 24;
  if (failures.length) score -= failures.length * 18;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    id: solution.id, name: solution.name, candidateType: "scenario_solution", category: solution.category, score,
    eligible: failures.length === 0, priceYuan: solution.priceYuan, matchedTags: [...new Set(matchedTags)],
    limitations: [...failures, ...solution.limitations], requestMatch, suitableConditions: solution.suitableConditions,
    conditionAssessment: failures.length
      ? `未通过：${failures.join("；")}`
      : `通过场景、实施能力和关键约束检查；适用条件包括${solution.suitableConditions.join("、")}。`,
    reason: `${solution.summary}${matchedTags.length ? ` 主要匹配：${[...new Set(matchedTags)].join("、")}。` : ""}`,
    source: solution.source,
  };
}

export function evaluateRecommendation(intent: RecommendationIntent, catalog: Ag003Catalog): RecommendationEvaluation[] {
  const evaluations = intent.mode === "scenario_solution"
    ? catalog.solutions.map((solution) => evaluateSolution(solution, intent))
    : catalog.products.map((product) => evaluateProduct(product, intent));
  return evaluations.sort((a, b) => Number(b.requestMatch) - Number(a.requestMatch) || Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.priceYuan - b.priceYuan).slice(0, AG003_CONFIG.maxCandidates);
}

function toCandidate(item: RecommendationEvaluation): RecommendationCandidate {
  return {
    id: item.id, name: item.name, candidate_type: item.candidateType, category: item.category, score: item.score,
    eligible: item.eligible, price_yuan: item.priceYuan, matched_tags: item.matchedTags,
    limitations: item.limitations, request_match: item.requestMatch, suitable_conditions: item.suitableConditions,
    condition_assessment: item.conditionAssessment, reason: item.reason, source: item.source,
  };
}

export function buildRecommendationOutput(intent: RecommendationIntent, evaluations: RecommendationEvaluation[]): AgentRecommendationOutput {
  const eligible = evaluations.filter((item) => item.eligible);
  const primary = eligible.find((item) => item.requestMatch) ?? null;
  const alternatives = eligible.filter((item) => item.id !== primary?.id).slice(0, 2);
  const explicitTargetFailed = intent.requestedProductIds.length > 0 && !primary;
  const gaps = primary
    ? primary.limitations.filter((item) => /正式|真实|需|不含|未包含/.test(item))
    : [...new Set(evaluations.filter((item) => item.requestMatch).flatMap((item) => item.limitations))];
  return {
    engine: "langgraph-demo",
    mode: intent.mode,
    intent: {
      use_cases: intent.useCases, budget_yuan: intent.budgetYuan, focus_tags: intent.focusTags,
      ignored_focus_tags: intent.ignoredFocusTags, excluded_focus_tags: intent.excludedFocusTags,
      inferred_categories: intent.inferredCategories, query_terms: intent.queryTerms,
      requested_product_ids: intent.requestedProductIds, corrected_terms: intent.correctedTerms, experience_level: intent.experienceLevel,
      hard_constraints: intent.hardConstraints.map((item) => item.label),
    },
    solution_candidates: evaluations.filter((item) => item.candidateType === "scenario_solution").map(toCandidate),
    product_candidates: evaluations.filter((item) => item.candidateType === "product").map(toCandidate),
    recommendation: {
      primary_id: primary?.id ?? null, primary_name: primary?.name ?? null, primary_type: primary?.candidateType ?? null,
      reason: primary
        ? primary.reason
        : explicitTargetFailed
          ? "目标型号或包含目标型号的方案未通过当前硬条件与适用条件检查，已停止用其他候选顶替目标，并单独列出可行备选。"
          : "样例目录中没有同时满足全部硬条件和适用条件的候选，已停止强行推荐并列出主要差距。",
      alternative_ids: alternatives.map((item) => item.id),
    },
    gaps,
    missing_data: intent.mode === "scenario_solution"
      ? ["真实库存与上架状态", "载荷组合和实施服务报价", "正式空域与作业条件"]
      : ["真实库存与上架状态", "实时价格与交付信息", "正式商品标签与评价数据"],
    capability_coverage: AG003_CAPABILITY_COVERAGE.map(([requirement_id, capability, status]) => ({ requirement_id, capability, status })),
    data_notice: "全部方案、产品、价格和评分均为虚构 Mock 数据，仅用于 AG-003 技术演示；不代表商城真实商品、正式报价或采购建议。",
    rule_version: AG003_CONFIG.ruleVersion,
  };
}
