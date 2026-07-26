import type { AgentInvokeRequest, ManualTopic } from "../../contracts";
import { DependencyUnavailableError } from "../../reliability";
import { DEMO_MANUALS } from "./catalog";
import { AG002_CONFIG } from "./config";
import { rankManualSections } from "./engine";
import {
  DemoManualContentSchema,
  type ManualDocumentSource,
  type ManualIntent,
  type ParsedManual,
  type RankedManualSection,
} from "./types";

export interface AIPlatformPort {
  understandManualRequest(request: AgentInvokeRequest, options?: { signal?: AbortSignal }): Promise<ManualIntent>;
  parseManualDocument(document: ManualDocumentSource, options?: { signal?: AbortSignal }): Promise<ParsedManual>;
  retrieveManualEvidence(
    document: ParsedManual,
    intent: ManualIntent,
    query: string,
    options?: { signal?: AbortSignal },
  ): Promise<RankedManualSection[]>;
}

export interface DocumentDataPort {
  listDocuments(options?: { signal?: AbortSignal }): Promise<ManualDocumentSource[]>;
  getDocument(id: string, options?: { signal?: AbortSignal }): Promise<ManualDocumentSource | null>;
}

const topicRules: Array<[ManualTopic, RegExp]> = [
  ["troubleshooting", /故障|漂移|异常|告警|排查|无法|失控(?!保护)|断联/],
  ["compliance", /合规|法规|空域|禁飞|限飞|审批|申报|资质/],
  ["safety", /安全|风险|危险|注意|禁忌|禁止|不得|飞行前/],
  ["operation", /操作步骤|操作方法|使用步骤|步骤|检查|开机|飞行|起飞|降落|充电|维护|保养|返航(?!点)/],
  ["terminology", /术语|解释|什么意思|含义|通俗|GNSS|RTH|IMU|返航点|失控保护|Failsafe/i],
  ["overview", /核心功能|主要功能|适用边界|使用限制|关键内容|产品介绍|说明书.{0,6}(摘要|概括)|(摘要|概括).{0,6}(说明书|手册)/],
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
  const documentId = request.context?.document_id;
  return typeof documentId === "string" && documentId.trim() ? documentId.trim() : AG002_CONFIG.defaultManualId;
}

function toDocumentSource(manual: (typeof DEMO_MANUALS)[number]): ManualDocumentSource {
  return {
    id: manual.id,
    title: manual.title,
    productName: manual.productName,
    version: manual.version,
    updatedAt: manual.updatedAt,
    aliases: [...manual.aliases],
    sourceType: "虚构样例说明书",
    artifact: {
      kind: "inline-demo",
      mimeType: "application/vnd.jdz.manual+json",
      content: JSON.stringify({ structure: manual.structure, sections: manual.sections }),
    },
  };
}

export class DemoAIPlatformAdapter implements AIPlatformPort {
  async understandManualRequest(request: AgentInvokeRequest): Promise<ManualIntent> {
    const input = request.input.trim();
    const topics = topicRules.filter(([, rule]) => rule.test(input)).map(([topic]) => topic);
    const scenarios = scenarioRules.filter(([, rule]) => rule.test(input)).map(([scenario]) => scenario);
    const terms = knownTerms.filter(([, rule]) => rule.test(input)).map(([term]) => term);

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

  async parseManualDocument(document: ManualDocumentSource): Promise<ParsedManual> {
    if (document.artifact.kind !== "inline-demo") {
      throw new DependencyUnavailableError("ag002.ai-platform-document-parse", "Demo adapter cannot parse remote documents");
    }
    let unknownContent: unknown;
    try {
      unknownContent = JSON.parse(document.artifact.content);
    } catch (error) {
      throw new DependencyUnavailableError("ag002.ai-platform-document-parse", "Demo manual content is invalid JSON", { cause: error });
    }
    const content = DemoManualContentSchema.parse(unknownContent);
    return {
      id: document.id,
      title: document.title,
      productName: document.productName,
      version: document.version,
      updatedAt: document.updatedAt,
      aliases: [...document.aliases],
      sourceType: document.sourceType,
      structure: { ...content.structure },
      sections: content.sections,
      recognitionMode: "demo-preparsed",
    };
  }

  async retrieveManualEvidence(document: ParsedManual, intent: ManualIntent, query: string): Promise<RankedManualSection[]> {
    return rankManualSections(document, intent, query);
  }
}

export class MockDocumentDataAdapter implements DocumentDataPort {
  async listDocuments(): Promise<ManualDocumentSource[]> {
    return DEMO_MANUALS.map(toDocumentSource);
  }

  async getDocument(id: string): Promise<ManualDocumentSource | null> {
    const document = DEMO_MANUALS.find((manual) => manual.id === id);
    return document ? toDocumentSource(document) : null;
  }
}
