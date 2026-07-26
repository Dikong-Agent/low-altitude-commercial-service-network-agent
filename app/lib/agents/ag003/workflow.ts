import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import { AgentInvokeRequestSchema, AgentInvokeResponseSchema, type AgentInvokeRequest, type AgentInvokeResponse } from "../../contracts";
import { executeWithPolicy } from "../../reliability";
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
  response: AgentInvokeResponseSchema.optional(),
  trace: z.array(TraceStepSchema).optional(),
});

function appendTrace(state: { trace?: Array<{ name: string; detail: string }> }, name: string, detail: string) {
  return [...(state.trace ?? []), { name, detail }];
}

function buildStopResponse(state: typeof Ag003GraphState.State, adapter = false) {
  const message = adapter ? state.intent?.adapterMessage : state.intent?.clarificationMessage;
  const response: AgentInvokeResponse = {
    request_id: `AG003-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    trace_id: state.traceId,
    agent_id: "AG-003",
    status: "needs_clarification",
    environment: "demo",
    output: {
      title: adapter ? "已识别需求，等待正式能力适配" : "需要补充导购条件",
      summary: message ?? "请补充产品用途、预算或关键条件。",
      points: adapter
        ? ["图片能力需接入 AIPlatformPort；C2C 需接入正式业务数据。", "当前不会用文字规则伪造视觉识别、在售状态或个性化推荐。"]
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
    const understoodTrace = appendTrace(state, "理解导购需求", `识别为${intent.mode}，提取${intent.useCases.length}个场景、${intent.hardConstraints.length}条硬条件。`);
    return {
      intent,
      trace: [...understoodTrace, {
        name: "检查能力边界",
        detail: intent.adapterMessage ? "命中图片或 C2C 正式依赖边界。" : intent.needsClarification ? "输入信息不足，需要追问。" : "当前文本导购能力可安全运行。",
      }],
    };
  };

  const clarify = (state: typeof Ag003GraphState.State) => buildStopResponse(state, false);
  const adapterBoundary = (state: typeof Ag003GraphState.State) => buildStopResponse(state, true);

  const loadCatalog = async (state: typeof Ag003GraphState.State) => {
    const [products, solutions] = await Promise.all([
      executeWithPolicy("ag003.business-data-products", AG003_CONFIG.reliability.businessData,
        (signal) => dependencies.businessData.listProducts({ signal })),
      executeWithPolicy("ag003.business-data-solutions", AG003_CONFIG.reliability.businessData,
        (signal) => dependencies.businessData.listScenarioSolutions({ signal })),
    ]);
    return { products, solutions, trace: appendTrace(state, "加载样例目录", `通过 ${dependencies.providerName} BusinessDataPort 加载${products.length}个产品和${solutions.length}个场景方案。`) };
  };

  const rankCandidates = (state: typeof Ag003GraphState.State) => {
    const evaluations = evaluateRecommendation(state.intent!, { products: state.products ?? [], solutions: state.solutions ?? [] });
    return { evaluations, trace: appendTrace(state, "筛选并排序候选", `先执行硬条件，再对${evaluations.length}个候选进行可解释评分。`) };
  };

  const validateRecommendation = (state: typeof Ag003GraphState.State) => ({
    trace: appendTrace(state, "核验适用条件与差距", state.evaluations?.some((item) => item.eligible)
      ? "存在通过硬条件的候选，并保留真实库存、价格和实施条件等缺口。"
      : "没有候选通过全部硬条件，拒绝强行推荐。"),
  });

  const buildResponse = (state: typeof Ag003GraphState.State) => {
    const recommendation = buildRecommendationOutput(state.intent!, state.evaluations ?? []);
    const primary = recommendation.recommendation.primary_name;
    const response: AgentInvokeResponse = {
      request_id: `AG003-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-003",
      status: primary ? "completed" : "needs_review",
      environment: "demo",
      output: {
        title: state.intent?.mode === "scenario_solution" ? "商城场景方案导购建议" : "商品搜索与分类推荐",
        summary: primary ? `基于当前虚构样例目录，首选为${primary}。正式采购前仍需核对真实上架、库存、价格与实施条件。` : recommendation.recommendation.reason,
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

function getDefaultWorkflow() {
  const providerName = process.env.AG003_PROVIDER ?? "demo";
  const revision = getAg003ProviderRevision();
  if (!cachedWorkflow || cachedWorkflow.providerName !== providerName || cachedWorkflow.revision !== revision) {
    cachedWorkflow = { providerName, revision, workflow: createAg003Workflow(resolveAg003Dependencies(providerName)) };
  }
  return cachedWorkflow.workflow;
}

export async function invokeAg003(request: AgentInvokeRequest, traceId: string): Promise<AgentInvokeResponse> {
  const result = await getDefaultWorkflow().invoke({ request, traceId, trace: [] });
  if (!result.response) throw new Error("AG-003 workflow completed without a response");
  return AgentInvokeResponseSchema.parse(result.response);
}
