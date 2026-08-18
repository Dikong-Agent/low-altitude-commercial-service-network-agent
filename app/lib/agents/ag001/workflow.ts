import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import {
  AgentInvokeRequestSchema,
  AgentInvokeResponseSchema,
  AgentComparisonOutputSchema,
  ComparisonTableRowSchema,
  type AgentComparisonOutput,
  type AgentInvokeRequest,
  type AgentInvokeResponse,
  type ComparisonTableRow,
} from "../../contracts";
import { executeWithPolicy } from "../../reliability";
import type { RequestIdentity } from "../../request-identity";
import { rankLegacyKnowledge } from "../../rag/legacy-bridge";
import { RagAugmentationSchema } from "../../rag/contracts";
import { toAgentRagRuntime } from "../../rag/output";
import { AG001_CONFIG } from "./config";
import { analyzeParameterQuality, buildComparisonTable, evaluateProducts, selectCandidates } from "./engine";
import { getAg001ProviderRevision, resolveAg001Dependencies, type Ag001Dependencies } from "./providers";
import {
  ComparisonIntentSchema,
  DemoProductSchema,
  ProductEvaluationSchema,
  type ComparisonIntent,
  type DemoProduct,
} from "./types";

const TraceStepSchema = z.object({ name: z.string(), detail: z.string() });
const ParameterQualityReportSchema = AgentComparisonOutputSchema.shape.parameter_quality;

const Ag001GraphState = new StateSchema({
  request: AgentInvokeRequestSchema,
  traceId: z.string(),
  intent: ComparisonIntentSchema.optional(),
  candidates: z.array(DemoProductSchema).optional(),
  evaluations: z.array(ProductEvaluationSchema).optional(),
  comparisonTable: z.array(ComparisonTableRowSchema).optional(),
  conflicts: z.array(z.string()).optional(),
  missingData: z.array(z.string()).optional(),
  parameterQuality: ParameterQualityReportSchema.optional(),
  rag: RagAugmentationSchema.optional(),
  response: AgentInvokeResponseSchema.optional(),
  trace: z.array(TraceStepSchema).optional(),
});

function appendTrace(state: { trace?: Array<{ name: string; detail: string }> }, name: string, detail: string) {
  return [...(state.trace ?? []), { name, detail }];
}

function intentView(intent: ComparisonIntent, products: DemoProduct[]): AgentComparisonOutput["intent"] {
  return {
    product_names: products.map((product) => product.name),
    use_case: intent.useCases.length ? intent.useCases.join(" + ") : null,
    use_cases: intent.useCases,
    budget_yuan: intent.budgetYuan,
    focus_dimensions: intent.focusDimensions.map((dimension) => ({
      priceYuan: "价格", enduranceMinutes: "续航", payloadKg: "载荷", windResistanceMps: "抗风",
      maxOperatingAltitudeM: "最大作业海拔", deliveryDays: "交付周期", warrantyMonths: "质保期",
    })[dimension]),
    hard_constraints: intent.hardConstraints.map((constraint) => constraint.label),
    requested_features: intent.requestedFeatures.map((feature) => feature.label),
    unverified_conditions: intent.unverifiedConditions,
    decision_requested: intent.decisionRequested,
    comparison_mode: intent.decisionRequested ? "selection" : "neutral_comparison",
  };
}

