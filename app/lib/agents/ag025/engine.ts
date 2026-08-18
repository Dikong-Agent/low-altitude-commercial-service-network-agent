import type { AgentCustomerServiceOutput, AgentInvokeResponse } from "../../contracts";
import { toAgentRagRuntime } from "../../rag/output.ts";
import type { RankedCustomerKnowledge } from "./adapters";
import { AG025_CONFIG } from "./config";
import type { CustomerConversationState, CustomerOrderSnapshot, CustomerProductSnapshot, CustomerServiceGuide, CustomerServiceIntent } from "./types";

function targetTeam(intent: CustomerServiceIntent): string {
  if (intent.issueTypes.includes("complaint")) return "投诉与售后人工客服";
  if (intent.issueTypes.includes("finance") || intent.issueTypes.includes("credit")) return "商业服务专业顾问";
  if (intent.issueTypes.includes("violation")) return "运营风控人工复核";
  if (intent.domains.includes("flight_service")) return "飞行服务人工客服";
  if (intent.domains.includes("technical_service")) return "技术服务人工客服";
  return "综合人工客服";
}

function unique<T extends string>(values: T[]): T[] { return [...new Set(values)]; }

function requestedQuestions(query: string): string[] {
  const requested: string[] = [];
  if (/支付|付款|结算/.test(query)) requested.push("支付方式");
  if (/会员|权益/.test(query)) requested.push("会员权益");
  if (/发票|开票/.test(query)) requested.push("发票办理方式");
  if (/什么时候|多久|时限|预计.*时间|处理时间/.test(query)) requested.push("处理时限");
  if (/为什么|原因/.test(query)) requested.push("原因说明");
  if (/状态|进度|到哪/.test(query)) requested.push("当前状态");
  if (/流程|怎么办理|怎么申请|如何申请|阶段/.test(query)) requested.push("办理流程");
  if (/准备什么|需要准备|材料|清单/.test(query)) requested.push("材料清单");
  if (/条件|资格|适不适合|能不能申请/.test(query)) requested.push("适用条件");
  if (/还款方式|等额本息|等额本金|先息后本/.test(query)) requested.push("还款方式");
  if (/风险|注意事项/.test(query)) requested.push("风险事项");
  if (/推荐|怎么选|如何选|从哪里开始选/.test(query)) requested.push("选型建议");
  if (/投诉|一直不处理|一直没解决|还是没解决/.test(query)) requested.push("投诉受理信息");
  if (/骚扰|威胁|辱骂|诈骗|站外|绕开平台|私下交易|身份证|银行卡|手机号|验证码/.test(query)) requested.push("风险线索与处置建议");
  return requested.length ? unique(requested) : ["当前咨询问题"];
}

