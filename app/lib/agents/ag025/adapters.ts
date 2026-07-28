import type { Ag025InvokeRequest, CustomerServiceDomainSchema, CustomerServiceIssueSchema } from "../../contracts";
import type { z } from "zod/v4";
import type { CommonAIPlatformPort, CommonDomainDataPort } from "../../runtime-ports";
import { AG025_CONFIG } from "./config";
import { DEMO_CUSTOMER_ORDERS, DEMO_CUSTOMER_PRODUCTS, DEMO_CUSTOMER_SERVICE_GUIDES, DEMO_CUSTOMER_SERVICE_KNOWLEDGE } from "./catalog";
import type {
  CustomerAccessScope,
  CustomerComplaintElements,
  CustomerConversationState,
  CustomerConversationTurn,
  CustomerOrderSnapshot,
  CustomerProductSnapshot,
  CustomerServiceGuide,
  CustomerServiceIntent,
  CustomerServiceKnowledgeEntry,
} from "./types";

type Domain = z.infer<typeof CustomerServiceDomainSchema>;
type Issue = z.infer<typeof CustomerServiceIssueSchema>;

export interface RankedCustomerKnowledge {
  entry: CustomerServiceKnowledgeEntry;
  relevance: number;
}

export interface AIPlatformPort extends CommonAIPlatformPort {
  understandCustomerRequest(request: Ag025InvokeRequest, conversation: CustomerConversationState | null, options?: { signal?: AbortSignal }): Promise<CustomerServiceIntent>;
  rankCustomerKnowledge(entries: CustomerServiceKnowledgeEntry[], intent: CustomerServiceIntent, query: string, options?: { signal?: AbortSignal }): Promise<RankedCustomerKnowledge[]>;
}

export interface CustomerServiceDataPort extends CommonDomainDataPort {
  searchKnowledge(intent: CustomerServiceIntent, query: string, limit: number, options?: { signal?: AbortSignal }): Promise<CustomerServiceKnowledgeEntry[]>;
  getOrders(ids: string[], accessScope: CustomerAccessScope, options?: { signal?: AbortSignal }): Promise<CustomerOrderSnapshot[]>;
  findProducts(models: string[], accessScope: CustomerAccessScope, options?: { signal?: AbortSignal }): Promise<CustomerProductSnapshot[]>;
  getServiceGuides(serviceTypes: string[], accessScope: CustomerAccessScope, options?: { signal?: AbortSignal }): Promise<CustomerServiceGuide[]>;
}

