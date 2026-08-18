import type { Ag012InvokeRequest, PolicyMode, PolicyTopic } from "../../contracts";
import type { CommonAIPlatformPort, CommonDomainDataPort } from "../../runtime-ports";
import { rankLegacyKnowledge } from "../../rag/legacy-bridge";
import { DEMO_POLICY_DOCUMENTS } from "./catalog";
import { rankPolicyEvidence } from "./engine";
import type { DemoPolicyDocument, PolicyIntent, RankedPolicyEvidence } from "./types";

export interface AIPlatformPort extends CommonAIPlatformPort {
  understandPolicyRequest(request: Ag012InvokeRequest, options?: { signal?: AbortSignal }): Promise<PolicyIntent>;
  retrievePolicyEvidence(documents: DemoPolicyDocument[], intent: PolicyIntent, query: string, options?: { signal?: AbortSignal }): Promise<RankedPolicyEvidence[]>;
}

export interface PolicyDocumentSearch {
  documentTypes: PolicyIntent["documentTypes"];
  query: string;
  limit: number;
}

export interface PolicyDataPort extends CommonDomainDataPort {
  searchDocuments(search: PolicyDocumentSearch, options?: { signal?: AbortSignal }): Promise<DemoPolicyDocument[]>;
  getDocuments(ids: string[], options?: { signal?: AbortSignal }): Promise<DemoPolicyDocument[]>;
  getVersionChains(chainIds: string[], options?: { signal?: AbortSignal }): Promise<DemoPolicyDocument[]>;
}

export interface PolicyClock {
  today(): string;
}

const topicRules: Array<[PolicyTopic, RegExp, string]> = [
  ["operation", /实名登记|所有者登记|国籍登记/, "实名登记"],
  ["scope", /适用范围|适用对象|哪些主体|覆盖范围/, "适用范围"],
  ["filing", /报备|申报|申请|提交|提前几天|提前多久|工作日/, "申请报备"],
  ["record_retention", /记录|保存|留存|归档|存多久/, "运行记录"],
  ["operation_safety", /安全|风险评估|应急|天气|载荷|电池/, "运行安全"],
  ["logistics", /物流|配送/, "低空物流"],
  ["applicability", /适用|是否需要|要不要|是否符合|能不能|哪些条件|需要满足|满足哪些|有什么条件|可能要满足/, "适用性"],
  ["timeliness", /生效|失效|有效|截至|当前|什么时候/, "时效"],
  ["version_status", /版本|新旧|修订|替代|废止|变化|差异|对比/, "版本关系"],
  ["business_impact", /影响|准备|调整|改造|企业要求|注意事项/, "业务影响"],
  ["airworthiness", /适航|型号合格|审定|航空器合规/, "适航"],
  ["operation", /飞行活动|运营|航线|任务|巡检|测绘|航拍/, "运行管理"],
];

const subjectRules: Array<[string, RegExp]> = [
  ["物流企业", /物流企业|配送企业|物流公司/],
  ["巡检企业", /巡检企业|巡检公司/],
  ["飞行服务商", /飞行服务商|飞服公司/],
  ["运营企业", /运营企业|运营主体|我们公司|企业/],
  ["个人", /个人|爱好者|个人用户/],
];

const scenarioRules: Array<[string, RegExp]> = [
  ["物流配送", /物流|配送/], ["园区巡检", /园区巡检/], ["电力巡检", /电力巡检/],
  ["测绘", /测绘/], ["商业航拍", /商业航拍|影像采集/], ["应急处置", /应急|异常降落|链路中断/],
];

function modeFromInput(input: string): PolicyMode {
  if (/适航|型号合格|审定/.test(input)) return "airworthiness";
  if (/新旧|变化|差异|对比|修订了什么|版本比较/.test(input)) return "version_compare";
  if (/适用|是否需要|要不要|是否符合|能不能|哪些条件|需要满足|满足哪些|有什么条件|可能要满足/.test(input)) return "applicability";
  if (/影响|准备|调整|改造|企业要求/.test(input)) return "business_impact";
  if (/摘要|概括|总结|核心要求|主要内容|要点/.test(input)) return "policy_summary";
  return "policy_qa";
}

