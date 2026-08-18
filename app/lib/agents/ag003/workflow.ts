import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import { AgentInvokeRequestSchema, AgentInvokeResponseSchema, type AgentInvokeRequest, type AgentInvokeResponse } from "../../contracts";
import { executeWithPolicy } from "../../reliability";
import type { RequestIdentity } from "../../request-identity";
import { rankLegacyKnowledge } from "../../rag/legacy-bridge";
import { RagAugmentationSchema } from "../../rag/contracts";
import { toAgentRagRuntime } from "../../rag/output";
import { AG003_CONFIG } from "./config";
import { buildRecommendationOutput, evaluateRecommendation } from "./engine";
import { getAg003ProviderRevision, resolveAg003Dependencies, type Ag003Dependencies } from "./providers";
import { RecommendationEvaluationSchema, RecommendationIntentSchema, ScenarioSolutionSchema } from "./types";
import { DemoProductSchema } from "../ag001/types";

const TraceStepSchema = z.object({ name: z.string(), detail: z.string() });
const Ag003GraphState = new StateSchema({
  request: AgentInvokeRequestSchema,
  traceId: z.string(),
  intent: RecommendationIntentSchema.optional(),
  products: z.array(DemoProductSchema).optional(),
  solutions: z.array(ScenarioSolutionSchema).optional(),
  evaluations: z.array(RecommendationEvaluationSchema).optional(),
  rag: RagAugmentationSchema.optional(),
  response: AgentInvokeResponseSchema.optional(),
  trace: z.array(TraceStepSchema).optional(),
});

function appendTrace(state: { trace?: Array<{ name: string; detail: string }> }, name: string, detail: string) {
  return [...(state.trace ?? []), { name, detail }];
}