export function createAg001Workflow(dependencies: Ag001Dependencies) {
  const understandRequest = async (state: typeof Ag001GraphState.State) => {
    const intent = await executeWithPolicy(
      "ag001.ai-platform",
      AG001_CONFIG.reliability.aiPlatform,
      (signal) => dependencies.aiPlatform.understandComparisonRequest(state.request, { signal }),
    );
    const understood = [
      intent.useCases.length ? `场景：${intent.useCases.join("、")}` : null,
      intent.budgetYuan !== null ? `预算：${Math.round(intent.budgetYuan / 10000)}万元` : null,
      intent.requestedProductIds.length ? `指定型号：${intent.requestedProductIds.length}个` : null,
      intent.focusDimensions.length ? `关注维度：${intent.focusDimensions.length}项` : null,
    ].filter(Boolean).join("；") || "尚未识别到有效选型条件";
    return { intent, trace: appendTrace(state, "理解比较目标", understood) };
  };

  const buildClarification = (state: typeof Ag001GraphState.State) => {
    const message = state.intent?.clarificationMessage ?? "请补充需要比较的型号或使用条件。";
    const response: AgentInvokeResponse = {
      request_id: `AG001-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-001",
      status: "needs_clarification",
      environment: dependencies.environment,
      output: {
        title: "需要补充选型条件",
        summary: message,
        points: ["可以直接输入两个样例型号，例如“云巡 X8 和山岳 T60”。", "也可以说明用途、预算、续航、载荷、抗风或交付要求。"],
        evidence: ["AG-001 输入完整性规则 v1.2"],
      },
      trace: appendTrace(state, "请求补充信息", "缺少可执行的型号或场景条件，工作流安全停止。"),
    };
    return { response, trace: response.trace };
  };

  const retrieveProducts = async (state: typeof Ag001GraphState.State) => {
    const intent = state.intent!;
    const catalog = await executeWithPolicy(
      "ag001.business-data",
      AG001_CONFIG.reliability.businessData,
      (signal) => intent.requestedProductIds.length
        ? dependencies.businessData.getProducts(intent.requestedProductIds, { signal })
        : dependencies.businessData.listProducts({ signal }),
    );
    const common = await rankLegacyKnowledge("AG-001", state.request.input, catalog.map((product) => ({
      id: product.id, title: product.name,
      content: [product.description, product.category, ...product.scenarios, `续航${product.enduranceMinutes}分钟`, `载荷${product.payloadKg}公斤`, `抗风${product.windResistanceMps}米每秒`, `质保${product.warrantyMonths}个月`].join(" "),
      sourceUri: product.source, domain: "product-master",
    })));
    const orderedCatalog = common.ranks.size ? [...catalog].sort((left, right) => (common.ranks.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (common.ranks.get(right.id) ?? Number.MAX_SAFE_INTEGER)) : catalog;
    const candidates = selectCandidates(orderedCatalog, intent, state.request.input);
    const candidateIds = new Set(candidates.map((product) => product.id));
    const focusedEvidence = common.evidence.filter((item) => [...candidateIds].some((id) => item.chunkId === id || item.chunkId.endsWith(`:${id}`))).slice(0, Math.max(2, candidates.length));
    const evidence = focusedEvidence.length ? focusedEvidence : common.evidence.slice(0, Math.max(2, candidates.length));
    const evidenceIds = new Set(evidence.map((item) => item.chunkId));
    const answer = common.answer ? {
      ...common.answer,
      claims: common.answer.claims.flatMap((claim) => {
        const evidenceChunkIds = claim.evidenceChunkIds.filter((id) => evidenceIds.has(id));
        return evidenceChunkIds.length ? [{ ...claim, evidenceChunkIds }] : [];
      }),
    } : undefined;
    return {
      candidates,
      rag: { status: common.status, answer, evidence, audit: common.audit },
      trace: appendTrace(state, "检索候选产品", `从产品数据接口获取${candidates.length}个候选型号，并检索相关知识依据。`),
    };
  };

  const normalizeParameters = (state: typeof Ag001GraphState.State) => {
    const candidates = state.candidates ?? [];
    const missingData = candidates.length ? [] : ["没有找到与输入匹配的样例产品型号"];
    const parameterQuality = analyzeParameterQuality(candidates, state.intent!);
    return {
      missingData,
      parameterQuality,
      comparisonTable: candidates.length ? buildComparisonTable(candidates) : [],
      trace: appendTrace(state, "统一参数口径", candidates.length
        ? `已从${parameterQuality.source_count}份资料提取并统一参数；发现${parameterQuality.conflict_items.length}项冲突、${parameterQuality.missing_items.length}项缺失。`
        : "没有可归一化的候选数据。"),
    };
  };

  const compareProducts = (state: typeof Ag001GraphState.State) => {
    const evaluations = evaluateProducts(state.candidates ?? [], state.intent!);
    const conflicts = evaluations.flatMap((evaluation) =>
      evaluation.constraintFailures.map((failure) => `${evaluation.product.name}：${failure}`),
    );
    if (evaluations.length && !evaluations.some((evaluation) => evaluation.eligible)) {
      conflicts.unshift("当前候选型号没有同时满足全部硬性条件。建议放宽一项条件或扩大候选范围。");
    }
    return {
      evaluations,
      conflicts,
      trace: appendTrace(state, "执行条件与评分", `完成${(state.intent?.hardConstraints.length ?? 0) + (state.intent?.requestedFeatures.length ?? 0)}项必要条件校验、场景覆盖判断和偏好排序。`),
    };
  };

  const buildResponse = (state: typeof Ag001GraphState.State) => {
    const evaluations = state.evaluations ?? [];
    const eligible = evaluations.filter((evaluation) => evaluation.eligible);
    const candidates = state.candidates ?? [];
    const parameterQuality = state.parameterQuality ?? { source_count: 0, normalized_conversions: [], missing_items: [], source_gap_items: [], conflict_items: [] };
    const conflicts = [
      ...(state.conflicts ?? []),
      ...parameterQuality.conflict_items.map((item) => `${item.product_name}：${item.detail}`),
    ];
    const missingData = [...(state.missingData ?? []), ...parameterQuality.missing_items.map((item) => `${item.product_name}：${item.detail}`)];
    const provisional = eligible[0] ?? null;
    const hasUnverifiedConditions = state.intent!.unverifiedConditions.length > 0;
    const qualityReviewRequired = Boolean(provisional) && (
      parameterQuality.conflict_items.some((item) => item.product_id === provisional?.product.id)
      || parameterQuality.missing_items.some((item) => item.product_id === provisional?.product.id)
    );
    const selectedPrimary = state.intent!.decisionRequested && !hasUnverifiedConditions && !qualityReviewRequired ? provisional : null;
    const decisionStatus: AgentComparisonOutput["decision_assessment"]["status"] = !candidates.length
      ? "insufficient_evidence"
      : !state.intent!.decisionRequested
        ? "comparison_only"
        : hasUnverifiedConditions || qualityReviewRequired
          ? "quality_review"
          : !provisional
            ? "no_eligible"
            : "recommended";
    const recommendationReason = !state.intent!.decisionRequested
      ? "本次输入要求参数比较，未要求选型推荐，因此仅呈现差异和适用边界，不指定首选型号。"
      : hasUnverifiedConditions
      ? `检测到${state.intent!.unverifiedConditions.length}项尚未核验的必要条件，暂不形成首选建议。`
      : qualityReviewRequired
        ? `${provisional?.product.name ?? "排序靠前的候选"}涉及会影响判断的参数冲突或缺失，完成来源复核前不形成首选建议。`
      : selectedPrimary
        ? `${selectedPrimary.product.name}在必要条件通过后综合排序最高；${selectedPrimary.scoreBreakdown.explanation[0]}，${selectedPrimary.advantages[0] ?? selectedPrimary.scenarioFit}`
      : missingData.length
        ? "当前没有可用于比较的样例数据，请调整型号或输入条件。"
        : "当前候选均未通过全部必要条件，因此不形成首选建议。";
    const productOrder = evaluations.map((evaluation) => evaluation.product.id);
    const orderedTable: ComparisonTableRow[] = (state.comparisonTable ?? []).map((row) => ({
      ...row,
      values: productOrder.flatMap((productId) => {
        const value = row.values.find((item) => item.product_id === productId);
        return value ? [value] : [];
      }),
    }));
    const hardKeys = new Set<string>(state.intent!.hardConstraints.map((item) => item.dimension));
    const focusKeys = new Set<string>(state.intent!.focusDimensions);
    const differenceAnalysis: AgentComparisonOutput["difference_analysis"] = orderedTable.flatMap((row) => {
      const displays = [...new Set(row.values.map((item) => item.display))];
      if (displays.length <= 1) return [];
      const quality = row.values.some((item) => item.quality_status === "conflict") ? "conflict" as const
        : row.values.some((item) => item.quality_status === "missing") ? "missing" as const
          : row.values.some((item) => item.quality_status === "master_only") ? "master_only" as const : "verified" as const;
      const leaders = row.best_product_ids.map((id) => candidates.find((product) => product.id === id)?.name).filter(Boolean).join("、");
      return [{ key: row.key, label: row.label, summary: leaders ? `${leaders}在“${row.label}”项处于本次候选前列。` : `${row.label}存在明显差异，需结合任务条件判断。`, decision_relevance: hardKeys.has(row.key) ? "required" as const : focusKeys.has(row.key) ? "priority" as const : "reference" as const, leading_product_ids: row.best_product_ids, quality_status: quality, source_refs: [...new Set(row.values.flatMap((item) => item.source_refs))] }];
    });
    const alternatives = eligible.filter((item) => item.product.id !== selectedPrimary?.product.id).slice(0, 2);

    const comparison: AgentComparisonOutput = {
      engine: dependencies.engine,
      intent: intentView(state.intent!, candidates),
      products: evaluations.map((evaluation) => ({
        id: evaluation.product.id,
        name: evaluation.product.name,
        category: evaluation.product.category,
        score: evaluation.score,
        eligible: evaluation.eligible,
        advantages: evaluation.advantages,
        limitations: evaluation.limitations,
        scenario_fit: evaluation.scenarioFit,
        constraint_checks: evaluation.constraintChecks.map((check) => ({
          label: check.label, passed: check.passed, actual: check.actual,
          determination: check.determination, evidence_status: check.evidenceStatus,
        })),
        capability_profile: {
          performance: evaluation.capabilityProfile.performance,
          cost_and_service: evaluation.capabilityProfile.costAndService,
          applicable_scenarios: evaluation.capabilityProfile.applicableScenarios,
          usage_limits: evaluation.capabilityProfile.usageLimits,
          evidence_refs: evaluation.capabilityProfile.evidenceRefs,
        },
        score_breakdown: {
          hard_constraint_passed: evaluation.scoreBreakdown.hardConstraintPassed,
          hard_constraint_total: evaluation.scoreBreakdown.hardConstraintTotal,
          scenario_score: evaluation.scoreBreakdown.scenarioScore,
          preference_score: evaluation.scoreBreakdown.preferenceScore,
          total: evaluation.scoreBreakdown.total,
          explanation: evaluation.scoreBreakdown.explanation,
        },
      })),
      table: orderedTable,
      recommendation: {
        primary_product_id: selectedPrimary?.product.id ?? null,
        primary_product_name: selectedPrimary?.product.name ?? null,
        reason: recommendationReason,
        alternative_product_ids: alternatives.map((evaluation) => evaluation.product.id),
        alternative_reasons: alternatives.map((evaluation) => ({
          product_id: evaluation.product.id, product_name: evaluation.product.name,
          why_not_primary: selectedPrimary ? `综合排序低于${selectedPrimary.product.name}；${evaluation.limitations[0] ?? "需结合实际任务复核"}` : "当前未形成首选，保留为待比较候选。",
          when_preferred: evaluation.advantages[0] ?? evaluation.scenarioFit,
        })),
      },
      decision_assessment: {
        status: decisionStatus,
        confidence: decisionStatus === "recommended" ? (parameterQuality.source_gap_items.length ? "medium" : "high") : decisionStatus === "comparison_only" ? "not_applicable" : decisionStatus === "quality_review" ? "low" : "not_applicable",
        reasons: [recommendationReason],
        sensitivity_notes: [
          ...parameterQuality.conflict_items.slice(0, 2).map((item) => `${item.product_name}${item.field}口径变化可能改变相对排序。`),
          ...parameterQuality.source_gap_items.slice(0, 2).map((item) => `${item.product_name}${item.field}目前仅有主数据值。`),
        ],
      },
      difference_analysis: differenceAnalysis,
      conflicts,
      missing_data: missingData,
      parameter_quality: parameterQuality,
      rag_runtime: toAgentRagRuntime(state.rag),
      capability_coverage: AG001_CONFIG.capabilityCoverage.map((item) => ({ ...item })),
      data_notice: dependencies.environment === "demo"
        ? "当前结果仅基于虚构样例产品和演示规则生成，不代表正式商品、价格、库存或采购结论。"
        : "当前结果基于已接入的数据源与规则生成；涉及采购、价格、库存和适用性的结论仍需按业务流程复核。",
      rule_version: AG001_CONFIG.ruleVersion,
    };

    const response: AgentInvokeResponse = {
      request_id: `AG001-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-001",
      status: decisionStatus === "recommended" || decisionStatus === "comparison_only" ? "completed" : "needs_review",
      environment: dependencies.environment,
      output: {
        title: decisionStatus === "comparison_only" ? "产品型号差异比较" : selectedPrimary ? "产品型号选型建议" : "选型条件需要补充或复核",
        summary: selectedPrimary || decisionStatus === "comparison_only"
          ? `已完成${candidates.length}个样例型号的参数统一、必要条件校验、差异分析和适用边界梳理。`
          : recommendationReason,
        points: selectedPrimary || decisionStatus === "comparison_only"
          ? [recommendationReason, selectedPrimary?.scenarioFit ?? "已完成候选型号差异分析，适用场景与限制条件见下方结果。", conflicts.length ? `另发现${conflicts.length}条条件冲突，详见结果面板。` : "当前候选未发现硬性条件冲突。"]
          : [recommendationReason, ...conflicts.slice(0, 2)],
        evidence: [...new Set(candidates.map((product) => `${product.source} · ${product.updatedAt}`)), AG001_CONFIG.ruleVersion],
        comparison,
      },
      trace: appendTrace(state, "校验依据并生成建议", decisionStatus === "recommended" ? "推荐结论已关联参数来源、规则和限制条件。" : decisionStatus === "comparison_only" ? "已按比较请求输出差异，不生成无依据的首选结论。" : "存在未核验条件、参数质量问题或必要条件冲突，已停止形成首选结论。"),
    };
    return { response, trace: response.trace };
  };

  return new StateGraph(Ag001GraphState)
    .addNode("understand_request", understandRequest)
    .addNode("clarify", buildClarification)
    .addNode("retrieve_products", retrieveProducts)
    .addNode("normalize_parameters", normalizeParameters)
    .addNode("compare_products", compareProducts)
    .addNode("build_response", buildResponse)
    .addEdge(START, "understand_request")
    .addConditionalEdges("understand_request", (state) => state.intent?.needsClarification ? "clarify" : "retrieve_products")
    .addEdge("clarify", END)
    .addEdge("retrieve_products", "normalize_parameters")
    .addEdge("normalize_parameters", "compare_products")
    .addEdge("compare_products", "build_response")
    .addEdge("build_response", END)
    .compile();
}

let cachedWorkflow: { providerName: string; revision: number; workflow: ReturnType<typeof createAg001Workflow> } | undefined;

function getDefaultWorkflow(identity?: RequestIdentity) {
  const providerName = process.env.AG001_PROVIDER ?? "demo";
  if (providerName === "production") return createAg001Workflow(resolveAg001Dependencies(providerName, identity));
  const revision = getAg001ProviderRevision();
  if (!cachedWorkflow || cachedWorkflow.providerName !== providerName || cachedWorkflow.revision !== revision) {
    cachedWorkflow = { providerName, revision, workflow: createAg001Workflow(resolveAg001Dependencies(providerName, identity)) };
  }
  return cachedWorkflow.workflow;
}

export async function invokeAg001(request: AgentInvokeRequest, traceId: string, identity?: RequestIdentity): Promise<AgentInvokeResponse> {
  const result = await getDefaultWorkflow(identity).invoke({ request, traceId, trace: [] });
  if (!result.response) throw new Error("AG-001 workflow completed without a response");
  return AgentInvokeResponseSchema.parse(result.response);
}