export interface CustomerConversationPort {
  loadSession(sessionId: string, accessScope: CustomerAccessScope, options?: { signal?: AbortSignal }): Promise<CustomerConversationState | null>;
  saveTurn(
    sessionId: string,
    accessScope: CustomerAccessScope,
    turn: CustomerConversationTurn,
    confirmed: Pick<CustomerConversationState, "confirmedOrderIds" | "confirmedProductModels" | "confirmedServiceTypes">,
    options?: { signal?: AbortSignal },
  ): Promise<CustomerConversationState>;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function contextOrderIds(request: Ag025InvokeRequest): string[] {
  return request.context?.order_id ? [request.context.order_id.toUpperCase()] : [];
}

function textOrderIds(input: string): string[] {
  return unique(Array.from(input.matchAll(/JDZ-(?:DEMO-)?\d{4,12}/gi), (match) => match[0].toUpperCase()));
}

const modelAliases: Array<[string, RegExp]> = [
  ["DEMO-X8", /云巡\s*X8|X8巡检/i],
  ["DEMO-T60", /山岳\s*T60|T60复合翼/i],
];

function sameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function explicitHumanRequest(input: string): boolean {
  const hasPositiveRequest = /转人工|人工客服|真人客服|找客服人员|人工处理/.test(input);
  const hasNegation = /(?:不要|不用|无需|暂不|先不|不想|别)(?:给我|帮我|立即|马上|再)?(?:转|找|联系)?(?:人工|真人|客服)|不是(?:要|想)(?:转|找)?人工/.test(input);
  return hasPositiveRequest && !hasNegation;
}

function extractComplaintElements(
  input: string,
  orderIds: string[],
  productModels: string[],
  serviceTypes: string[],
): CustomerComplaintElements {
  const topicRules: Array<[string, RegExp]> = [
    ["物流进度异常", /物流(?:停滞|未更新|不更新|异常)|一直没发货|迟迟未到/],
    ["退款或售后处理", /退款|退货|换货|售后|维修/],
    ["服务态度或处理时效", /态度|一直不处理|无人处理|拖延/],
    ["疑似欺诈或违规", /欺诈|诈骗|虚假|违规/],
  ];
  const topic = topicRules.find(([, rule]) => rule.test(input))?.[0] ?? "投诉事项";
  const relatedObject = orderIds[0]
    ? `订单 ${orderIds[0]}`
    : productModels[0]
      ? `商品 ${productModels[0]}`
      : serviceTypes[0]
        ? `${serviceTypes[0]}事项`
        : null;
  const occurredAt = input.match(/(?:20\d{2}年)?\d{1,2}月\d{1,2}日|今天|昨天|前天|上周|本周/)?.[0] ?? null;
  const coreRequest = input.match(/(?:诉求(?:是|为)?|希望|要求|请(?:尽快)?)([^，。；]{2,80})/)?.[1]?.trim() ?? null;
  return { topic, relatedObject, occurredAt, coreRequest };
}

function assertDemoAccessScope(accessScope: CustomerAccessScope): void {
  if (accessScope.source !== "demo") throw new Error("Mock customer data only accepts the isolated demo access scope");
}

function detectDomains(input: string): Domain[] {
  const domains: Domain[] = [];
  if (/商品|产品|无人机|订单|物流|退款|退货|售后|维修|购买|付款/.test(input)) domains.push("product_mall");
  if (/飞行服务|空域|航线|报备|飞行任务/.test(input)) domains.push("flight_service");
  if (/技术服务|调试|设备故障|技术支持/.test(input)) domains.push("technical_service");
  if (/投融资|融资|信贷|贷款|商业服务/.test(input)) domains.push("commercial_service");
  if (/平台|会员|权益|支付方式|规则/.test(input)) domains.push("platform");
  return domains.length ? unique(domains) : ["unknown"];
}

function detectIssues(input: string): Issue[] {
  const issues: Issue[] = [];
  if (/会员|权益|支付方式|平台规则|怎么付款/.test(input)) issues.push("general_rule");
  if (/购买|选型|推荐|产品|商品|无人机|云巡|山岳/.test(input)) issues.push("product");
  if (/订单|发货|物流|签收|到哪|状态/.test(input)) issues.push("order");
  if (/售后|退款|退货|换货|维修|故障|投诉处理/.test(input)) issues.push("after_sales");
  if (/飞行服务|技术服务|商业服务|空域|报备|航线/.test(input)) issues.push("service");
  if (/投诉|不满|欺骗|一直不处理|曝光/.test(input)) issues.push("complaint");
  if (/投融资|融资|估值|投资机构/.test(input)) issues.push("finance");
  if (/信贷|贷款|授信|还款/.test(input)) issues.push("credit");
  if (/经营数据|指标|日报|周报|月报|原因分析/.test(input)) issues.push("analytics");
  if (/刷单|炒信|恶意差评|骚扰|威胁|辱骂|绕开平台/.test(input)) issues.push("violation");
  return issues.length ? unique(issues) : ["unknown"];
}

export class DemoAIPlatformAdapter implements AIPlatformPort {
  readonly portKind = "ai-platform" as const;
  readonly capabilities = ["understanding", "retrieval", "reranking", "generation"] as const;
  async understandCustomerRequest(request: Ag025InvokeRequest, conversation: CustomerConversationState | null): Promise<CustomerServiceIntent> {
    const input = request.input.trim();
    const domains = detectDomains(input);
    const issueTypes = detectIssues(input);
    const wantsHuman = explicitHumanRequest(input);
    const highRiskBoundary = issueTypes.some((issue) => ["finance", "credit", "analytics", "violation"].includes(issue));
    const contextOrders = contextOrderIds(request);
    const inputOrders = textOrderIds(input);
    const explicitOrders = unique([...contextOrders, ...inputOrders]);
    const sessionOrders = conversation?.confirmedOrderIds ?? [];
    const orderIds = explicitOrders.length ? explicitOrders : issueTypes.includes("order") ? sessionOrders : [];
    const contextProducts = request.context?.product_id ? [request.context.product_id.toUpperCase()] : [];
    const inputProducts = modelAliases.filter(([, rule]) => rule.test(input)).map(([id]) => id);
    const explicitProducts = unique([...contextProducts, ...inputProducts]);
    const sessionProducts = conversation?.confirmedProductModels ?? [];
    const productModels = explicitProducts.length ? explicitProducts : issueTypes.includes("product") ? sessionProducts : [];
    const serviceTypes = unique([
      ...(/飞行服务|空域|报备|航线/.test(input) ? ["飞行服务"] : []),
      ...(/技术服务|设备故障|技术支持|调试/.test(input) ? ["技术服务"] : []),
      ...(/商业服务|投融资|融资|信贷|贷款/.test(input) ? ["商业服务"] : []),
    ]);
    const missingFields: string[] = [];
    const conflicts: string[] = [];
    const orderConflict = Boolean(contextOrders.length && inputOrders.length && !sameValues(contextOrders, inputOrders));
    const productConflict = Boolean(contextProducts.length && inputProducts.length && !sameValues(contextProducts, inputProducts));
    if (orderConflict) {
      conflicts.push("正文订单号与上下文订单号不一致");
      missingFields.push("正文与上下文中的唯一订单号");
    }
    if (productConflict) {
      conflicts.push("正文商品型号与上下文商品型号不一致");
      missingFields.push("正文与上下文中的唯一商品型号");
    }
    if (!orderConflict && issueTypes.includes("order") && orderIds.length !== 1) missingFields.push(orderIds.length > 1 ? "需要确认唯一订单号" : "订单号");
    const unknown = issueTypes.length === 1 && issueTypes[0] === "unknown";
    if (unknown) missingFields.push("具体问题或业务板块");

    let route: CustomerServiceIntent["route"] = "knowledge_answer";
    if (wantsHuman || issueTypes.includes("complaint") || highRiskBoundary) route = "human_handoff";
    else if (missingFields.length) route = "clarification";
    else if (issueTypes.includes("order") || productModels.length) route = "business_data";
    else if (issueTypes.includes("product") || issueTypes.includes("service")) route = "specialist_agent";
    else if (unknown) route = "clarification";

    const needsClarification = route === "clarification";
    const confidence = unknown ? 0.25 : domains.includes("unknown") ? 0.58 : Math.min(0.96, 0.74 + Math.min(issueTypes.length, 2) * 0.08 + (orderIds.length || productModels.length ? 0.06 : 0));
    const priorContextUsed = Boolean(conversation && !explicitOrders.length && !explicitProducts.length && (orderIds.length || productModels.length));
    const complaintElements = issueTypes.includes("complaint")
      ? extractComplaintElements(input, orderIds, productModels, serviceTypes)
      : null;
    return {
      domains, issueTypes, route, confidence, orderIds, productModels, serviceTypes, missingFields,
      needsClarification,
      clarificationMessage: needsClarification ? `请补充${missingFields.join("、")}，我再选择正确的客服处理路径。` : null,
      explicitHumanRequest: wantsHuman, highRiskBoundary, priorContextUsed, conflicts, complaintElements,
    };
  }