function assessCoverage(query: string, intent: CustomerServiceIntent, knowledge: RankedCustomerKnowledge[], orders: CustomerOrderSnapshot[], products: CustomerProductSnapshot[], services: CustomerServiceGuide[], specialistResponse: AgentInvokeResponse | null): AgentCustomerServiceOutput["answer_coverage"] {
  const requested = requestedQuestions(query);
  const answered: string[] = [];
  const order = orders[0];
  const knowledgeKeywords = knowledge.flatMap((item) => item.entry.keywords);
  if (requested.includes("支付方式") && knowledgeKeywords.some((keyword) => ["支付", "付款", "结算"].includes(keyword))) answered.push("支付方式");
  if (requested.includes("会员权益") && knowledgeKeywords.some((keyword) => ["会员", "权益"].includes(keyword))) answered.push("会员权益");
  if (requested.includes("发票办理方式") && knowledgeKeywords.some((keyword) => ["发票", "开票"].includes(keyword))) answered.push("发票办理方式");
  if (requested.includes("办理流程") && knowledge.some((item) => /流程/.test(item.entry.title + item.entry.answer))) answered.push("办理流程");
  if (requested.includes("材料清单") && knowledge.some((item) => item.entry.checklistItems?.length)) answered.push("材料清单");
  if (requested.includes("适用条件") && knowledge.some((item) => /条件|机构要求|审批/.test(item.entry.answer))) answered.push("适用条件");
  if (requested.includes("还款方式") && knowledge.some((item) => /还款|信贷/.test(item.entry.answer))) answered.push("还款方式");
  if (requested.includes("风险事项") && knowledge.some((item) => /风险|审批|确认/.test(item.entry.answer))) answered.push("风险事项");
  if (requested.includes("投诉受理信息") && intent.complaintElements) answered.push("投诉受理信息");
  if (requested.includes("风险线索与处置建议") && intent.issueTypes.includes("violation")) answered.push("风险线索与处置建议");
  if (order) {
    if (requested.includes("当前咨询问题")) answered.push("当前咨询问题");
    if (requested.includes("当前状态")) answered.push("当前状态");
    if (requested.includes("处理时限") && order.promisedBy) answered.push("处理时限");
    if (requested.includes("原因说明") && order.anomalyReason && !/尚未|未知|未回传|需.*核查/.test(order.anomalyReason)) answered.push("原因说明");
    if (requested.includes("处理时限") && !order.promisedBy) answered.push("当前处理状态");
    if (requested.includes("原因说明") && order.anomalyReason) answered.push("已知异常线索");
  }
  if (products.length && requested.includes("选型建议")) answered.push("选型建议");
  if (services.length && requested.includes("材料清单") && specialistResponse?.status === "completed") answered.push("材料清单");
  if (knowledge.length && requested.includes("当前咨询问题")) answered.push("当前咨询问题");
  if (specialistResponse?.status === "completed" && requested.includes("当前咨询问题")) answered.push("当前咨询问题");
  if (intent.route === "human_handoff" && requested.includes("当前咨询问题") && (knowledge.length || intent.complaintElements || intent.issueTypes.includes("violation"))) answered.push("当前咨询问题");
  const unanswered = requested.filter((item) => !answered.includes(item));
  const status = unanswered.length === 0 ? "complete" : answered.length ? "partial" : "missing";
  return { status, requested_questions: requested, answered_questions: unique(answered), unanswered_questions: unanswered, explanation: status === "complete" ? "本次问题均有直接业务数据、知识或专业Agent结果支撑。" : status === "partial" ? `已回答部分问题，但${unanswered.join("、")}缺少直接依据。` : `当前资料不能直接回答${unanswered.join("、")}。` };
}

function buildOrderAssessment(order: CustomerOrderSnapshot | undefined, asOfDate: string): AgentCustomerServiceOutput["order_assessment"] {
  if (!order) return null;
  const updated = new Date(order.updatedAt.replace(" ", "T") + "+08:00");
  const asOf = new Date(`${asOfDate}T23:59:59+08:00`);
  const stalenessDays = Number.isFinite(updated.getTime()) && Number.isFinite(asOf.getTime()) ? Math.max(0, Math.floor((asOf.getTime() - updated.getTime()) / 86_400_000)) : null;
  const freshness = stalenessDays === null ? "unknown" : stalenessDays > 2 ? "stale" : "current";
  const anomaly = order.anomalyReason ? "confirmed" : freshness === "stale" ? "potential" : "none";
  const explanation = freshness === "unknown" ? "订单更新时间无法解析，需核对正式订单记录。" : freshness === "stale" ? `订单数据距查询时点已${stalenessDays}天未更新，不能据此推断当前实时状态。` : "订单数据处于样例时效窗口内。";
  return { order_id: order.id, data_updated_at: order.updatedAt, freshness, staleness_days: stalenessDays, promised_deadline_available: Boolean(order.promisedBy), anomaly, explanation };
}

const materialRecognitionRules: Array<[string, RegExp]> = [
  ["企业基本资料", /营业执照|企业基本资料|工商资料|统一社会信用代码/],
  ["商业计划或项目说明", /商业计划书|商业计划|项目说明|项目计划/],
  ["融资用途与规模", /融资用途|资金用途|融资规模|融资金额|资金规模/],
  ["近年财务资料", /财务报表|审计报告|财务资料|资产负债表|利润表/],
  ["股权结构", /股权结构|股东结构|股东名册/],
  ["核心团队与业务证明", /核心团队|团队介绍|业务合同|销售合同|业务证明/],
  ["经营与财务资料", /经营资料|财务报表|审计报告|财务资料/],
  ["纳税或经营流水", /纳税|完税|经营流水|银行流水/],
  ["资金用途说明", /资金用途|贷款用途|用款说明/],
  ["还款来源说明", /还款来源|还款计划|现金流说明/],
  ["机构要求的增信材料", /抵押|质押|担保|增信材料/],
];

