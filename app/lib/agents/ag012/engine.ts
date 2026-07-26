import type { AgentPolicyOutput, PolicyTopic } from "../../contracts";
import { AG012_CONFIG } from "./config";
import type { DemoPolicyDocument, PolicyIntent, RankedPolicyEvidence } from "./types";

export type EffectiveStatus = "effective" | "upcoming" | "expired";

export function effectiveStatus(document: DemoPolicyDocument, asOfDate: string): EffectiveStatus {
  if (asOfDate < document.effectiveFrom) return "upcoming";
  if (document.effectiveTo && asOfDate > document.effectiveTo) return "expired";
  return "effective";
}

function topicMatchesChange(topics: PolicyTopic[], topic: string): boolean {
  if (topics.length === 0) return true;
  return topics.some((item) => (
    (item === "scope" || item === "logistics" || item === "applicability") && topic === "适用范围"
  ) || (item === "filing" && ["活动报备", "重大变更"].includes(topic))
    || (item === "record_retention" && topic === "运行记录")
    || item === "business_impact" || item === "version_status");
}

export function rankPolicyEvidence(
  documents: DemoPolicyDocument[],
  intent: PolicyIntent,
  query: string,
): RankedPolicyEvidence[] {
  const changedSectionIds = new Set(documents.flatMap((document) => document.versionChanges.flatMap((change) => [change.oldSectionId, change.newSectionId])));
  const ranked = documents.flatMap((document) => document.sections.map((section) => {
    const topicMatches = intent.topics.filter((topic) => section.topics.includes(topic));
    const keywordMatches = section.keywords.filter((keyword) => query.includes(keyword) || intent.queryTerms.some((term) => keyword.includes(term) || term.includes(keyword)));
    const scenarioMatches = intent.scenarios.filter((scenario) => section.scenarios.includes(scenario));
    const subjectMatches = intent.subjectTypes.filter((subject) => section.appliesTo.includes(subject));
    const documentMatch = intent.requestedDocumentIds.includes(document.id);
    const changeMatch = intent.mode === "version_compare" && changedSectionIds.has(section.id);
    const summaryBaseline = intent.mode === "policy_summary" ? 5 : 0;
    const baseScore = topicMatches.length * 12 + keywordMatches.length * 10 + scenarioMatches.length * 14
      + subjectMatches.length * 8 + (documentMatch ? 18 : 0) + (changeMatch ? 20 : 0) + summaryBaseline;
    const rawScore = baseScore + (baseScore > 0 && effectiveStatus(document, intent.asOfDate) === "effective" ? 6 : 0);
    const matchReasons = [
      ...topicMatches.map((topic) => `主题:${topic}`),
      ...keywordMatches.map((keyword) => `关键词:${keyword}`),
      ...scenarioMatches.map((scenario) => `场景:${scenario}`),
      ...subjectMatches.map((subject) => `主体:${subject}`),
      ...(documentMatch ? ["指定文档"] : []),
      ...(changeMatch ? ["版本变化依据"] : []),
      ...(summaryBaseline ? ["摘要范围"] : []),
    ];
    return { document, section, rawScore, relevance: Math.min(1, Number((rawScore / 62).toFixed(2))), matchReasons };
  }));

  return ranked
    .filter((item) => item.rawScore > 0 && item.matchReasons.length > 0)
    .sort((a, b) => b.rawScore - a.rawScore || b.document.effectiveFrom.localeCompare(a.document.effectiveFrom) || a.section.locator.localeCompare(b.section.locator))
    .slice(0, AG012_CONFIG.maxEvidence)
    .map(({ document, section, relevance, matchReasons }) => ({ document, section, relevance, matchReasons }));
}

function selectCurrentVersion(documents: DemoPolicyDocument[], asOfDate: string) {
  const policyDocuments = documents.filter((document) => document.documentType === "policy");
  const candidates = policyDocuments.length ? policyDocuments : documents;
  return [...candidates].sort((a, b) => {
    const aStatus = effectiveStatus(a, asOfDate);
    const bStatus = effectiveStatus(b, asOfDate);
    const order = { effective: 0, upcoming: 1, expired: 2 } as const;
    return order[aStatus] - order[bStatus]
      || (aStatus === "upcoming" ? a.effectiveFrom.localeCompare(b.effectiveFrom) : b.effectiveFrom.localeCompare(a.effectiveFrom));
  })[0] ?? null;
}

