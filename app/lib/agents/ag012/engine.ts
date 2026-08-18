import type { AgentPolicyOutput, PolicyTopic } from "../../contracts";
import { AG012_CONFIG } from "./config";
import type { DemoPolicyDocument, PolicyIntent, RankedPolicyEvidence } from "./types";
import { toAgentRagRuntime } from "../../rag/output.ts";

export type EffectiveStatus = "effective" | "upcoming" | "expired";

const GENERIC_POLICY_KEYWORDS = new Set(["航空器", "飞行", "政策", "标准", "规定", "条例", "要求"]);

export function effectiveStatus(document: DemoPolicyDocument, asOfDate: string): EffectiveStatus {
  if (asOfDate < document.effectiveFrom) return "upcoming";
  if (document.effectiveTo && asOfDate > document.effectiveTo) return "expired";
  return "effective";
}

function topicMatchesChange(topics: PolicyTopic[], topic: string): boolean {
  const filterableTopics: PolicyTopic[] = ["scope", "logistics", "applicability", "filing", "record_retention"];
  const concreteTopics = topics.filter((item) => filterableTopics.includes(item));
  if (concreteTopics.length === 0) return true;
  return concreteTopics.some((item) => (
    (item === "scope" || item === "logistics" || item === "applicability") && topic === "适用范围"
  ) || (item === "filing" && ["活动报备", "重大变更"].includes(topic))
    || (item === "record_retention" && topic === "运行记录")
  );
}

