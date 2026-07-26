import type { AgentCustomerServiceOutput } from "../../contracts";
import { AG025_CONFIG } from "./config";
import type { RankedCustomerKnowledge } from "./adapters";
import type { CustomerConversationState, CustomerOrderSnapshot, CustomerProductSnapshot, CustomerServiceGuide, CustomerServiceIntent } from "./types";

function targetTeam(intent: CustomerServiceIntent): string {
  if (intent.issueTypes.includes("complaint")) return "投诉与售后人工客服";
  if (intent.issueTypes.includes("finance") || intent.issueTypes.includes("credit")) return "商业服务专业顾问";
  if (intent.issueTypes.includes("violation")) return "运营风控人工复核";
  if (intent.issueTypes.includes("analytics")) return "运营数据分析专席";
  if (intent.domains.includes("flight_service")) return "飞行服务人工客服";
  if (intent.domains.includes("technical_service")) return "技术服务人工客服";
  return "综合人工客服";
}

function buildAnswer(
  intent: CustomerServiceIntent,
  knowledge: RankedCustomerKnowledge[],
  orders: CustomerOrderSnapshot[],
  products: CustomerProductSnapshot[],
  services: CustomerServiceGuide[],
): string {
  if (intent.route === "human_handoff") {
    return `已识别该问题需要${targetTeam(intent)}介入，并整理了已确认信息和待处理事项；当前仅生成转接建议，尚未执行真实转接。`;
  }
  if (orders.length) {
    const order = orders[0];
    return `样例订单${order.id}当前为“${order.statusLabel}”，${order.logisticsSummary}${order.nextStep}`;
  }
  if (intent.orderIds.length && !orders.length) return "当前 Mock 订单库中未找到该订单，未使用其他订单信息替代。请核对订单号或转人工查询正式业务系统。";
  if (products.length) {
    const product = products[0];
    return `${product.name}属于${product.category}，样例资料显示适用于${product.suitableFor.join("、")}；购买前仍需${product.purchaseConditions.join("、")}。`;
  }
  if (intent.route === "specialist_agent" && intent.issueTypes.includes("product")) {
    return "已识别为产品选型需求，建议转入 AG-003 分类导购并补充用途、预算、载荷、续航和作业环境；当前客服不会直接替代专业选型。";
  }
  if (services.length) return `${services[0].summary}${services[0].nextStep}`;
  if (knowledge.length) return knowledge.map((item) => item.entry.answer).join(" ");
  return "当前样例知识库没有足够依据回答该问题，请补充业务板块和具体诉求。";
}

export function buildCustomerServiceOutput(
  query: string,
  intent: CustomerServiceIntent,
  knowledge: RankedCustomerKnowledge[],
  orders: CustomerOrderSnapshot[],
  products: CustomerProductSnapshot[],
  services: CustomerServiceGuide[],
  engine: AgentCustomerServiceOutput["engine"],
  sessionId: string | null,
  conversation: CustomerConversationState | null,
): AgentCustomerServiceOutput {
  const required = intent.route === "human_handoff";
  const answer = buildAnswer(intent, knowledge, orders, products, services);
  const confirmedInformation = [
    ...intent.orderIds.map((id) => `订单号：${id}`),
    ...intent.productModels.map((id) => `商品：${id}`),
    ...intent.serviceTypes.map((type) => `服务类型：${type}`),
    ...orders.map((order) => `订单状态：${order.statusLabel}（更新于${order.updatedAt}）`),
    ...(intent.complaintElements?.topic ? [`投诉主题：${intent.complaintElements.topic}`] : []),
    ...(intent.complaintElements?.relatedObject ? [`投诉对象：${intent.complaintElements.relatedObject}`] : []),
    ...(intent.complaintElements?.occurredAt ? [`发生时间：${intent.complaintElements.occurredAt}`] : []),
    ...(intent.complaintElements?.coreRequest ? [`核心诉求：${intent.complaintElements.coreRequest}`] : []),
  ];
  const pendingItems = [
    ...intent.missingFields,
    ...(required ? ["由人工人员核对正式业务数据并决定后续处理"] : []),
    ...(intent.highRiskBoundary ? ["高风险结论及权益影响需专业人员复核"] : []),
  ];
  return {
    engine,
    intent: {
      domains: intent.domains,
      issue_types: intent.issueTypes,
      route: intent.route,
      confidence: intent.confidence,
      entities: { order_ids: intent.orderIds, product_models: intent.productModels, service_types: intent.serviceTypes },
      missing_fields: intent.missingFields,
      prior_context_used: intent.priorContextUsed,
      conflicts: intent.conflicts,
      complaint_elements: intent.complaintElements ? {
        topic: intent.complaintElements.topic,
        related_object: intent.complaintElements.relatedObject,
        occurred_at: intent.complaintElements.occurredAt,
        core_request: intent.complaintElements.coreRequest,
      } : null,
    },
    answer,
    knowledge_matches: knowledge.map((item) => ({
      id: item.entry.id, title: item.entry.title, excerpt: item.entry.answer,
      source_ref: item.entry.sourceRef, relevance: item.relevance,
    })),
    tool_results: [
      ...intent.orderIds.map((id) => {
        const order = orders.find((item) => item.id === id);
        return { tool: "order_lookup" as const, status: order ? "found" as const : "not_found" as const, label: id, value: order ? `${order.statusLabel} · ${order.productName} · ${order.updatedAt}` : "Mock 订单库未找到", source_ref: order?.sourceRef ?? "MockOrderData" };
      }),
      ...intent.productModels.map((id) => {
        const product = products.find((item) => item.id === id);
        return { tool: "product_lookup" as const, status: product ? "found" as const : "not_found" as const, label: id, value: product ? `${product.name} · ${product.category}` : "Mock 商品库未找到", source_ref: product?.sourceRef ?? "MockProductData" };
      }),
      ...services.map((service) => ({ tool: "service_lookup" as const, status: "found" as const, label: service.serviceType, value: service.summary, source_ref: service.sourceRef })),
    ],
    handoff: {
      required,
      target_team: required ? targetTeam(intent) : null,
      priority: /威胁|欺诈|人身安全/.test(query) ? "urgent" : required || intent.highRiskBoundary ? "high" : "normal",
      reason: required ? (intent.explicitHumanRequest ? "用户明确要求人工服务" : intent.highRiskBoundary ? "问题涉及专业判断或权益影响" : "投诉或复杂问题需人工处理") : null,
      summary: required ? `用户问题：${query.slice(0, 300)}；智能客服识别为${intent.issueTypes.join("、")}；当前仅生成建议，尚未执行人工转接。` : "当前无需人工介入。",
      confirmed_information: confirmedInformation,
      pending_items: pendingItems,
      execution_status: "recommendation_only",
    },
    conversation: {
      session_id: sessionId,
      turn_count: (conversation?.recentTurns.length ?? 0) + 1,
      prior_context_used: intent.priorContextUsed,
      user_problem_summary: `当前问题：${query.slice(0, 300)}`,
      processing_trace_summary: [
        ...(conversation?.recentTurns.slice(-2).map((turn, index) => `前序${index + 1}：${turn.assistantSummary}`) ?? []),
        `本轮：识别${intent.issueTypes.join("、")}问题并选择${intent.route}路径`,
      ].join("；"),
    },
    capability_coverage: [...AG025_CONFIG.capabilityCoverage],
    data_notice: "FAQ、商品、订单、服务状态和处理规则均为虚构 Mock，仅用于 AG-025 多意图路由与接口演示；未执行退款、转单、信用处理或人工转接。",
    rule_version: AG025_CONFIG.ruleVersion,
  };
}
