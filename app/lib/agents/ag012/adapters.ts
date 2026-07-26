import type { Ag012InvokeRequest, PolicyMode, PolicyTopic } from "../../contracts";
import { DEMO_POLICY_DOCUMENTS } from "./catalog";
import { AG012_CONFIG } from "./config";
import { rankPolicyEvidence } from "./engine";
import type { DemoPolicyDocument, PolicyIntent, RankedPolicyEvidence } from "./types";

export interface AIPlatformPort {
  understandPolicyRequest(request: Ag012InvokeRequest, options?: { signal?: AbortSignal }): Promise<PolicyIntent>;
  retrievePolicyEvidence(documents: DemoPolicyDocument[], intent: PolicyIntent, query: string, options?: { signal?: AbortSignal }): Promise<RankedPolicyEvidence[]>;
}

export interface PolicyDataPort {
  listDocuments(options?: { signal?: AbortSignal }): Promise<DemoPolicyDocument[]>;
  getDocuments(ids: string[], options?: { signal?: AbortSignal }): Promise<DemoPolicyDocument[]>;
}

const topicRules: Array<[PolicyTopic, RegExp, string]> = [
  ["scope", /适用范围|适用对象|哪些主体|覆盖范围/, "适用范围"],
  ["filing", /报备|申报|提交|提前几天|工作日/, "报备"],
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

function contextDocumentIds(request: Ag012InvokeRequest): string[] {
  const ids = request.context?.document_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

function dateFromInput(input: string): string | null {
  const iso = input.match(/(20\d{2})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  const chinese = input.match(/(20\d{2})年(\d{1,2})月(?:(\d{1,2})日)?/);
  const match = iso ?? chinese;
  if (!match) return null;
  const month = String(Number(match[2])).padStart(2, "0");
  const day = String(Number(match[3] ?? "1")).padStart(2, "0");
  return `${match[1]}-${month}-${day}`;
}

export class DemoAIPlatformAdapter implements AIPlatformPort {
  async understandPolicyRequest(request: Ag012InvokeRequest): Promise<PolicyIntent> {
    const input = request.input.trim();
    const mode = modeFromInput(input);
    const topics = topicRules.filter(([, rule]) => rule.test(input)).map(([topic]) => topic);
    const queryTerms = topicRules.filter(([, rule]) => rule.test(input)).map(([, , term]) => term);
    const subjectTypes = subjectRules.filter(([, rule]) => rule.test(input)).map(([subject]) => subject);
    const scenarios = scenarioRules.filter(([, rule]) => rule.test(input)).map(([scenario]) => scenario);
    const jurisdictions = /样例示范区/.test(input) ? ["样例示范区"] : [];
    const documentTypes: PolicyIntent["documentTypes"] = /适航/.test(input) ? ["airworthiness_notice"] : /标准|规范/.test(input) ? ["standard"] : ["policy"];
    const explicitIds = contextDocumentIds(request);
    const aliasIds = DEMO_POLICY_DOCUMENTS.filter((document) => [document.title, document.documentNumber, ...document.aliases].some((alias) => input.includes(alias))).map((document) => document.id);
    const requestedDocumentIds = [...new Set([...explicitIds, ...aliasIds])];
    if (mode === "version_compare") {
      for (const document of DEMO_POLICY_DOCUMENTS.filter((item) => item.versionChainId === "DEMO-CHAIN-FLIGHT-MGMT")) {
        if (!requestedDocumentIds.includes(document.id)) requestedDocumentIds.push(document.id);
      }
    }
    const domainSignal = /政策|办法|规定|标准|规范|适航|报备|申报|运行记录|物流|巡检|测绘|航拍|生效|版本/.test(input);
    const needsClarification = !domainSignal;
    return {
      mode,
      documentTypes,
      topics,
      queryTerms: [...new Set(queryTerms)],
      jurisdictions,
      subjectTypes,
      scenarios,
      requestedDocumentIds,
      asOfDate: request.context?.as_of_date ?? dateFromInput(input) ?? AG012_CONFIG.defaultAsOfDate,
      needsClarification,
      clarificationMessage: needsClarification ? "请说明需要查询的政策、标准或适航主题，并补充业务场景；例如政策要点、版本变化、报备要求或适用性问题。" : null,
    };
  }

  async retrievePolicyEvidence(documents: DemoPolicyDocument[], intent: PolicyIntent, query: string): Promise<RankedPolicyEvidence[]> {
    return rankPolicyEvidence(documents, intent, query);
  }
}

export class MockPolicyDataAdapter implements PolicyDataPort {
  async listDocuments(): Promise<DemoPolicyDocument[]> {
    return structuredClone(DEMO_POLICY_DOCUMENTS);
  }

  async getDocuments(ids: string[]): Promise<DemoPolicyDocument[]> {
    return structuredClone(DEMO_POLICY_DOCUMENTS.filter((document) => ids.includes(document.id)));
  }
}
