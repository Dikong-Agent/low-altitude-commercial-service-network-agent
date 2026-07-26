import type { Ag025InvokeRequest, CustomerServiceDomainSchema, CustomerServiceIssueSchema } from "../../contracts";
import type { z } from "zod/v4";
import { AG025_CONFIG } from "./config";
import { DEMO_CUSTOMER_ORDERS, DEMO_CUSTOMER_PRODUCTS, DEMO_CUSTOMER_SERVICE_GUIDES, DEMO_CUSTOMER_SERVICE_KNOWLEDGE } from "./catalog";
import type { CustomerOrderSnapshot, CustomerProductSnapshot, CustomerServiceGuide, CustomerServiceIntent, CustomerServiceKnowledgeEntry } from "./types";

type Domain = z.infer<typeof CustomerServiceDomainSchema>;
type Issue = z.infer<typeof CustomerServiceIssueSchema>;

export interface RankedCustomerKnowledge {
  entry: CustomerServiceKnowledgeEntry;
  relevance: number;
}

export interface AIPlatformPort {
  understandCustomerRequest(request: Ag025InvokeRequest, options?: { signal?: AbortSignal }): Promise<CustomerServiceIntent>;
  rankCustomerKnowledge(entries: CustomerServiceKnowledgeEntry[], intent: CustomerServiceIntent, query: string, options?: { signal?: AbortSignal }): Promise<RankedCustomerKnowledge[]>;
}

export interface CustomerServiceDataPort {
  searchKnowledge(intent: CustomerServiceIntent, query: string, limit: number, options?: { signal?: AbortSignal }): Promise<CustomerServiceKnowledgeEntry[]>;
  getOrders(ids: string[], options?: { signal?: AbortSignal }): Promise<CustomerOrderSnapshot[]>;
  findProducts(models: string[], options?: { signal?: AbortSignal }): Promise<CustomerProductSnapshot[]>;
  getServiceGuides(serviceTypes: string[], options?: { signal?: AbortSignal }): Promise<CustomerServiceGuide[]>;
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
  async understandCustomerRequest(request: Ag025InvokeRequest): Promise<CustomerServiceIntent> {
    const input = request.input.trim();
    const domains = detectDomains(input);
    const issueTypes = detectIssues(input);
    const explicitHumanRequest = /转人工|人工客服|真人客服|找客服人员|人工处理/.test(input);
    const highRiskBoundary = issueTypes.some((issue) => ["finance", "credit", "analytics", "violation"].includes(issue));
    const orderIds = contextOrderIds(request).length ? contextOrderIds(request) : textOrderIds(input);
    const productModels = request.context?.product_id
      ? [request.context.product_id]
      : modelAliases.filter(([, rule]) => rule.test(input)).map(([id]) => id);
    const serviceTypes = unique([
      ...(/飞行服务|空域|报备|航线/.test(input) ? ["飞行服务"] : []),
      ...(/技术服务|设备故障|技术支持|调试/.test(input) ? ["技术服务"] : []),
      ...(/商业服务|投融资|融资|信贷|贷款/.test(input) ? ["商业服务"] : []),
    ]);
    const missingFields: string[] = [];
    if (issueTypes.includes("order") && orderIds.length !== 1) missingFields.push(orderIds.length > 1 ? "需要确认唯一订单号" : "订单号");
    const unknown = issueTypes.length === 1 && issueTypes[0] === "unknown";
    if (unknown) missingFields.push("具体问题或业务板块");

    let route: CustomerServiceIntent["route"] = "knowledge_answer";
    if (explicitHumanRequest || issueTypes.includes("complaint") || highRiskBoundary) route = "human_handoff";
    else if (missingFields.length) route = "clarification";
    else if (issueTypes.includes("order") || productModels.length) route = "business_data";
    else if (issueTypes.includes("product") || issueTypes.includes("service")) route = "specialist_agent";
    else if (unknown) route = "clarification";

    const needsClarification = route === "clarification";
    const confidence = unknown ? 0.25 : domains.includes("unknown") ? 0.58 : Math.min(0.96, 0.74 + Math.min(issueTypes.length, 2) * 0.08 + (orderIds.length || productModels.length ? 0.06 : 0));
    return {
      domains, issueTypes, route, confidence, orderIds, productModels, serviceTypes, missingFields,
      needsClarification,
      clarificationMessage: needsClarification ? `请补充${missingFields.join("、")}，我再选择正确的客服处理路径。` : null,
      explicitHumanRequest, highRiskBoundary,
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
  async searchKnowledge(intent: CustomerServiceIntent, query: string, limit: number): Promise<CustomerServiceKnowledgeEntry[]> {
    const matches = DEMO_CUSTOMER_SERVICE_KNOWLEDGE.filter((entry) =>
      intent.issueTypes.includes(entry.issueType) || intent.domains.includes(entry.domain) || entry.keywords.some((keyword) => query.includes(keyword)),
    );
    return structuredClone((matches.length ? matches : DEMO_CUSTOMER_SERVICE_KNOWLEDGE.filter((entry) => entry.issueType === "general_rule")).slice(0, limit));
  }

  async getOrders(ids: string[]): Promise<CustomerOrderSnapshot[]> {
    return structuredClone(DEMO_CUSTOMER_ORDERS.filter((order) => ids.includes(order.id)));
  }

  async findProducts(models: string[]): Promise<CustomerProductSnapshot[]> {
    return structuredClone(DEMO_CUSTOMER_PRODUCTS.filter((product) => models.includes(product.id) || models.some((model) => product.name.includes(model))));
  }

  async getServiceGuides(serviceTypes: string[]): Promise<CustomerServiceGuide[]> {
    return structuredClone(DEMO_CUSTOMER_SERVICE_GUIDES.filter((guide) => serviceTypes.includes(guide.serviceType)));
  }
}