export function rankPolicyEvidence(
  documents: DemoPolicyDocument[],
  intent: PolicyIntent,
  query: string,
): RankedPolicyEvidence[] {
  const changedSectionIds = new Set(documents.flatMap((document) => document.versionChanges.flatMap((change) => [change.oldSectionId, change.newSectionId])));
  const ranked = documents.flatMap((document) => document.sections.map((section) => {
    const topicMatches = intent.topics.filter((topic) => section.topics.includes(topic));
    const keywordMatches = section.keywords.filter((keyword) => !GENERIC_POLICY_KEYWORDS.has(keyword)
      && (query.includes(keyword) || intent.queryTerms.some((term) => keyword.includes(term) || term.includes(keyword))));
    const scenarioMatches = intent.scenarios.filter((scenario) => section.scenarios.includes(scenario));
    const subjectMatches = intent.subjectTypes.filter((subject) => section.appliesTo.includes(subject));
    const documentMatch = intent.requestedDocumentIds.includes(document.id);
    const locatorMatch = intent.requestedLocators.includes(section.locator);
    const changeMatch = intent.mode === "version_compare" && changedSectionIds.has(section.id);
    const summaryBaseline = intent.mode === "policy_summary" ? 5 : 0;
    const baseScore = topicMatches.length * 12 + keywordMatches.length * 10 + scenarioMatches.length * 14
      + subjectMatches.length * 8 + (documentMatch ? 18 : 0) + (locatorMatch ? 50 : 0) + (changeMatch ? 20 : 0) + summaryBaseline;
    const rawScore = baseScore + (baseScore > 0 && effectiveStatus(document, intent.asOfDate) === "effective" ? 6 : 0);
    const matchReasons = [
      ...topicMatches.map((topic) => `主题:${topic}`),
      ...keywordMatches.map((keyword) => `关键词:${keyword}`),
      ...scenarioMatches.map((scenario) => `场景:${scenario}`),
      ...subjectMatches.map((subject) => `主体:${subject}`),
      ...(documentMatch ? ["指定文档"] : []),
      ...(locatorMatch ? ["指定条款"] : []),
      ...(changeMatch ? ["版本变化依据"] : []),
      ...(summaryBaseline ? ["摘要范围"] : []),
    ];
    return { document, section, rawScore, relevance: Math.min(1, Number((rawScore / 62).toFixed(2))), matchReasons };
  }));

  const hasPreciseMatch = ranked.some((item) => item.matchReasons.some((reason) => reason.startsWith("关键词:") || reason === "指定条款"));
  return ranked
    .filter((item) => item.rawScore > 0 && item.matchReasons.length > 0
      && (!intent.requestedLocators.length || intent.requestedLocators.includes(item.section.locator))
      && (!hasPreciseMatch || item.matchReasons.some((reason) => reason.startsWith("关键词:") || reason === "指定条款" || reason === "版本变化依据")))
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

function requirementKind(section: DemoPolicyDocument["sections"][number]): AgentPolicyOutput["requirement_items"][number]["kind"] {
  if (/实名登记/.test(section.heading)) return "registration";
  if (/管制空域|飞行限制/.test(section.heading)) return "airspace_restriction";
  if (/主体责任/.test(section.heading)) return "safety_responsibility";
  if (/飞行活动申请/.test(section.heading)) return "application_timing";
  if (/申请内容/.test(section.heading)) return "application_materials";
  if (section.topics.includes("record_retention")) return "record_retention";
  if (section.topics.includes("operation_safety")) return "operational_safety";
  if (section.topics.includes("filing")) return "filing";
  if (section.topics.includes("scope")) return "scope";
  return "other";
}

function deadlineFromText(text: string): string | null {
  const matches = text.match(/(?:拟飞行前\d+日\d+时前|飞行前\d+日\d+时前|前[一二三四五六七八九十\d]+个工作日|不少于[一二三四五六七八九十\d]+个月|至少每[一二三四五六七八九十\d]+个月)/g);
  return matches?.join("；") ?? null;
}

function buildVerificationSteps(
  requirementItems: AgentPolicyOutput["requirement_items"],
  missingReferencedLocators: string[],
  intent: PolicyIntent,
): AgentPolicyOutput["verification_steps"] {
  const steps: AgentPolicyOutput["verification_steps"] = [];
  const push = (action: string, reason: string, sourceRefValue: string, externalConfirmation: boolean) => {
    if (steps.some((item) => item.action === action)) return;
    steps.push({ order: steps.length + 1, action, reason, source_ref: sourceRefValue, external_confirmation: externalConfirmation });
  };
  for (const item of requirementItems) {
    if (item.kind === "registration") push("核对航空器所有者实名登记状态；涉及境外飞行的，另行核对国籍登记要求。", "登记状态是开展后续飞行活动前需要确认的基础事项。", item.source_ref, false);
    if (item.kind === "airspace_restriction") push("通过有关机构依法公布的渠道核对拟飞空域边界和管制属性。", "条例只规定管制空域类别，具体边界仍以有关机构公布信息为准。", item.source_ref, true);
    if (item.kind === "safety_responsibility") push("明确飞行活动组织者及事故预防责任，并留存安全措施。", "飞行活动组织者承担飞行安全主体责任。", item.source_ref, false);
    if (item.kind === "application_timing") push("核对是否需要提出飞行活动申请，并按条款时限准备提交。", item.deadline ? `当前条款涉及${item.deadline}等时间要求。` : "申请时限需以当前有效条款为准。", item.source_ref, true);
    if (item.kind === "application_materials") push("准备主体、操控人员、航空器、任务、场地、时间空域、通信导航和应急程序等申请信息。", "申请材料需要覆盖条款列明的必要信息，不能只提交任务名称。", item.source_ref, false);
    if (item.kind === "record_retention") push("按当前有效版本核对运行记录字段和保存期限。", item.deadline ? `当前材料涉及${item.deadline}的保存要求。` : "保存期限需随版本变化同步调整。", item.source_ref, false);
    if (item.kind === "operational_safety") push("把条款中的任务前检查、风险评估或应急要求纳入作业准备。", "安全要求需要落实到具体任务条件，并由具备资质的人员确认。", item.source_ref, true);
  }
  if (missingReferencedLocators.length) {
    push(`补充核验${missingReferencedLocators.join("、")}及其例外条件。`, "当前已收录条款引用了未收录条款，未核验前不能把一般规则解释为无例外要求。", `缺少交叉引用：${missingReferencedLocators.join("、")}`, true);
  }
  if (intent.jurisdictions.some((item) => item !== "全国" && item !== "样例示范区")) {
    push(`补充核验${intent.jurisdictions.join("、")}的地方政策、实时空域信息和主管部门执行口径。`, "全国层面依据不能替代具体地区的补充要求和实时状态。", "地方材料与主管部门口径待接入", true);
  }
  return steps;
}

export function buildPolicyOutput(
  documents: DemoPolicyDocument[],
  intent: PolicyIntent,
  rankedEvidence: RankedPolicyEvidence[],
  engine: AgentPolicyOutput["engine"] = "langgraph-demo",
): AgentPolicyOutput {
  const currentDocument = selectCurrentVersion(documents, intent.asOfDate);
  const currentEvidence = rankedEvidence.filter((item) => item.document.id === currentDocument?.id);
  const evidence = intent.mode === "version_compare" || intent.mode === "business_impact"
    ? rankedEvidence
    : currentDocument
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
  const jointApplicabilityEvidence = evidence.find((item) => (
    (!intent.subjectTypes.length || intent.subjectTypes.some((subject) => item.section.appliesTo.includes(subject)))
    && (!intent.scenarios.length || intent.scenarios.some((scenario) => item.section.scenarios.includes(scenario)))
  ));
  const subjectEvidence = jointApplicabilityEvidence ?? evidence.find((item) => intent.subjectTypes.some((subject) => item.section.appliesTo.includes(subject)));
  const scenarioEvidence = jointApplicabilityEvidence ?? evidence.find((item) => intent.scenarios.some((scenario) => item.section.scenarios.includes(scenario)));
  const subjectSourceEvidence = intent.scenarios.length ? jointApplicabilityEvidence : subjectEvidence;
  const scenarioSourceEvidence = intent.subjectTypes.length ? jointApplicabilityEvidence : scenarioEvidence;
  const applicability = intent.mode === "applicability" ? [
    {
      condition: "适用地区",
      assessment: intent.jurisdictions.length ? (currentDocument && (currentDocument.jurisdiction === "全国" || intent.jurisdictions.includes(currentDocument.jurisdiction)) ? "matched" as const : "not_matched" as const) : "unknown" as const,
      explanation: intent.jurisdictions.length ? `提问地区为${intent.jurisdictions.join("、")}；样例文件适用地区为${currentDocument?.jurisdiction ?? "未知"}。` : "提问中没有明确地区，无法核对地域适用范围。",
      source_ref: currentDocument ? `${currentDocument.version} · 文档适用地区` : "待核实",
    },
    {
      condition: "主体类型",
      assessment: intent.subjectTypes.length
        ? (subjectEvidence && (!intent.scenarios.length || jointApplicabilityEvidence) ? "matched" as const : "not_matched" as const)
        : "unknown" as const,
      explanation: intent.subjectTypes.length
        ? (subjectSourceEvidence ? `已按${intent.subjectTypes.join("、")}核对条款适用主体。` : "未找到同时支持提问主体与业务场景的同一条款依据。")
        : "提问中没有明确企业或个人等主体类型。",
      source_ref: subjectSourceEvidence ? `${subjectSourceEvidence.document.version} · ${subjectSourceEvidence.section.locator}` : "未找到主体与场景的同一条款依据",
    },
    {
      condition: "业务场景",
      assessment: intent.scenarios.length
        ? (scenarioEvidence && (!intent.subjectTypes.length || jointApplicabilityEvidence) ? "matched" as const : "not_matched" as const)
        : "unknown" as const,
      explanation: intent.scenarios.length
        ? (scenarioSourceEvidence ? `已按${intent.scenarios.join("、")}核对已收录场景。` : "未找到同时支持提问主体与业务场景的同一条款依据。")
        : "提问中没有明确巡检、物流、测绘或航拍等业务场景。",
      source_ref: scenarioSourceEvidence ? `${scenarioSourceEvidence.document.version} · ${scenarioSourceEvidence.section.locator}` : "未找到主体与场景的同一条款依据",
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
    ...(intent.mode !== "version_compare" && evidence.some((item) => effectiveStatus(item.document, intent.asOfDate) === "upcoming") ? ["结果引用了尚未生效的修订稿，执行时必须区分当前有效要求与未来准备事项。"] : []),
    ...(intent.mode !== "version_compare" && evidence.some((item) => effectiveStatus(item.document, intent.asOfDate) === "expired") ? ["结果引用了历史失效版本，仅用于追溯，不得作为当前执行依据。"] : []),
    ...(applicability.some((item) => item.assessment === "unknown") ? ["地区、主体或业务场景信息不完整，当前只能给出条件性判断。"] : []),
    ...(applicability.some((item) => item.assessment === "not_matched") ? ["至少一项地区、主体或业务场景条件暂不匹配，不能据此认定政策适用。"] : []),
    ...(intent.realWorldJurisdiction && currentDocument?.jurisdiction === "全国" ? [`当前仅引用全国层面依据，尚未接入${intent.jurisdictions.join("、")}地方政策、实时空域信息和主管部门执行口径。`] : []),
  ];
  const currentStatus = currentDocument ? effectiveStatus(currentDocument, intent.asOfDate) : null;
  const deterministicAnswer = intent.mode === "version_compare"
    ? `已识别同一政策版本链中的${changes.length}项主要变化。截至${intent.asOfDate}，${currentDocument?.version ?? "尚无可确认版本"}${currentStatus === "effective" ? "仍为当前有效版本" : "不是当前有效版本"}。`
    : intent.mode === "business_impact"
      ? `基于样例版本变化，识别出${changes.length}项可能影响报备、任务变更或记录管理的准备事项。`
      : intent.mode === "applicability"
        ? `已按地区、主体、业务场景和版本时效拆分适用条件；当前结果是辅助判断，不构成最终政策适用结论。`
        : `截至${intent.asOfDate}，基于${currentDocument?.version ?? "已检索材料"}形成带版本和条款定位的解读。${keyPoints.slice(0, 3).join("；")}`;
  const rag = evidence.find((item) => item.rag)?.rag;
  // 最终业务结论仅由本次已筛选、可展示的条款证据生成。远程模型结果仍保留在
  // rag_runtime 中用于评测，但不得绕过政策对象、版本和条款覆盖门禁。
  const answer = deterministicAnswer;
  const citations = evidence.slice(0, 7).map((item) => ({
    document_id: item.document.id,
    document_title: item.document.title,
    document_number: item.document.documentNumber,
    version: item.document.version,
    locator: item.section.locator,
    excerpt: item.section.text,
    relevance: item.relevance,
    effective_status: effectiveStatus(item.document, intent.asOfDate),
    source_url: item.document.sourceUrl,
  }));
  const claimEvidence = evidence.slice(0, 5).map((item) => ({
    claim: item.section.plainLanguage,
    source_refs: [`${item.document.documentNumber} · ${item.document.version} · ${item.section.locator}`],
  }));
  const coveredLocators = intent.requestedLocators.filter((locator) => citations.some((citation) => citation.locator === locator));
  const missingLocators = intent.requestedLocators.filter((locator) => !coveredLocators.includes(locator));
  const sourceChains = new Set(evidence.map((item) => item.document.versionChainId));
  const sourceConflicts = sourceChains.size > 1 ? ["检索结果包含多个互不隶属的政策或标准对象。"] : [];
  const referencedLocators = [...new Set(evidence.flatMap((item) => item.section.referencedLocators ?? []))];
  const availableLocators = new Set(documents.flatMap((document) => document.sections.map((section) => section.locator)));
  const missingReferencedLocators = referencedLocators.filter((locator) => !availableLocators.has(locator));
  const localMaterialGap = intent.realWorldJurisdiction && currentDocument?.jurisdiction === "全国";
  const evidenceStatus = sourceConflicts.length ? "source_conflict" as const
    : missingLocators.length ? "missing" as const
      : localMaterialGap || missingReferencedLocators.length ? "partial" as const
        : citations.length ? "sufficient" as const : "missing" as const;
  const sourceScope = localMaterialGap
    ? `${currentDocument?.jurisdiction ?? "全国"}层面依据；尚未接入${intent.jurisdictions.join("、")}地方材料`
    : [...new Set(evidence.map((item) => `${item.document.title}（${item.document.jurisdiction}）`))].join("；") || "未形成有效来源范围";
  const requirementItems: AgentPolicyOutput["requirement_items"] = evidence.slice(0, 8).map((item) => ({
    kind: requirementKind(item.section),
    title: item.section.heading,
    requirement: item.section.plainLanguage,
    applies_to: item.section.appliesTo,
    scenarios: item.section.scenarios,
    deadline: deadlineFromText(item.section.text),
    source_ref: `${item.document.documentNumber} · ${item.document.version} · ${item.section.locator}`,
    effective_status: effectiveStatus(item.document, intent.asOfDate),
  }));
  const verificationSteps = buildVerificationSteps(requirementItems, missingReferencedLocators, intent);
  if (missingReferencedLocators.length) reviewItems.push(`当前依据引用了尚未收录的${missingReferencedLocators.join("、")}，相关例外条件需补充原文后确认。`);

  return {
    engine,
    mode: intent.mode,
    intent: {
      document_types: intent.documentTypes,
      topics: intent.topics,
      query_terms: intent.queryTerms,
      jurisdictions: intent.jurisdictions,
      subject_types: intent.subjectTypes,
      scenarios: intent.scenarios,
      requested_document_ids: intent.requestedDocumentIds,
      requested_locators: intent.requestedLocators,
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
      source_url: document.sourceUrl,
    })),
    answer,
    key_points: keyPoints,
    evidence_assessment: {
      status: evidenceStatus,
      source_scope: sourceScope,
      requested_locators: intent.requestedLocators,
      covered_locators: coveredLocators,
      missing_locators: missingLocators,
      conflicts: sourceConflicts,
      referenced_locators: referencedLocators,
      missing_referenced_locators: missingReferencedLocators,
      explanation: evidenceStatus === "sufficient" ? "政策对象、版本、条款与回答已形成一致证据链。"
        : evidenceStatus === "partial" ? [localMaterialGap ? "地方政策与主管部门执行口径仍需补充" : "", missingReferencedLocators.length ? `交叉引用条款${missingReferencedLocators.join("、")}尚未收录` : ""].filter(Boolean).join("；") + "。"
          : evidenceStatus === "source_conflict" ? "不同政策对象不能拼接为同一结论。" : "指定依据尚未完整覆盖。",
    },
    claim_evidence: claimEvidence,
    changes,
    applicability,
    requirement_items: requirementItems,
    verification_steps: verificationSteps,
    citations,
    rag_runtime: toAgentRagRuntime(rag),
    review_items: [...new Set(reviewItems)],
    capability_coverage: AG012_CONFIG.capabilityCoverage.map((item) => ({ ...item })),
    data_notice: documents.some((item) => item.id.startsWith("OFFICIAL-"))
      ? "当前可引用经国务院官网核验的公开条例摘录；项目虚构材料只用于演示版本比较。公开摘录仍不替代完整法规、实时空域信息、主管部门口径或专业判断，不得据此直接执行申报、合规或适航决策。"
      : "当前结果使用项目虚构政策与标准样例验证版本识别和引用流程；不得据此执行真实申报、合规或适航决策。正式结果需接入权威政策库、现行标准及主管部门口径。",
    rule_version: AG012_CONFIG.ruleVersion,
  };
}