function materialWasProvided(item: string, query: string): boolean {
  return materialRecognitionRules.find(([name]) => name === item)?.[1].test(query) ?? false;
}

function buildServiceGuidance(query: string, intent: CustomerServiceIntent, knowledge: RankedCustomerKnowledge[]): AgentCustomerServiceOutput["service_guidance"] {
  const category = intent.issueTypes.includes("complaint") ? "complaint" : intent.issueTypes.includes("finance") ? "finance" : intent.issueTypes.includes("credit") ? "credit" : null;
  if (!category) return null;
  const sourceRef = knowledge.find((item) => item.entry.issueType === category)?.entry.sourceRef ?? AG025_CONFIG.ruleVersion;
  const knowledgeChecklist = knowledge.find((item) => item.entry.issueType === category && item.entry.checklistItems?.length)?.entry.checklistItems;
  const complaintChecklist = ["问题主题", "涉及对象或订单号", "发生时间", "核心诉求", "可核验材料"];
  const checklistItems = category === "complaint" ? complaintChecklist : knowledgeChecklist ?? [];
  const complaint = intent.complaintElements;
  const checklist = checklistItems.map((item) => {
    let provided = materialWasProvided(item, query);
    if (category === "complaint") {
      if (item === "问题主题") provided = Boolean(complaint?.topic && complaint.topic !== "投诉事项");
      if (item === "涉及对象或订单号") provided = Boolean(complaint?.relatedObject);
      if (item === "发生时间") provided = Boolean(complaint?.occurredAt);
      if (item === "核心诉求") provided = Boolean(complaint?.coreRequest);
      if (item === "可核验材料") provided = /截图|录音|凭证|聊天记录|物流记录|照片|视频/.test(query);
    }
    return {
      item,
      status: provided ? "provided" as const : "missing" as const,
      explanation: provided ? "本轮表述中已识别到相关信息，仍需人工核对原始材料。" : "本轮未识别到该项信息，建议在人工处理前补充。",
      source_ref: sourceRef,
    };
  });
  const stage = category === "complaint"
    ? "受理信息整理"
    : category === "finance"
      ? /尽调/.test(query) ? "尽调沟通" : /协议|条款/.test(query) ? "协议沟通" : /机构|接洽/.test(query) ? "机构接洽" : "前期准备"
      : /审核|审批/.test(query) ? "机构审核" : /还款/.test(query) ? "还款安排了解" : "申请准备";
  const missingCount = checklist.filter((item) => item.status === "missing").length;
  const summary = category === "complaint"
    ? `已按投诉受理要素整理，本轮仍有${missingCount}项信息待补充。`
    : `已按${category === "finance" ? "投融资沟通" : "企业信贷申请"}的一般准备口径整理，本轮仍有${missingCount}项材料未识别。`;
  return {
    category,
    stage,
    summary,
    checklist,
    scope_notice: category === "complaint"
      ? "智能客服只整理受理信息，不执行立案、调查、处置或结果通知。"
      : "清单仅用于前期沟通准备，不代表机构准入条件、授信意见或融资建议。",
  };
}