  async rankCustomerKnowledge(entries: CustomerServiceKnowledgeEntry[], intent: CustomerServiceIntent, query: string): Promise<RankedCustomerKnowledge[]> {
    return entries.map((entry) => {
      const keywordHits = entry.keywords.filter((keyword) => query.includes(keyword)).length;
      const issueHit = intent.issueTypes.includes(entry.issueType) ? 1 : 0;
      const domainHit = intent.domains.includes(entry.domain) ? 1 : 0;
      return { entry, relevance: Math.min(1, 0.28 + keywordHits * 0.18 + issueHit * 0.24 + domainHit * 0.16) };
    }).filter((item) => item.relevance >= 0.46).sort((a, b) => b.relevance - a.relevance).slice(0, AG025_CONFIG.maxKnowledgeMatches);
  }
}

export class MockCustomerServiceDataAdapter implements CustomerServiceDataPort {
  readonly portKind = "domain-data" as const;
  readonly domain = "customer-service" as const;
  async searchKnowledge(intent: CustomerServiceIntent, query: string, limit: number): Promise<CustomerServiceKnowledgeEntry[]> {
    const matches = DEMO_CUSTOMER_SERVICE_KNOWLEDGE.filter((entry) =>
      intent.issueTypes.includes(entry.issueType) || intent.domains.includes(entry.domain) || entry.keywords.some((keyword) => query.includes(keyword)),
    );
    return structuredClone((matches.length ? matches : DEMO_CUSTOMER_SERVICE_KNOWLEDGE.filter((entry) => entry.issueType === "general_rule")).slice(0, limit));
  }

