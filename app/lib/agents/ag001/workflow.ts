import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import {
  AgentInvokeRequestSchema,
  AgentInvokeResponseSchema,
  ComparisonTableRowSchema,
  type AgentComparisonOutput,
  type AgentInvokeRequest,
  type AgentInvokeResponse,
  type ComparisonTableRow,
} from "../../contracts";
import { executeWithPolicy } from "../../reliability";
import type { RequestIdentity } from "../../request-identity";
import { AG001_CONFIG } from "./config";
import { buildComparisonTable, evaluateProducts, selectCandidates } from "./engine";
import { getAg001ProviderRevision, resolveAg001Dependencies, type Ag001Dependencies } from "./providers";
import {
  ComparisonIntentSchema,
  DemoProductSchema,
  ProductEvaluationSchema,
  type ComparisonIntent,
  type DemoProduct,
} from "./types";

const TraceStepSchema = z.object({ name: z.string(), detail: z.string() });

const Ag001GraphState = new StateSchema({
  request: AgentInvokeRequestSchema,
  traceId: z.string(),
  intent: ComparisonIntentSchema.optional(),
  candidates: z.array(DemoProductSchema).optional(),
  evaluations: z.array(ProductEvaluationSchema).optional(),
  comparisonTable: z.array(ComparisonTableRowSchema).optional(),
  conflicts: z.array(z.string()).optional(),
  missingData: z.array(z.string()).optional(),
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
      deliveryDays: "交付周期", warrantyMonths: "质保期",
    })[dimension]),
    hard_constraints: intent.hardConstraints.map((constraint) => constraint.label),
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
    const candidates = selectCandidates(catalog, intent, state.request.input);
    return {
      candidates,
      trace: appendTrace(state, "检索候选产品", `通过 ${dependencies.providerName} BusinessDataPort 获取${candidates.length}个候选型号。`),
    };
  };

  const normalizeParameters = (state: typeof Ag001GraphState.State) => {
    const candidates = state.candidates ?? [];
    const missingData = candidates.length ? [] : ["没有找到与输入匹配的样例产品型号"];
    return {
      missingData,
      comparisonTable: candidates.length ? buildComparisonTable(candidates) : [],
      trace: appendTrace(state, "统一参数口径", candidates.length
        ? "已统一价格、续航、载荷、抗风、交付和质保字段及单位。"
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
      trace: appendTrace(state, "执行约束与评分", `完成${state.intent?.hardConstraints.length ?? 0}项硬约束校验和可解释偏好排序。`),
    };
  };

  const buildResponse = (state: typeof Ag001GraphState.State) => {
    const evaluations = state.evaluations ?? [];
    const eligible = evaluations.filter((evaluation) => evaluation.eligible);
    const primary = eligible[0] ?? null;
    const candidates = state.candidates ?? [];
    const conflicts = state.conflicts ?? [];
    const missingData = state.missingData ?? [];
    const recommendationReason = primary
      ? `${primary.product.name}在当前条件下综合排序最高；${primary.advantages[0] ?? primary.scenarioFit}`
      : missingData.length
        ? "当前没有可用于比较的样例数据，请调整型号或输入条件。"
        : "当前候选均未通过全部硬约束，因此不生成强行推荐。";
    const productOrder = evaluations.map((evaluation) => evaluation.product.id);
    const orderedTable: ComparisonTableRow[] = (state.comparisonTable ?? []).map((row) => ({
      ...row,
      values: productOrder.flatMap((productId) => {
        const value = row.values.find((item) => item.product_id === productId);
        return value ? [value] : [];
      }),
    }));

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
      })),
      table: orderedTable,
      recommendation: {
        primary_product_id: primary?.product.id ?? null,
        primary_product_name: primary?.product.name ?? null,
        reason: recommendationReason,
        alternative_product_ids: eligible.slice(1, 3).map((evaluation) => evaluation.product.id),
      },
      conflicts,
      missing_data: missingData,
      data_notice: dependencies.environment === "demo"
        ? "当前结果仅基于虚构样例产品和 Mock 规则生成，不代表正式商品、价格、库存或采购结论。"
        : "当前结果基于已接入的数据源与规则生成；涉及采购、价格、库存和适用性的结论仍需按业务流程复核。",
      rule_version: AG001_CONFIG.ruleVersion,
    };

    const response: AgentInvokeResponse = {
      request_id: `AG001-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-001",
      status: primary ? "completed" : "needs_review",
      environment: dependencies.environment,
      output: {
        title: primary ? "产品型号智能比较结果" : "候选条件冲突，需要调整",
        summary: primary
          ? `已完成${candidates.length}个样例型号的参数归一、硬约束校验和场景化比较。`
          : recommendationReason,
        points: primary
          ? [recommendationReason, primary.scenarioFit, conflicts.length ? `另发现${conflicts.length}条条件冲突，详见结果面板。` : "当前候选未发现硬性条件冲突。"]
          : [recommendationReason, ...conflicts.slice(0, 2)],
        evidence: [...new Set(candidates.map((product) => `${product.source} · ${product.updatedAt}`)), AG001_CONFIG.ruleVersion],
        comparison,
      },
      trace: appendTrace(state, "校验证据并生成建议", primary ? "推荐结论已绑定样例参数、规则和限制条件。" : "证据不足或硬约束冲突，已按规则降级。"),
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