type RiskSignal = AgentCustomerServiceOutput["risk_review"]["signals"][number];
const riskRules: Array<{ type: RiskSignal["type"]; label: string; pattern: RegExp; explanation: string }> = [
  { type: "harassment", label: "持续打扰或骚扰", pattern: /反复(?:联系|催促|发消息)|不停(?:联系|发消息)|持续纠缠|骚扰/, explanation: "发现可能构成持续打扰或不当纠缠的表达。" },
  { type: "insult", label: "侮辱或恶意攻击", pattern: /辱骂|傻[逼比]|废物|垃圾|混蛋|恶意攻击/, explanation: "发现侮辱或恶意攻击类表达。" },
  { type: "threat", label: "威胁或人身安全风险", pattern: /威胁|弄死|打你|报复|找上门|人身安全/, explanation: "发现可能涉及威胁或人身安全的表达，应优先人工复核。" },
  { type: "fraud", label: "疑似诈骗话术", pattern: /诈骗|冒充|异常收款|保证.{0,8}(?:收益|通过)|先(?:付款|转账)|验证码/, explanation: "发现冒充、异常收款、虚假承诺或敏感验证信息等诈骗线索。" },
  { type: "off_platform", label: "站外交易引导", pattern: /站外|绕开平台|私下(?:交易|付款)|线下转账|加微信|微信付款|二维码付款/, explanation: "发现引导脱离平台联系、付款或交易的线索。" },
  { type: "personal_data", label: "个人敏感信息暴露", pattern: /身份证(?:号)?|银行卡(?:号)?|手机号|家庭住址|账号密码|验证码/, explanation: "发现索取或暴露个人敏感信息的线索。" },
];

function maskSensitiveText(value: string): string {
  return value
    .replace(/(?<!\d)(1\d{2})\d{4}(\d{4})(?!\d)/g, "$1****$2")
    .replace(/(?<!\d)(\d{6})\d{8,9}(\d{4})(?!\d|X)/gi, "$1********$2")
    .replace(/(?<!\d)(\d{4})\d{4,11}(\d{4})(?!\d)/g, "$1****$2")
    .replace(/(?:账号密码|密码)\s*[:：]?\s*[^，。；\s]{2,30}/g, "账号密码：[已遮蔽]")
    .replace(/验证码\s*[:：]?\s*\d{4,8}/g, "验证码：[已遮蔽]");
}

function riskSignalTypes(value: string): Set<RiskSignal["type"]> {
  return new Set(riskRules.filter((rule) => rule.pattern.test(value)).map((rule) => rule.type));
}

function buildRiskReview(query: string, conversation: CustomerConversationState | null): AgentCustomerServiceOutput["risk_review"] {
  const signals = riskRules.flatMap((rule): RiskSignal[] => {
    const match = query.match(rule.pattern);
    if (!match || match.index === undefined) return [];
    const start = Math.max(0, match.index - 18);
    const end = Math.min(query.length, match.index + match[0].length + 24);
    return [{ type: rule.type, label: rule.label, evidence_excerpt: maskSensitiveText(query.slice(start, end)), explanation: rule.explanation }];
  });
  const currentTypes = new Set(signals.map((item) => item.type));
  const previousTypes = new Set((conversation?.recentTurns ?? []).flatMap((turn) => [...riskSignalTypes(turn.userInput)]));
  const repeatedSignal = [...currentTypes].some((type) => previousTypes.has(type));
  const types = new Set(signals.map((item) => item.type));
  const level = types.has("threat") ? "urgent" : types.has("fraud") || types.has("personal_data") || repeatedSignal ? "high" : signals.length ? "medium" : "none";
  const reviewRequired = signals.length > 0;
  return {
    level,
    signals,
    repeated_signal: repeatedSignal,
    review_required: reviewRequired,
    context_summary: reviewRequired ? `本轮发现${signals.length}类沟通风险线索${repeatedSignal ? "，且前序会话出现同类线索" : ""}。` : "本轮未发现预设规则覆盖的沟通风险线索。",
    handling_recommendation: !reviewRequired ? "无需进入风险复核流程。" : level === "urgent" ? "建议立即交由运营风控人员复核，并按业务系统安全流程处置；如涉及现实人身危险，应提示相关人员联系当地紧急服务。" : "建议保留会话、账号与关联业务信息，由运营人员结合交易和行为证据复核；在结论明确前不作信用处理。",
    determination: "risk_clue_only",
    enforcement_execution: "not_performed",
  };
}

