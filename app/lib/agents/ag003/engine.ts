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

function evaluateProduct(product: DemoProduct, intent: RecommendationIntent): RecommendationEvaluation {
  const failures = intent.hardConstraints.map((constraint) => constraintFailure(product, constraint)).filter((item): item is string => Boolean(item));
  const matchedScenarios = scenarioMatches(product.scenarios, intent.useCases);
  const matchedTags = [...matchedScenarios];
  if (intent.focusTags.includes("抗风") && product.windResistanceMps >= 12) matchedTags.push("抗风");
  if (intent.focusTags.includes("长续航") && product.enduranceMinutes >= 45) matchedTags.push("长续航");
  if (intent.focusTags.includes("重载") && product.payloadKg >= 3) matchedTags.push("重载");
  if (intent.focusTags.includes("快速交付") && product.deliveryDays <= 14) matchedTags.push("快速交付");
  if (intent.experienceLevel === "beginner" && product.category.includes("入门")) matchedTags.push("新手友好");
  const queryMatched = intent.queryTerms.some((term) => product.aliases.some((alias) => alias.replace(/\s/g, "").toLowerCase().includes(term.replace(/\s/g, "").toLowerCase())));
  if (queryMatched) matchedTags.push("型号匹配");
  let score = 45 + matchedScenarios.length * 14 + matchedTags.length * 5;
  if (queryMatched) score += 28;
  if (intent.experienceLevel === "beginner" && product.priceYuan <= 30_000) score += 12;
  if (intent.experienceLevel === "beginner" && product.trainingIncluded) score += 5;
  if (failures.length) score = Math.min(score, 45) - failures.length * 8;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const reason = matchedTags.length
    ? `匹配${[...new Set(matchedTags)].join("、")}；样例价${(product.priceYuan / 10_000).toFixed(1)}万元。`
    : `当前仅形成基础类目候选；样例价${(product.priceYuan / 10_000).toFixed(1)}万元。`;
  return {
    id: product.id, name: product.name, candidateType: "product", category: product.category, score,
    eligible: failures.length === 0, priceYuan: product.priceYuan, matchedTags: [...new Set(matchedTags)],
    limitations: failures.length ? failures : [product.description], reason, source: product.source,
  };
}

function evaluateSolution(solution: ScenarioSolution, intent: RecommendationIntent): RecommendationEvaluation {
  const failures = intent.hardConstraints.map((constraint) => constraintFailure(solution, constraint)).filter((item): item is string => Boolean(item));
  const matchedScenarios = scenarioMatches([solution.scenario, ...solution.tags], intent.useCases);
  const matchedTags = [...matchedScenarios, ...intent.focusTags.filter((tag) => solution.tags.includes(tag))];
  let score = 42 + matchedScenarios.length * 16 + matchedTags.length * 6;
  if (failures.length) score = Math.min(score, 45) - failures.length * 8;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    id: solution.id, name: solution.name, candidateType: "scenario_solution", category: solution.category, score,
    eligible: failures.length === 0, priceYuan: solution.priceYuan, matchedTags: [...new Set(matchedTags)],
    limitations: [...failures, ...solution.limitations],
    reason: `${solution.summary}${matchedTags.length ? ` 主要匹配：${[...new Set(matchedTags)].join("、")}。` : ""}`,
    source: solution.source,
  };
}

export function evaluateRecommendation(intent: RecommendationIntent, catalog: Ag003Catalog): RecommendationEvaluation[] {
  const evaluations = intent.mode === "scenario_solution"
    ? catalog.solutions.map((solution) => evaluateSolution(solution, intent))
    : catalog.products.map((product) => evaluateProduct(product, intent));
  return evaluations.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.priceYuan - b.priceYuan).slice(0, AG003_CONFIG.maxCandidates);
}

function toCandidate(item: RecommendationEvaluation): RecommendationCandidate {
  return {
    id: item.id, name: item.name, candidate_type: item.candidateType, category: item.category, score: item.score,
    eligible: item.eligible, price_yuan: item.priceYuan, matched_tags: item.matchedTags,
    limitations: item.limitations, reason: item.reason, source: item.source,
  };
}

export function buildRecommendationOutput(intent: RecommendationIntent, evaluations: RecommendationEvaluation[]): AgentRecommendationOutput {
  const eligible = evaluations.filter((item) => item.eligible);
  const primary = eligible[0] ?? null;
  const gaps = primary
    ? primary.limitations.filter((item) => /正式|真实|需|不含|未包含/.test(item))
    : [...new Set(evaluations.flatMap((item) => item.limitations))];
  return {
    engine: "langgraph-demo",
    mode: intent.mode,
    intent: {
      use_cases: intent.useCases, budget_yuan: intent.budgetYuan, focus_tags: intent.focusTags,
      query_terms: intent.queryTerms, corrected_terms: intent.correctedTerms, experience_level: intent.experienceLevel,
      hard_constraints: intent.hardConstraints.map((item) => item.label),
    },
    solution_candidates: evaluations.filter((item) => item.candidateType === "scenario_solution").map(toCandidate),
    product_candidates: evaluations.filter((item) => item.candidateType === "product").map(toCandidate),
    recommendation: {
      primary_id: primary?.id ?? null, primary_name: primary?.name ?? null, primary_type: primary?.candidateType ?? null,
      reason: primary ? primary.reason : "样例目录中没有同时满足全部硬条件的候选，已停止强行推荐并列出主要差距。",
      alternative_ids: eligible.slice(1, 3).map((item) => item.id),
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
