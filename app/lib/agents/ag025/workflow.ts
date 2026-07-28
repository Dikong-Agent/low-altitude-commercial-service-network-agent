import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import {
  Ag025InvokeRequestSchema,
  AgentCustomerServiceOutputSchema,
  AgentInvokeResponseSchema,
  type Ag025InvokeRequest,
  type AgentInvokeResponse,
} from "../../contracts";
import { DependencyUnavailableError, executeWithPolicy } from "../../reliability";
import type { RequestIdentity } from "../../request-identity";
import { AG025_CONFIG } from "./config";
import { buildCustomerServiceOutput } from "./engine";
import { getAg025ProviderRevision, resolveAg025Dependencies, type Ag025Dependencies } from "./providers";
import {
  CustomerAccessScopeSchema,
  CustomerConversationStateSchema,
  CustomerOrderSnapshotSchema,
  CustomerProductSnapshotSchema,
  CustomerServiceGuideSchema,
  CustomerServiceIntentSchema,
  CustomerServiceKnowledgeEntrySchema,
  type CustomerAccessScope,
} from "./types";

const TraceStepSchema = z.object({ name: z.string(), detail: z.string() });
const RankedKnowledgeSchema = z.object({ entry: CustomerServiceKnowledgeEntrySchema, relevance: z.number().min(0).max(1) });

const Ag025GraphState = new StateSchema({
  request: Ag025InvokeRequestSchema,
  traceId: z.string(),
  accessScope: CustomerAccessScopeSchema,
  conversation: CustomerConversationStateSchema.nullable().optional(),
  intent: CustomerServiceIntentSchema.optional(),
  knowledge: z.array(CustomerServiceKnowledgeEntrySchema).optional(),
  rankedKnowledge: z.array(RankedKnowledgeSchema).optional(),
  orders: z.array(CustomerOrderSnapshotSchema).optional(),
  products: z.array(CustomerProductSnapshotSchema).optional(),
  services: z.array(CustomerServiceGuideSchema).optional(),
  customerServiceOutput: AgentCustomerServiceOutputSchema.optional(),
  response: AgentInvokeResponseSchema.optional(),
  trace: z.array(TraceStepSchema).optional(),
});

function appendTrace(state: { trace?: Array<{ name: string; detail: string }> }, name: string, detail: string) {
  return [...(state.trace ?? []), { name, detail }];
}