function buildResolutionAssessment(intent: CustomerServiceIntent, coverage: AgentCustomerServiceOutput["answer_coverage"], orderAssessment: AgentCustomerServiceOutput["order_assessment"], riskReview: AgentCustomerServiceOutput["risk_review"], specialistResponse: AgentInvokeResponse | null, query: string): AgentCustomerServiceOutput["resolution_assessment"] {
  const feedback = /没解决|没有解决|没用|还是不行|还是没解决|答非所问|不对/.test(query)
    ? "negative" as const
    : /解决了|明白了|可以了|清楚了|谢谢/.test(query)
      ? "positive" as const
      : "not_provided" as const;
  const reasons: AgentCustomerServiceOutput["resolution_assessment"]["unresolved_reason_codes"] = [];
  if (coverage.status !== "complete") reasons.push("evidence_gap");
  if (orderAssessment?.freshness === "stale") reasons.push("stale_business_data");
  if (intent.orderIds.length && !orderAssessment) reasons.push("missing_business_data");
  if (intent.missingFields.length) reasons.push("missing_user_information");
  if (specialistResponse && specialistResponse.status !== "completed") reasons.push("specialist_review");
  if (intent.explicitHumanRequest) reasons.push("user_requested_human");
  if (intent.issueTypes.includes("complaint")) reasons.push("complaint_handling");
  if (riskReview.review_required) reasons.push("risk_review");
  if (intent.issueTypes.some((item) => item === "finance" || item === "credit")) reasons.push("professional_judgment");
  const unresolvedReasons = unique(reasons);
  const reasonLabels: Record<(typeof unresolvedReasons)[number], string> = {
    evidence_gap: "答复依据不足",
    stale_business_data: "业务资料已过时",
    missing_business_data: "缺少业务记录",
    missing_user_information: "用户信息待补充",
    specialist_review: "专业结果待复核",
    user_requested_human: "用户要求人工服务",
    complaint_handling: "投诉需由人工岗位承接",
    risk_review: "沟通风险线索需复核",
    professional_judgment: "专业条件需确认",
  };
  const reasonText = unresolvedReasons.map((item) => reasonLabels[item]).join("、");
  const status = intent.route === "human_handoff" ? "requires_human" : coverage.status === "complete" ? "resolved" : coverage.status === "partial" ? "partially_resolved" : "unresolved";
  const explanation = status === "resolved"
    ? "现有知识、业务资料或专业Agent结果已覆盖本轮问题；如用户后续反馈否定结果，应重新评估。"
    : status === "partially_resolved"
      ? `本轮只完成部分答复，仍需处理：${reasonText || "答复依据不足"}。`
      : status === "unresolved"
        ? `本轮缺少可直接回答问题的依据，仍需处理：${reasonText || "答复依据不足"}。`
        : `本轮可提供说明或前期整理，但最终处理需要人工参与：${reasonText}。`;
  return { status, user_feedback: feedback, unresolved_reason_codes: unresolvedReasons, explanation };
}