  async getOrders(ids: string[], accessScope: CustomerAccessScope): Promise<CustomerOrderSnapshot[]> {
    assertDemoAccessScope(accessScope);
    return structuredClone(DEMO_CUSTOMER_ORDERS.filter((order) => ids.includes(order.id)));
  }

  async findProducts(models: string[], accessScope: CustomerAccessScope): Promise<CustomerProductSnapshot[]> {
    assertDemoAccessScope(accessScope);
    return structuredClone(DEMO_CUSTOMER_PRODUCTS.filter((product) => models.includes(product.id) || models.some((model) => product.name.includes(model))));
  }

  async getServiceGuides(serviceTypes: string[], accessScope: CustomerAccessScope): Promise<CustomerServiceGuide[]> {
    assertDemoAccessScope(accessScope);
    return structuredClone(DEMO_CUSTOMER_SERVICE_GUIDES.filter((guide) => serviceTypes.includes(guide.serviceType)));
  }
}

const MAX_DEMO_SESSIONS = 500;
const MAX_DEMO_TURNS = 6;

export class DemoCustomerConversationAdapter implements CustomerConversationPort {
  private readonly sessions = new Map<string, CustomerConversationState>();

  private key(sessionId: string, accessScope: CustomerAccessScope): string {
    return [accessScope.source, accessScope.tenantId ?? "-", accessScope.subjectId ?? "-", sessionId].join(":");
  }

  async loadSession(sessionId: string, accessScope: CustomerAccessScope): Promise<CustomerConversationState | null> {
    const state = this.sessions.get(this.key(sessionId, accessScope));
    return state ? structuredClone(state) : null;
  }

  async saveTurn(
    sessionId: string,
    accessScope: CustomerAccessScope,
    turn: CustomerConversationTurn,
    confirmed: Pick<CustomerConversationState, "confirmedOrderIds" | "confirmedProductModels" | "confirmedServiceTypes">,
  ): Promise<CustomerConversationState> {
    const key = this.key(sessionId, accessScope);
    const previous = this.sessions.get(key);
    const state: CustomerConversationState = {
      sessionId,
      confirmedOrderIds: unique([...(previous?.confirmedOrderIds ?? []), ...confirmed.confirmedOrderIds]),
      confirmedProductModels: unique([...(previous?.confirmedProductModels ?? []), ...confirmed.confirmedProductModels]),
      confirmedServiceTypes: unique([...(previous?.confirmedServiceTypes ?? []), ...confirmed.confirmedServiceTypes]),
      recentTurns: [...(previous?.recentTurns ?? []), turn].slice(-MAX_DEMO_TURNS),
    };
    if (!this.sessions.has(key) && this.sessions.size >= MAX_DEMO_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) this.sessions.delete(oldestKey);
    }
    this.sessions.set(key, state);
    return structuredClone(state);
  }
}