export function createAg025Workflow(dependencies: Ag025Dependencies) {
  const loadConversation = async (state: typeof Ag025GraphState.State) => {
    if (dependencies.environment === "production" && state.accessScope.source !== "trusted-server") {
      throw new DependencyUnavailableError("ag025.authorization", "Production customer data requires a trusted server access scope");
    }
    if (!state.request.session_id) return { conversation: null };
    const conversation = await executeWithPolicy(
      "ag025.customer-conversation-load",
      AG025_CONFIG.reliability.customerData,
      (signal) => dependencies.conversationData.loadSession(state.request.session_id!, state.accessScope, { signal }),
    );
    return {
      conversation,
      trace: appendTrace(state, "加载会话上下文", conversation
        ? `读取${conversation.recentTurns.length}轮会话及已确认业务实体。`
        : "当前会话暂无已确认业务上下文。"),
    };
  };

  const understandRequest = async (state: typeof Ag025GraphState.State) => {
    const intent = await executeWithPolicy(
      "ag025.ai-platform-understanding",
      AG025_CONFIG.reliability.aiPlatform,
      (signal) => dependencies.aiPlatform.understandCustomerRequest(state.request, state.conversation ?? null, { signal }),
    );
    return {
      intent,
      trace: appendTrace(state, "识别咨询意图", intent.needsClarification
        ? `识别信息不足：${intent.missingFields.join("、")}。`
        : `识别${intent.issueTypes.join("、")}问题，选择${intent.route}路径，置信度${Math.round(intent.confidence * 100)}%。`),
    };
  };

  const buildClarification = (state: typeof Ag025GraphState.State) => {
    const response: AgentInvokeResponse = {
      request_id: `AG025-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-025",
      status: "needs_clarification",
      environment: dependencies.environment,
      output: {
        title: "需要补充客服问题",
        summary: state.intent?.clarificationMessage ?? "请补充业务板块和具体问题。",
        points: ["订单问题请提供唯一订单号，例如 JDZ-DEMO-1001。", "商品选型可说明用途、预算和关键条件。", "也可以明确要求转人工客服。"],
        evidence: ["AG-025 输入完整性规则 v1.0"],
      },
      trace: appendTrace(state, "生成针对性追问", "信息不足时未查询其他订单或生成推测性答复。"),
    };
    return { response, trace: response.trace };
  };

  const loadResources = async (state: typeof Ag025GraphState.State) => {
    const intent = state.intent!;
    const [knowledge, orders, products, services] = await Promise.all([
      executeWithPolicy("ag025.customer-data-knowledge", AG025_CONFIG.reliability.customerData,
        (signal) => dependencies.customerData.searchKnowledge(intent, state.request.input, AG025_CONFIG.maxKnowledgeMatches, { signal })),
      intent.orderIds.length
        ? executeWithPolicy("ag025.customer-data-orders", AG025_CONFIG.reliability.customerData,
          (signal) => dependencies.customerData.getOrders(intent.orderIds, state.accessScope, { signal }))
        : Promise.resolve([]),
      intent.productModels.length
        ? executeWithPolicy("ag025.customer-data-products", AG025_CONFIG.reliability.customerData,
          (signal) => dependencies.customerData.findProducts(intent.productModels, state.accessScope, { signal }))
        : Promise.resolve([]),
      intent.serviceTypes.length
        ? executeWithPolicy("ag025.customer-data-services", AG025_CONFIG.reliability.customerData,
          (signal) => dependencies.customerData.getServiceGuides(intent.serviceTypes, state.accessScope, { signal }))
        : Promise.resolve([]),
    ]);
    return {
      knowledge, orders, products, services,
      trace: appendTrace(state, "调用知识与业务工具", `通过 ${dependencies.providerName} CustomerServiceDataPort 加载${knowledge.length}条知识、${orders.length}个订单、${products.length}个商品和${services.length}项服务指引。`),
    };
  };

  const rankKnowledge = async (state: typeof Ag025GraphState.State) => {
    const rankedKnowledge = await executeWithPolicy(
      "ag025.ai-platform-knowledge-ranking",
      AG025_CONFIG.reliability.aiPlatform,
      (signal) => dependencies.aiPlatform.rankCustomerKnowledge(state.knowledge ?? [], state.intent!, state.request.input, { signal }),
    );
    return {
      rankedKnowledge,
      trace: appendTrace(state, "重排答复依据", rankedKnowledge.length ? `保留${rankedKnowledge.length}条与当前意图直接相关的样例依据。` : "未找到可直接支撑答复的样例知识。"),
    };
  };

  const composeAnswer = (state: typeof Ag025GraphState.State) => {
    const customerServiceOutput = buildCustomerServiceOutput(
      state.request.input,
      state.intent!,
      state.rankedKnowledge ?? [],
      state.orders ?? [],
      state.products ?? [],
      state.services ?? [],
      dependencies.engine,
      state.request.session_id ?? null,
      state.conversation ?? null,
    );
    return {
      customerServiceOutput,
      trace: appendTrace(state, "生成客服答复与路由", `形成${customerServiceOutput.intent.route}结果，并保留${customerServiceOutput.handoff.pending_items.length}项待处理信息。`),
    };
  };

  const buildResponse = (state: typeof Ag025GraphState.State) => {
    const customerService = state.customerServiceOutput!;
    const missingOrder = customerService.intent.entities.order_ids.length > 0
      && customerService.tool_results.some((item) => item.tool === "order_lookup" && item.status === "not_found");
    const status: AgentInvokeResponse["status"] = missingOrder
      ? "needs_clarification"
      : customerService.handoff.required
        ? "needs_review"
        : "completed";
    const evidence = [
      ...customerService.knowledge_matches.map((item) => item.source_ref),
      ...customerService.tool_results.filter((item) => item.status === "found").map((item) => item.source_ref),
      customerService.rule_version,
    ];
    const response: AgentInvokeResponse = {
      request_id: `AG025-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-025",
      status,
      environment: dependencies.environment,
      output: {
        title: missingOrder ? "需要核对订单号" : customerService.handoff.required ? "客服转人工建议与会话摘要" : "智能客服路由与答复",
        summary: customerService.answer,
        points: [
          ...customerService.tool_results.map((item) => `${item.label}：${item.value}`),
          ...customerService.handoff.pending_items,
        ].slice(0, 5),
        evidence: [...new Set(evidence)],
        customer_service: customerService,
      },
      trace: appendTrace(state, "输出客服处理结果", customerService.handoff.required
        ? "输出人工介入原因、目标团队、已确认信息和待处理事项；未声称已完成真实转接。"
        : "输出可核验答复、工具结果或专业 Agent 路由建议。"),
    };
    return { response, trace: response.trace };
  };

  const saveConversation = async (state: typeof Ag025GraphState.State) => {
    if (!state.request.session_id || !state.response) return {};
    const intent = state.intent;
    const hasConflicts = Boolean(intent?.conflicts.length);
    const conversation = await executeWithPolicy(
      "ag025.customer-conversation-save",
      AG025_CONFIG.reliability.customerData,
      (signal) => dependencies.conversationData.saveTurn(
        state.request.session_id!,
        state.accessScope,
        {
          userInput: state.request.input,
          assistantSummary: state.response!.output.summary,
          status: state.response!.status,
        },
        {
          confirmedOrderIds: !hasConflicts && intent?.orderIds.length === 1 ? intent.orderIds : [],
          confirmedProductModels: !hasConflicts && intent?.productModels.length === 1 ? intent.productModels : [],
          confirmedServiceTypes: !hasConflicts ? intent?.serviceTypes ?? [] : [],
        },
        { signal },
      ),
    );
    const trace = appendTrace(state, "保存会话摘要", `已保存最近${conversation.recentTurns.length}轮摘要；正式环境需由业务系统会话存储承载。`);
    return { conversation, response: { ...state.response, trace }, trace };
  };

  return new StateGraph(Ag025GraphState)
    .addNode("load_conversation", loadConversation)
    .addNode("understand_request", understandRequest)
    .addNode("clarify", buildClarification)
    .addNode("load_resources", loadResources)
    .addNode("rank_knowledge", rankKnowledge)
    .addNode("compose_answer", composeAnswer)
    .addNode("build_response", buildResponse)
    .addNode("save_conversation", saveConversation)
    .addEdge(START, "load_conversation")
    .addEdge("load_conversation", "understand_request")
    .addConditionalEdges("understand_request", (state) => state.intent?.needsClarification ? "clarify" : "load_resources")
    .addEdge("clarify", "save_conversation")
    .addEdge("load_resources", "rank_knowledge")
    .addEdge("rank_knowledge", "compose_answer")
    .addEdge("compose_answer", "build_response")
    .addEdge("build_response", "save_conversation")
    .addEdge("save_conversation", END)
    .compile();
}

let cachedWorkflow: { providerName: string; revision: number; workflow: ReturnType<typeof createAg025Workflow> } | undefined;

function getDefaultWorkflow(identity?: RequestIdentity) {
  const providerName = process.env.AG025_PROVIDER ?? "demo";
  if (providerName === "production") return createAg025Workflow(resolveAg025Dependencies(providerName, identity));
  const revision = getAg025ProviderRevision();
  if (!cachedWorkflow || cachedWorkflow.providerName !== providerName || cachedWorkflow.revision !== revision) {
    cachedWorkflow = { providerName, revision, workflow: createAg025Workflow(resolveAg025Dependencies(providerName)) };
  }
  return cachedWorkflow.workflow;
}

export async function invokeAg025(
  request: Ag025InvokeRequest,
  traceId: string,
  accessScope: CustomerAccessScope,
  identity?: RequestIdentity,
): Promise<AgentInvokeResponse> {
  const result = await getDefaultWorkflow(identity).invoke({ request, traceId, accessScope, trace: [] });
  if (!result.response) throw new Error("AG-025 workflow completed without a response");
  return AgentInvokeResponseSchema.parse(result.response);
}