function buildAnswer(query: string, intent: CustomerServiceIntent, knowledge: RankedCustomerKnowledge[], orders: CustomerOrderSnapshot[], products: CustomerProductSnapshot[], services: CustomerServiceGuide[], specialistResponse: AgentInvokeResponse | null, coverage: AgentCustomerServiceOutput["answer_coverage"], orderAssessment: AgentCustomerServiceOutput["order_assessment"], serviceGuidance: AgentCustomerServiceOutput["service_guidance"], riskReview: AgentCustomerServiceOutput["risk_review"]): string {
  if (intent.route === "human_handoff") {
    if (riskReview.review_required) return `本轮会话发现${riskReview.signals.map((item) => item.label).join("、")}线索。相关片段已做敏感信息遮蔽并整理为人工复核材料；当前未作违规认定、信用处理或账号处置。${riskReview.handling_recommendation}`;
    if (serviceGuidance?.category === "complaint") return `${serviceGuidance.summary}已确认内容和待补充事项均已列入接续材料，建议由${targetTeam(intent)}核对正式业务记录后处理；当前尚未执行受理或转接。`;
    if (serviceGuidance?.category === "finance" || serviceGuidance?.category === "credit") {
      const groundedAnswer = knowledge.slice(0, 2).map((item) => item.entry.answer).join(" ");
      const boundary = serviceGuidance.category === "finance"
        ? "具体融资方式、估值、规模和条款"
        : "具体额度、利率、期限、担保要求和审批结果";
      return `${groundedAnswer || serviceGuidance.summary} 已形成一般材料清单，${boundary}需由${targetTeam(intent)}或相关机构确认。`;
    }
    return `已按当前会话整理人工接续材料，建议由${targetTeam(intent)}继续处理；当前仅生成转接建议，尚未执行真实转接。`;
  }
  if (orders.length) {
    const order = orders[0];
    const freshnessWarning = orderAssessment?.freshness === "stale" ? `该记录距查询时点已${orderAssessment.staleness_days}天未更新，不能视为实时状态。` : "";
    if (/什么时候|多久|时限|预计.*时间|处理时间/.test(query) && !order.promisedBy) return `样例订单${order.id}当前为“${order.statusLabel}”，但现有记录没有提供预计完成时间，无法回答具体处理时限。${freshnessWarning}需由售后人员核验正式进度和承诺时间。`;
    if (/为什么|原因/.test(query) && coverage.unanswered_questions.includes("原因说明")) return `样例订单${order.id}最后记录为“${order.statusLabel}”，${order.logisticsSummary}${freshnessWarning}现有数据没有说明未更新的具体原因，需由承运商或人工客服核查。`;
    return `样例订单${order.id}当前为“${order.statusLabel}”，${order.logisticsSummary}${freshnessWarning}${order.nextStep}`;
  }
  if (intent.orderIds.length) return "当前演示订单库中未找到该订单，未使用其他订单信息替代。请核对订单号，或转人工查询正式业务系统。";
  if (products.length) { const product = products[0]; return `${product.name}属于${product.category}，样例资料显示适用于${product.suitableFor.join("、")}；购买前仍需${product.purchaseConditions.join("、")}。`; }
  if (specialistResponse) return `已协同 ${specialistResponse.agent_id} 处理：${specialistResponse.output.summary}`;
  if (services.length) return `${services[0].summary}${services[0].nextStep}`;
  if (knowledge.length) return knowledge.map((item) => item.entry.answer).join(" ");
  return `当前样例知识库没有能够直接支撑“${coverage.unanswered_questions.join("、") || "当前问题"}”的依据，因此不生成推测性答案。请补充信息或转人工核验。`;
}