function buildStopResponse(
  state: typeof Ag003GraphState.State,
  environment: Ag003Dependencies["environment"],
  adapter = false,
) {
  const message = adapter ? state.intent?.adapterMessage : state.intent?.clarificationMessage;
  const imageBoundary = adapter && state.intent?.mode === "image_search";
  const c2cBoundary = adapter && state.intent?.mode === "c2c_recommendation";
  const response: AgentInvokeResponse = {
    request_id: `AG003-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    trace_id: state.traceId,
    agent_id: "AG-003",
    status: "needs_clarification",
    environment,
    output: {
      title: imageBoundary
        ? "图片找货暂需补充正式识别与商品数据"
        : c2cBoundary
          ? "二手商品推荐暂需补充正式业务数据"
          : "需要补充导购条件",
      summary: message ?? "请补充产品用途、预算或关键条件。",
      points: imageBoundary
        ? [
          "需先识别图片主体与产品特征，再结合正式商品目录核对相似候选和可售状态。",
          "在图片识别与商品数据接入前，暂不提供相似度排序或购买建议。",
        ]
        : c2cBoundary
          ? [
            "需结合真实在售商品、卖家信用、用户偏好和同城履约条件进行匹配。",
            "在相关业务数据接入前，暂不提供个性化二手商品推荐或交易可达性结论。",
          ]
          : ["可说明用途，例如山区电力巡检或入门航拍。", "可补充预算、抗风、续航、载荷等条件。"],
      evidence: [adapter ? "AG-003 能力边界规则 v1.0" : "AG-003 输入完整性规则 v1.0"],
    },
    trace: appendTrace(state, adapter ? "进入适配边界" : "请求补充信息", adapter ? "未调用不存在的正式依赖，安全停止。" : "未形成有效导购意图，安全停止。"),
  };
  return { response, trace: response.trace };
}

export function createAg003Workflow(dependencies: Ag003Dependencies) {
  const understandRequest = async (state: typeof Ag003GraphState.State) => {
    const intent = await executeWithPolicy("ag003.ai-platform-understanding", AG003_CONFIG.reliability.aiPlatform,
      (signal) => dependencies.aiPlatform.understandRecommendationRequest(state.request, { signal }));
    const understoodTrace = appendTrace(state, "理解导购需求", `识别为${intent.mode}，提取${intent.useCases.length}个场景、${intent.hardConstraints.length}条必要条件。`);
    return {
      intent,
      trace: [...understoodTrace, {
        name: "检查能力边界",
        detail: intent.adapterMessage ? "命中图片或 C2C 正式依赖边界。" : intent.needsClarification ? "输入信息不足，需要追问。" : "当前文本导购能力可安全运行。",
      }],
    };
  };

  const clarify = (state: typeof Ag003GraphState.State) => buildStopResponse(state, dependencies.environment, false);
  const adapterBoundary = (state: typeof Ag003GraphState.State) => buildStopResponse(state, dependencies.environment, true);

  const loadCatalog = async (state: typeof Ag003GraphState.State) => {
    if (state.intent?.mode === "scenario_solution") {
      const solutions = await executeWithPolicy("ag003.business-data-solutions", AG003_CONFIG.reliability.businessData,
        (signal) => dependencies.businessData.listScenarioSolutions({ signal }));
      return {
        products: [],
        solutions,
        trace: appendTrace(state, "加载样例目录", `从方案数据接口加载${solutions.length}个场景方案；本次未查询商品目录。`),
      };
    }
    const products = await executeWithPolicy("ag003.business-data-products", AG003_CONFIG.reliability.businessData,
      (signal) => dependencies.businessData.listProducts({ signal }));
    return {
      products,
      solutions: [],
      trace: appendTrace(state, "加载样例目录", `从商品数据接口加载${products.length}个商品；本次未查询场景方案目录。`),
    };
  };

  const rankCandidates = async (state: typeof Ag003GraphState.State) => {
    const records = state.intent?.mode === "scenario_solution"
      ? (state.solutions ?? []).map((item) => ({ id: item.id, title: item.name, content: [item.summary, item.scenario, ...item.tags, ...item.suitableConditions, ...item.limitations].join(" "), sourceUri: item.source, domain: "scenario-solution" }))
      : (state.products ?? []).map((item) => ({ id: item.id, title: item.name, content: [item.description, item.category, ...item.scenarios, `续航${item.enduranceMinutes}分钟`, `载荷${item.payloadKg}公斤`, `抗风${item.windResistanceMps}米每秒`].join(" "), sourceUri: item.source, domain: "product-catalog" }));
    const common = await rankLegacyKnowledge("AG-003", state.request.input, records);
    const evaluations = evaluateRecommendation(state.intent!, { products: state.products ?? [], solutions: state.solutions ?? [] })
      .sort((left, right) => (common.ranks.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (common.ranks.get(right.id) ?? Number.MAX_SAFE_INTEGER) || right.score - left.score);
    return { evaluations, rag: { status: common.status, answer: common.answer, evidence: common.evidence, audit: common.audit }, trace: appendTrace(state, "筛选并排序候选", `先核对必要条件，再对${evaluations.length}个候选进行知识检索和条件评分。`) };
  };

  const validateRecommendation = (state: typeof Ag003GraphState.State) => ({
    trace: appendTrace(state, "核验适用条件与差距", state.evaluations?.some((item) => item.eligible)
      ? "存在符合必要条件的候选，并保留真实库存、价格和实施条件等待确认信息。"
      : "没有候选通过全部必要条件，因此不形成首选建议。"),
  });

  const buildResponse = (state: typeof Ag003GraphState.State) => {
    const recommendation = { ...buildRecommendationOutput(state.intent!, state.evaluations ?? [], dependencies.engine), rag_runtime: toAgentRagRuntime(state.rag) };
    const primary = recommendation.recommendation.primary_name;
    const response: AgentInvokeResponse = {
      request_id: `AG003-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-003",
      status: primary ? "completed" : "needs_review",
      environment: dependencies.environment,
      output: {
        title: state.intent?.mode === "scenario_solution" ? "产品方案推荐结果" : "商品匹配结果",
        summary: primary ? `在当前演示目录中，首选为${primary}。正式采购前仍需核对上架状态、库存、价格和实施条件。` : recommendation.recommendation.reason,
        points: primary
          ? [recommendation.recommendation.reason, ...recommendation.gaps.slice(0, 2)]
          : recommendation.gaps.slice(0, 3),
        evidence: [...new Set((recommendation.solution_candidates.length ? recommendation.solution_candidates : recommendation.product_candidates).map((item) => item.source)), recommendation.rule_version],
        recommendation,
      },
      trace: appendTrace(state, "输出推荐依据", primary ? "输出首选、备选、匹配依据、限制和数据声明。" : "输出冲突与差距，不生成虚假首选。"),
    };
    return { response, trace: response.trace };
  };

  return new StateGraph(Ag003GraphState)
    .addNode("understand_request", understandRequest)
    .addNode("clarify", clarify)
    .addNode("adapter_boundary", adapterBoundary)
    .addNode("load_catalog", loadCatalog)
    .addNode("rank_candidates", rankCandidates)
    .addNode("validate_recommendation", validateRecommendation)
    .addNode("build_response", buildResponse)
    .addEdge(START, "understand_request")
    .addConditionalEdges("understand_request", (state) => state.intent?.adapterMessage ? "adapter_boundary" : state.intent?.needsClarification ? "clarify" : "load_catalog")
    .addEdge("clarify", END)
    .addEdge("adapter_boundary", END)
    .addEdge("load_catalog", "rank_candidates")
    .addEdge("rank_candidates", "validate_recommendation")
    .addEdge("validate_recommendation", "build_response")
    .addEdge("build_response", END)
    .compile();
}

let cachedWorkflow: { providerName: string; revision: number; workflow: ReturnType<typeof createAg003Workflow> } | undefined;

function getDefaultWorkflow(identity?: RequestIdentity) {
  const providerName = process.env.AG003_PROVIDER ?? "demo";
  if (providerName === "production") return createAg003Workflow(resolveAg003Dependencies(providerName, identity));
  const revision = getAg003ProviderRevision();
  if (!cachedWorkflow || cachedWorkflow.providerName !== providerName || cachedWorkflow.revision !== revision) {
    cachedWorkflow = { providerName, revision, workflow: createAg003Workflow(resolveAg003Dependencies(providerName)) };
  }
  return cachedWorkflow.workflow;
}

export async function invokeAg003(request: AgentInvokeRequest, traceId: string, identity?: RequestIdentity): Promise<AgentInvokeResponse> {
  const result = await getDefaultWorkflow(identity).invoke({ request, traceId, trace: [] });
  if (!result.response) throw new Error("AG-003 workflow completed without a response");
  return AgentInvokeResponseSchema.parse(result.response);
}