function sourceRef(document: DemoPolicyDocument, sectionId: string): string {
  const section = document.sections.find((item) => item.id === sectionId);
  return section ? `${document.version} · ${section.locator}` : `${document.version} · 未定位`;
}

export function buildPolicyOutput(
  documents: DemoPolicyDocument[],
  intent: PolicyIntent,
  rankedEvidence: RankedPolicyEvidence[],
): AgentPolicyOutput {
  const currentDocument = selectCurrentVersion(documents, intent.asOfDate);
  const currentEvidence = rankedEvidence.filter((item) => item.document.id === currentDocument?.id);
  const evidence = intent.mode === "version_compare" || intent.mode === "business_impact"
    ? rankedEvidence
    : currentEvidence.length > 0
      ? currentEvidence
      : rankedEvidence;
  const latestWithChanges = [...documents].filter((document) => document.versionChanges.length)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const changes = intent.mode === "version_compare" || intent.mode === "business_impact"
    ? (latestWithChanges?.versionChanges ?? []).filter((change) => topicMatchesChange(intent.topics, change.topic)).map((change) => {
      const oldDocument = documents.find((document) => document.id === latestWithChanges?.replacesId) ?? documents.find((document) => document.sections.some((section) => section.id === change.oldSectionId));
      return {
        id: change.id,
        topic: change.topic,
        change_type: change.changeType,
        explanation: change.explanation,
        business_impact: change.businessImpact,
        old_source_ref: oldDocument ? sourceRef(oldDocument, change.oldSectionId) : "旧版本依据待接入",
        new_source_ref: latestWithChanges ? sourceRef(latestWithChanges, change.newSectionId) : "新版本依据待接入",
      };
    })
    : [];

  const keyPointEvidence = evidence.filter((item) => intent.mode === "version_compare" || intent.mode === "business_impact" || item.document.id === currentDocument?.id);
  const keyPoints = [...new Set((keyPointEvidence.length ? keyPointEvidence : evidence).map((item) => item.section.plainLanguage))].slice(0, 5);
  const applicability = intent.mode === "applicability" ? [
    {
      condition: "适用地区",
      assessment: intent.jurisdictions.length ? (currentDocument && intent.jurisdictions.includes(currentDocument.jurisdiction) ? "matched" as const : "not_matched" as const) : "unknown" as const,
      explanation: intent.jurisdictions.length ? `提问地区为${intent.jurisdictions.join("、")}；样例文件适用地区为${currentDocument?.jurisdiction ?? "未知"}。` : "提问中没有明确地区，无法核对地域适用范围。",
      source_ref: currentDocument ? `${currentDocument.version} · 文档适用地区` : "待核实",
    },
    {
      condition: "主体类型",
      assessment: intent.subjectTypes.length
        ? (evidence.some((item) => intent.subjectTypes.some((subject) => item.section.appliesTo.includes(subject))) ? "matched" as const : "not_matched" as const)
        : "unknown" as const,
      explanation: intent.subjectTypes.length ? `已按${intent.subjectTypes.join("、")}核对条款适用主体。` : "提问中没有明确企业或个人等主体类型。",
      source_ref: evidence[0] ? `${evidence[0].document.version} · ${evidence[0].section.locator}` : "待核实",
    },
    {
      condition: "业务场景",
      assessment: intent.scenarios.length
        ? (evidence.some((item) => intent.scenarios.some((scenario) => item.section.scenarios.includes(scenario))) ? "matched" as const : "not_matched" as const)
        : "unknown" as const,
      explanation: intent.scenarios.length ? `已按${intent.scenarios.join("、")}核对已收录场景。` : "提问中没有明确巡检、物流、测绘或航拍等业务场景。",
      source_ref: evidence[0] ? `${evidence[0].document.version} · ${evidence[0].section.locator}` : "待核实",
    },
    {
      condition: "版本时效",
      assessment: currentDocument && effectiveStatus(currentDocument, intent.asOfDate) === "effective" ? "matched" as const : "unknown" as const,
      explanation: currentDocument ? `截至${intent.asOfDate}，${currentDocument.version}处于${effectiveStatus(currentDocument, intent.asOfDate) === "effective" ? "有效" : "待生效或已失效"}状态。` : "未找到可判断的版本链。",
      source_ref: currentDocument ? `${currentDocument.version} · 生效信息` : "待核实",
    },
  ] : [];

  const reviewItems = [
    ...(intent.mode === "applicability" ? ["政策适用性会受地区、主体资质、具体活动和主管部门执行口径影响，需由专业人员最终确认。"] : []),
    ...(intent.mode === "business_impact" ? ["业务影响属于辅助分析，应结合企业现有流程、正式政策文本和主管部门口径复核。"] : []),
    ...(evidence.some((item) => effectiveStatus(item.document, intent.asOfDate) === "upcoming") ? ["结果引用了尚未生效的修订稿，执行时必须区分当前有效要求与未来准备事项。"] : []),
    ...(applicability.some((item) => item.assessment === "unknown") ? ["地区、主体或业务场景信息不完整，当前只能给出条件性判断。"] : []),
  ];
  const currentStatus = currentDocument ? effectiveStatus(currentDocument, intent.asOfDate) : null;
  const answer = intent.mode === "version_compare"
    ? `已识别同一政策版本链中的${changes.length}项主要变化。截至${intent.asOfDate}，${currentDocument?.version ?? "尚无可确认版本"}${currentStatus === "effective" ? "仍为当前有效版本" : "不是当前有效版本"}。`
    : intent.mode === "business_impact"
      ? `基于样例版本变化，识别出${changes.length}项可能影响报备、任务变更或记录管理的准备事项。`
      : intent.mode === "applicability"
        ? `已按地区、主体、业务场景和版本时效拆分适用条件；当前结果是辅助判断，不构成最终政策适用结论。`
        : `截至${intent.asOfDate}，基于${currentDocument?.version ?? "已检索样例材料"}形成带版本和条款定位的解读。${keyPoints[0] ?? ""}`;

  return {
    engine: "langgraph-demo",
    mode: intent.mode,
    intent: {
      document_types: intent.documentTypes,
      topics: intent.topics,
      query_terms: intent.queryTerms,
      jurisdictions: intent.jurisdictions,
      subject_types: intent.subjectTypes,
      scenarios: intent.scenarios,
      requested_document_ids: intent.requestedDocumentIds,
      as_of_date: intent.asOfDate,
    },
    current_version: currentDocument && currentStatus ? {
      document_id: currentDocument.id,
      title: currentDocument.title,
      version: currentDocument.version,
      effective_status: currentStatus,
      as_of_date: intent.asOfDate,
      explanation: currentStatus === "effective"
        ? `在${intent.asOfDate}处于有效期内。`
        : currentStatus === "upcoming" ? `将于${currentDocument.effectiveFrom}生效。` : `已于${currentDocument.effectiveTo ?? currentDocument.effectiveFrom}结束有效。`,
    } : null,
    documents: documents.map((document) => ({
      id: document.id,
      title: document.title,
      document_number: document.documentNumber,
      issuer: document.issuer,
      document_type: document.documentType,
      jurisdiction: document.jurisdiction,
      version: document.version,
      published_at: document.publishedAt,
      effective_from: document.effectiveFrom,
      effective_to: document.effectiveTo,
      effective_status: effectiveStatus(document, intent.asOfDate),
      replaces_id: document.replacesId,
      source_type: document.sourceType,
    })),
    answer,
    key_points: keyPoints,
    changes,
    applicability,
    citations: evidence.slice(0, 7).map((item) => ({
      document_id: item.document.id,
      document_title: item.document.title,
      document_number: item.document.documentNumber,
      version: item.document.version,
      locator: item.section.locator,
      excerpt: item.section.text,
      relevance: item.relevance,
      effective_status: effectiveStatus(item.document, intent.asOfDate),
    })),
    review_items: [...new Set(reviewItems)],
    capability_coverage: AG012_CONFIG.capabilityCoverage.map((item) => ({ ...item })),
    data_notice: "当前仅使用虚构政策与标准样例验证知识检索、版本识别和引用流程；不得据此执行真实申报、合规或适航决策。正式结果需接入权威政策库、现行标准及主管部门口径。",
    rule_version: AG012_CONFIG.ruleVersion,
  };
}