export function buildCustomerServiceOutput(query: string, intent: CustomerServiceIntent, knowledge: RankedCustomerKnowledge[], orders: CustomerOrderSnapshot[], products: CustomerProductSnapshot[], services: CustomerServiceGuide[], engine: AgentCustomerServiceOutput["engine"], sessionId: string | null, conversation: CustomerConversationState | null, specialistResponse: AgentInvokeResponse | null, asOfDate: string): AgentCustomerServiceOutput {
  const required = intent.route === "human_handoff";
  const rag = knowledge.find((item) => item.rag)?.rag;
  const answerCoverage = assessCoverage(query, intent, knowledge, orders, products, services, specialistResponse);
  const orderAssessment = buildOrderAssessment(orders[0], asOfDate);
  const serviceGuidance = buildServiceGuidance(query, intent, knowledge);
  const riskReview = buildRiskReview(query, conversation);
  const resolutionAssessment = buildResolutionAssessment(intent, answerCoverage, orderAssessment, riskReview, specialistResponse, query);
  const evidenceStatus = answerCoverage.status === "complete" ? "sufficient" : answerCoverage.status === "partial" ? "partial" : "missing";
  const evidenceAssessment: AgentCustomerServiceOutput["evidence_assessment"] = { status: evidenceStatus, explanation: answerCoverage.status === "complete" ? "回答中的关键事项均有直接证据或专业Agent结果。" : answerCoverage.status === "partial" ? "存在可用业务信息，但不足以覆盖用户全部问题。" : "未检索到可直接回答当前问题的证据。" };
  const answer = buildAnswer(query, intent, knowledge, orders, products, services, specialistResponse, answerCoverage, orderAssessment, serviceGuidance, riskReview);
  const confirmedInformation = [
    ...intent.orderIds.map((id) => `订单号：${id}`),
    ...intent.productModels.map((id) => `商品：${id}`),
    ...intent.serviceTypes.map((type) => `服务类型：${type}`),
    ...orders.map((order) => `订单状态：${order.statusLabel}（更新于${order.updatedAt}）`),
    ...(intent.complaintElements?.topic ? [`投诉主题：${intent.complaintElements.topic}`] : []),
    ...(intent.complaintElements?.relatedObject ? [`投诉对象：${intent.complaintElements.relatedObject}`] : []),
    ...(intent.complaintElements?.occurredAt ? [`发生时间：${intent.complaintElements.occurredAt}`] : []),
    ...(intent.complaintElements?.coreRequest ? [`核心诉求：${intent.complaintElements.coreRequest}`] : []),
    ...riskReview.signals.map((item) => `风险线索：${item.label}`),
  ];
  const guidancePending = serviceGuidance?.checklist.filter((item) => item.status !== "provided").map((item) => `补充或核对：${item.item}`) ?? [];
  const pendingItems = unique([
    ...intent.missingFields,
    ...answerCoverage.unanswered_questions.map((item) => `补充${item}的直接依据`),
    ...guidancePending,
    ...(required ? ["由人工人员核对正式业务数据并决定后续处理"] : []),
    ...(riskReview.review_required ? ["结合账号、交易及完整会话证据复核风险线索"] : []),
    ...(intent.issueTypes.some((item) => item === "finance" || item === "credit") ? ["由专业人员或金融机构确认具体适用条件与结果"] : []),
  ]);
  const handoffReasonCode: AgentCustomerServiceOutput["handoff"]["reason_code"] = !required
    ? "none"
    : intent.explicitHumanRequest
      ? "user_requested"
      : riskReview.review_required
        ? "risk_review"
        : intent.issueTypes.includes("complaint")
          ? "complaint"
          : intent.issueTypes.some((item) => item === "finance" || item === "credit")
            ? "professional_judgment"
            : "evidence_gap";
  const handoffReason = handoffReasonCode === "user_requested"
    ? "用户明确要求人工服务。"
    : handoffReasonCode === "risk_review"
      ? "会话包含需结合账号、交易和完整上下文核验的风险线索。"
      : handoffReasonCode === "complaint"
        ? "投诉受理、调查和处置需要人工岗位及业务系统承接。"
        : handoffReasonCode === "professional_judgment"
          ? "问题涉及融资或信贷条件，具体判断和结果需由专业人员或机构确认。"
          : handoffReasonCode === "evidence_gap"
            ? "现有知识或业务资料不足以完成处理。"
            : null;
  const evidenceSummary = unique([
    ...knowledge.map((item) => item.entry.sourceRef),
    ...orders.map((item) => item.sourceRef),
    ...products.map((item) => item.sourceRef),
    ...services.map((item) => item.sourceRef),
    ...riskReview.signals.map((item) => `${item.label}：${item.evidence_excerpt}`),
    ...(specialistResponse ? [`${specialistResponse.agent_id} · ${specialistResponse.trace_id}`] : []),
    AG025_CONFIG.ruleVersion,
  ]);
  const suggestedReply = !required
    ? null
    : riskReview.review_required
      ? `已记录您反映的沟通风险线索。相关内容需由运营人员结合完整会话和关联业务信息复核；在复核完成前，请勿继续站外付款或提供敏感信息。`
      : serviceGuidance?.category === "complaint"
        ? `已收到您的问题说明。目前已整理问题主题、涉及对象、发生时间和诉求；尚缺的信息会由人工客服进一步核对，具体受理和处理结果以业务系统记录为准。`
        : serviceGuidance?.category === "finance" || serviceGuidance?.category === "credit"
          ? `已按一般流程整理前期材料清单。具体条件、额度、期限、条款和审批结果需结合企业情况，由专业人员或相关机构确认。`
          : `已整理本次问题和现有依据，请人工客服核对正式业务记录后继续处理。`;
  return {
    engine,
    intent: { domains: intent.domains, issue_types: intent.issueTypes, route: intent.route, confidence: intent.confidence, entities: { order_ids: intent.orderIds, product_models: intent.productModels, service_types: intent.serviceTypes }, missing_fields: intent.missingFields, prior_context_used: intent.priorContextUsed, conflicts: intent.conflicts, specialist_agent_id: intent.specialistAgentId, specialist_reason: intent.specialistReason, complaint_elements: intent.complaintElements ? { topic: intent.complaintElements.topic, related_object: intent.complaintElements.relatedObject, occurred_at: intent.complaintElements.occurredAt, core_request: intent.complaintElements.coreRequest } : null },
    answer,
    knowledge_matches: knowledge.map((item) => ({ id: item.entry.id, title: item.entry.title, excerpt: item.entry.answer, source_ref: item.entry.sourceRef, relevance: item.relevance })),
    rag_runtime: toAgentRagRuntime(rag),
    tool_results: [...intent.orderIds.map((id) => { const order = orders.find((item) => item.id === id); return { tool: "order_lookup" as const, status: order ? "found" as const : "not_found" as const, label: id, value: order ? `${order.statusLabel} · ${order.productName} · ${order.updatedAt}` : "演示订单库未找到", source_ref: order?.sourceRef ?? "MockOrderData" }; }), ...intent.productModels.map((id) => { const product = products.find((item) => item.id === id); return { tool: "product_lookup" as const, status: product ? "found" as const : "not_found" as const, label: id, value: product ? `${product.name} · ${product.category}` : "演示商品库未找到", source_ref: product?.sourceRef ?? "MockProductData" }; }), ...services.map((service) => ({ tool: "service_lookup" as const, status: "found" as const, label: service.serviceType, value: service.summary, source_ref: service.sourceRef })), ...(specialistResponse ? [{ tool: "agent_collaboration" as const, status: "found" as const, label: specialistResponse.agent_id, value: specialistResponse.output.summary, source_ref: specialistResponse.trace_id }] : [])],
    specialist_collaboration: specialistResponse ? { agent_id: specialistResponse.agent_id, status: specialistResponse.status, summary: specialistResponse.output.summary, trace_id: specialistResponse.trace_id } : null,
    evidence_assessment: evidenceAssessment,
    answer_coverage: answerCoverage,
    order_assessment: orderAssessment,
    service_guidance: serviceGuidance,
    risk_review: riskReview,
    resolution_assessment: resolutionAssessment,
    handoff: {
      required,
      target_team: required ? targetTeam(intent) : null,
      priority: riskReview.level === "urgent" ? "urgent" : required ? "high" : "normal",
      reason_code: handoffReasonCode,
      reason: handoffReason,
      summary: required ? `用户问题：${maskSensitiveText(query.slice(0, 300))}；当前归类为${intent.issueTypes.join("、")}；已形成接续建议，尚未执行转接。` : "当前无需人工介入。",
      confirmed_information: confirmedInformation,
      pending_items: pendingItems,
      evidence_summary: evidenceSummary,
      suggested_reply: suggestedReply,
      execution_status: "recommendation_only",
    },
    conversation: { session_id: sessionId, turn_count: (conversation?.recentTurns.length ?? 0) + 1, prior_context_used: intent.priorContextUsed, user_problem_summary: `当前问题：${maskSensitiveText(query.slice(0, 300))}`, processing_trace_summary: [...(conversation?.recentTurns.slice(-2).map((turn, index) => `前序${index + 1}：${turn.assistantSummary}`) ?? []), `本轮：识别${intent.issueTypes.join("、")}问题并选择${intent.route}路径`].join("；") },
    capability_coverage: [...AG025_CONFIG.capabilityCoverage],
    data_notice: "FAQ、商品、订单、服务状态和处理规则均为虚构样例数据，仅用于咨询分类、答复、材料整理与人工接续测试；未执行退款、转单、立案、信用处理、账号处置或人工转接。",
    rule_version: AG025_CONFIG.ruleVersion,
  };
}