function requestedLocatorsFromInput(input: string): string[] {
  const articleLocators = [...input.matchAll(/第\s*([〇零一二三四五六七八九十百\d]+)\s*条/g)]
    .map((match) => `第${match[1]}条`);
  const decimalLocators = [...input.matchAll(/(?:第\s*)?(\d+\.\d+)\s*条/g)]
    .map((match) => `第${match[1]}条`);
  return [...new Set([...articleLocators, ...decimalLocators])];
}

function jurisdictionsFromInput(input: string): { values: string[]; realWorld: boolean } {
  const values: string[] = [];
  if (/样例示范区/.test(input)) values.push("样例示范区");
  if (/景德镇/.test(input)) values.push("景德镇市");
  if (/江西/.test(input)) values.push("江西省");
  if (/全国|国家层面/.test(input)) values.push("全国");
  return { values: [...new Set(values)], realWorld: values.some((item) => item !== "样例示范区") };
}

function contextDocumentIds(request: Ag012InvokeRequest): string[] {
  const ids = request.context?.document_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function previousMonthEnd(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 0));
  return date.toISOString().slice(0, 10);
}

function monthEnd(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

function dateFromInput(input: string): { date: string | null; issue: string | null } {
  const iso = input.match(/(20\d{2})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  const chinese = input.match(/(20\d{2})年(\d{1,2})月(?:(\d{1,2})日)?/);
  const match = iso ?? chinese;
  if (!match) return { date: null, issue: null };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : null;
  if (month < 1 || month > 12 || (day !== null && !validDate(year, month, day))) {
    return { date: null, issue: "提问中的日期无效，请使用真实的年月日。" };
  }
  if (day !== null) return { date: validDate(year, month, day), issue: null };
  if (/以前|之前/.test(input)) return { date: previousMonthEnd(year, month), issue: null };
  if (/截至|月底|月末/.test(input)) return { date: monthEnd(year, month), issue: null };
  if (/以后|之后|自.*起|开始/.test(input)) return { date: validDate(year, month, 1), issue: null };
  return { date: null, issue: "提问只给出了月份，请说明是月初、月末、以前还是以后。" };
}

const shanghaiClock: PolicyClock = {
  today() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  },
};

function documentAliasMatches(input: string, document: DemoPolicyDocument): { any: boolean; specific: boolean } {
  const aliases = [document.title, document.documentNumber, ...document.aliases];
  const matched = aliases.filter((alias) => input.includes(alias));
  return {
    any: matched.length > 0,
    specific: matched.some((alias) => /20\d{2}|试行版|修订稿|〔.+〕/.test(alias) || alias === document.title || alias === document.documentNumber),
  };
}

export class DemoAIPlatformAdapter implements AIPlatformPort {
  readonly portKind = "ai-platform" as const;
  readonly capabilities = ["understanding", "retrieval", "reranking"] as const;
  private readonly clock: PolicyClock;
  constructor(clock: PolicyClock = shanghaiClock) { this.clock = clock; }

  async understandPolicyRequest(request: Ag012InvokeRequest): Promise<PolicyIntent> {
    const input = request.input.trim();
    const mode = modeFromInput(input);
    const topics = topicRules.filter(([, rule]) => rule.test(input)).map(([topic]) => topic);
    const queryTerms = topicRules.filter(([, rule]) => rule.test(input)).map(([, , term]) => term);
    const subjectTypes = subjectRules.filter(([, rule]) => rule.test(input)).map(([subject]) => subject);
    const scenarios = scenarioRules.filter(([, rule]) => rule.test(input)).map(([scenario]) => scenario);
    const jurisdiction = jurisdictionsFromInput(input);
    const jurisdictions = jurisdiction.values;
    const documentTypes: PolicyIntent["documentTypes"] = /适航/.test(input)
      ? ["airworthiness_notice"]
      : /政策|办法|规定|条例/.test(input) && /标准|规范/.test(input)
        ? ["policy", "standard"]
        : /标准|规范/.test(input) ? ["standard"] : ["policy"];
    const explicitIds = contextDocumentIds(request);
    const aliasMatches = DEMO_POLICY_DOCUMENTS.map((document) => ({ document, ...documentAliasMatches(input, document) }));
    const specificAliasIds = aliasMatches.filter((item) => item.specific).map((item) => item.document.id);
    const aliasIds = (specificAliasIds.length ? specificAliasIds : aliasMatches.filter((item) => item.any).map((item) => item.document.id));
    const requestedDocumentIds = explicitIds.length ? [...new Set(explicitIds)] : [...new Set(aliasIds)];
    const domainSignal = /政策|办法|规定|条例|标准|规范|适航|报备|申报|申请|实名登记|管制空域|运行记录|飞行活动|无人机|无人驾驶航空器|物流|巡检|测绘|航拍|生效|版本/.test(input);
    const parsedDate = request.context?.as_of_date ? { date: request.context.as_of_date, issue: null } : dateFromInput(input);
    const needsClarification = !domainSignal || Boolean(parsedDate.issue);
    return {
      mode,
      documentTypes,
      topics,
      queryTerms: [...new Set(queryTerms)],
      jurisdictions,
      subjectTypes,
      scenarios,
      requestedDocumentIds,
      requestedLocators: requestedLocatorsFromInput(input),
      realWorldJurisdiction: jurisdiction.realWorld,
      asOfDate: parsedDate.date ?? this.clock.today(),
      needsClarification,
      clarificationMessage: parsedDate.issue ?? (needsClarification ? "请说明需要查询的政策、标准或适航主题，并补充业务场景；例如政策要点、版本变化、报备要求或适用性问题。" : null),
    };
  }

  async retrievePolicyEvidence(documents: DemoPolicyDocument[], intent: PolicyIntent, query: string): Promise<RankedPolicyEvidence[]> {
    const common = await rankLegacyKnowledge("AG-012", [query, ...intent.queryTerms, ...intent.topics, ...intent.scenarios, ...intent.subjectTypes].join(" "), documents.flatMap((document) => document.sections.map((section) => ({
      id: `${document.id}:${section.id}`, title: `${document.title} ${section.heading}`, content: JSON.stringify({ documentNumber: document.documentNumber, section }),
      sourceUri: `demo-policy://${document.id}/${section.id}`, domain: document.documentType === "standard" ? "standard" : "policy",
    }))));
    const ranked = rankPolicyEvidence(documents, intent, query);
    const retrieved = common.ranks.size ? ranked.filter((item) => common.ranks.has(`${item.document.id}:${item.section.id}`)) : ranked;
    if (retrieved[0]) retrieved[0].rag = { status: common.status, answer: common.answer, evidence: common.evidence, audit: common.audit };
    return retrieved;
  }
}

export class MockPolicyDataAdapter implements PolicyDataPort {
  readonly portKind = "domain-data" as const;
  readonly domain = "policy" as const;
  async searchDocuments(search: PolicyDocumentSearch): Promise<DemoPolicyDocument[]> {
    const candidates = DEMO_POLICY_DOCUMENTS.filter((document) => search.documentTypes.includes(document.documentType));
    const directlyMatched = candidates.filter((document) => documentAliasMatches(search.query, document).any);
    if (directlyMatched.length) return structuredClone(directlyMatched.slice(0, search.limit));

    const officialSignal = /无人驾驶航空器飞行管理暂行条例|761号令|实名登记|国籍登记|飞行活动申请|申请内容|管制空域|120米|主体责任|景德镇|江西|全国/.test(search.query);
    const demoPolicySignal = /样例|样政|试行版|修订稿|新旧政策|旧政策|新政策|报备|运行记录|记录保存|数字化记录/.test(search.query);
    const scoped = candidates.filter((document) => {
      if (document.documentType === "standard") return true;
      if (officialSignal) return document.id.startsWith("OFFICIAL-");
      if (demoPolicySignal) return document.id.startsWith("DEMO-POLICY-");
      return document.id.startsWith("OFFICIAL-");
    });
    return structuredClone(scoped.slice(0, search.limit));
  }

  async getDocuments(ids: string[]): Promise<DemoPolicyDocument[]> {
    return structuredClone(DEMO_POLICY_DOCUMENTS.filter((document) => ids.includes(document.id)));
  }

  async getVersionChains(chainIds: string[]): Promise<DemoPolicyDocument[]> {
    return structuredClone(DEMO_POLICY_DOCUMENTS.filter((document) => chainIds.includes(document.versionChainId)));
  }
}
