import type { AgentInvokeRequest, ManualTopic } from "../../contracts";
import { DEMO_MANUALS } from "./catalog";
import { AG002_CONFIG } from "./config";
import type { DemoManualAsset, ManualIntent, ParsedManual } from "./types";

export interface AIPlatformPort {
  understandManualRequest(request: AgentInvokeRequest, options?: { signal?: AbortSignal }): Promise<ManualIntent>;
  parseManualDocument(document: DemoManualAsset, options?: { signal?: AbortSignal }): Promise<ParsedManual>;
}

export interface DocumentDataPort {
  listDocuments(options?: { signal?: AbortSignal }): Promise<DemoManualAsset[]>;
  getDocument(id: string, options?: { signal?: AbortSignal }): Promise<DemoManualAsset | null>;
}

const topicRules: Array<[ManualTopic, RegExp]> = [
  ["troubleshooting", /故障|漂移|异常|告警|排查|无法|失控(?!保护)|断联/],
  ["compliance", /合规|法规|空域|禁飞|限飞|审批|申报|资质/],
  ["safety", /安全|风险|危险|注意|禁忌|禁止|不得|飞行前/],
  ["operation", /步骤|怎么|如何|操作|检查|开机|飞行|充电|维护|保养|返航(?!点)/],
  ["terminology", /术语|解释|什么意思|通俗|GNSS|RTH|IMU|返航点|失控保护|Failsafe/i],
  ["overview", /核心功能|主要功能|概括|摘要|关键内容|产品介绍/],
];

const scenarioRules: Array<[string, RegExp]> = [
  ["飞行前检查", /飞行前|起飞前|安全检查/],
  ["定位漂移", /定位漂移|漂移|卫星不足|GNSS弱/i],
  ["充电", /充电|电池|充电器/],
  ["维护", /维护|保养|清洁|周期检查/],
  ["失控", /失控(?!保护)|断联|信号中断|Failsafe/i],
  ["返航", /返航(?!点)|RTH/i],
  ["飞行", /飞行|起飞|降落/],
];

const knownTerms: Array<[string, RegExp]> = [
  ["GNSS", /GNSS|卫星定位/i],
  ["RTH", /\bRTH\b|自动返航/i],
  ["返航点", /返航点|Home点/i],
  ["IMU", /\bIMU\b|惯性测量单元/i],
  ["失控保护", /失控保护|Failsafe/i],
];

function manualIdFromContext(request: AgentInvokeRequest): string {
  return typeof request.context?.document_id === "string" && request.context.document_id.trim()
    ? request.context.document_id.trim()
    : AG002_CONFIG.defaultManualId;
}

export class DemoAIPlatformAdapter implements AIPlatformPort {
  async understandManualRequest(request: AgentInvokeRequest): Promise<ManualIntent> {
    const input = request.input.trim();
    const topics = topicRules.filter(([, rule]) => rule.test(input)).map(([topic]) => topic);
    const scenarios = scenarioRules.filter(([, rule]) => rule.test(input)).map(([scenario]) => scenario);
    const terms = knownTerms.filter(([, rule]) => rule.test(input)).map(([term]) => term);

    if (/说明书|手册/.test(input) && topics.length === 0) topics.push("overview");
    if (/飞行前|起飞前/.test(input)) {
      if (!topics.includes("operation")) topics.push("operation");
      if (!topics.includes("safety")) topics.push("safety");
    }
    if (terms.length && !topics.includes("terminology")) topics.push("terminology");

    const needsClarification = topics.length === 0;
    return {
      manualId: manualIdFromContext(request),
      topics,
      scenarios,
      terms,
      needsClarification,
      clarificationMessage: needsClarification
        ? "请说明想了解的产品手册问题，例如飞行前检查、充电、维护、定位漂移、专业术语或合规要求。"
        : null,
    };
  }

  async parseManualDocument(document: DemoManualAsset): Promise<ParsedManual> {
    return {
      ...document,
      structure: { ...document.structure },
      sections: document.sections.map((section) => ({
        ...section,
        topics: [...section.topics],
        scenarios: [...section.scenarios],
        imageCaptions: [...section.imageCaptions],
        steps: section.steps.map((step) => ({ ...step })),
        risks: section.risks.map((risk) => ({ ...risk })),
        glossary: section.glossary.map((item) => ({ ...item, aliases: [...item.aliases] })),
      })),
      recognitionMode: "demo-preparsed",
    };
  }
}

export class MockDocumentDataAdapter implements DocumentDataPort {
  async listDocuments(): Promise<DemoManualAsset[]> {
    return DEMO_MANUALS.map((manual) => ({ ...manual, structure: { ...manual.structure }, sections: [...manual.sections] }));
  }

  async getDocument(id: string): Promise<DemoManualAsset | null> {
    const document = DEMO_MANUALS.find((manual) => manual.id === id);
    return document ? { ...document, structure: { ...document.structure }, sections: [...document.sections] } : null;
  }
}
