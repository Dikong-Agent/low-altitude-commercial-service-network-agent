import type { AgentManualOutput, ManualTopic } from "../../contracts";
import { AG002_CONFIG } from "./config";
import type { ManualIntent, ParsedManual, RankedManualSection } from "./types";

function sectionLocation(section: RankedManualSection["section"]): string {
  const pages = section.pageStart === section.pageEnd ? `第${section.pageStart}页` : `第${section.pageStart}–${section.pageEnd}页`;
  return `${pages} · ${section.title}`;
}

const strongTopicRules: Record<ManualTopic, RegExp> = {
  overview: /核心功能|主要功能|适用边界|使用限制|关键内容|产品介绍|说明书.{0,6}(摘要|概括)|(摘要|概括).{0,6}(说明书|手册)/,
  operation: /说明书.{0,8}(操作步骤|使用步骤)|(操作步骤|使用步骤).{0,8}(摘要|概括|说明书|手册)/,
  safety: /安全|风险|危险|注意|禁忌|禁止|不得|飞行前/,
  troubleshooting: /故障|漂移|异常|告警|排查|无法|失控|断联/,
  terminology: /术语|解释|什么意思|通俗|含义/,
  compliance: /合规|法规|空域|禁飞|限飞|审批|申报|资质/,
};

export function rankManualSections(manual: ParsedManual, intent: ManualIntent, query: string): RankedManualSection[] {
  const focusedScenarios = intent.scenarios.filter((scenario) => scenario !== "飞行");
  const shouldFocusScenario = focusedScenarios.length > 0;
  const ranked = manual.sections.map((section) => {
    const strongTopics = intent.topics.filter((topic) => section.topics.includes(topic) && strongTopicRules[topic].test(query));
    const scenarioMatches = intent.scenarios.filter((scenario) => section.scenarios.includes(scenario));
    const focusedScenarioMatches = focusedScenarios.filter((scenario) => section.scenarios.includes(scenario));
    const termMatches = intent.terms.filter((term) => section.glossary.some((item) => item.term === term || item.aliases.includes(term)));
    const phraseMatches = section.scenarios.filter((scenario) => query.includes(scenario));
    const matchReasons = [
      ...strongTopics.map((topic) => `主题:${topic}`),
      ...scenarioMatches.map((scenario) => `场景:${scenario}`),
      ...termMatches.map((term) => `术语:${term}`),
      ...phraseMatches.map((scenario) => `原词:${scenario}`),
    ];
    const rawScore = strongTopics.length * 5 + scenarioMatches.length * 8 + termMatches.length * 14 + phraseMatches.length * 3;
    const relevance = Math.min(1, Number((rawScore / 24).toFixed(2)));
    return { section, rawScore, relevance, matchReasons, hasFocusedScenarioMatch: focusedScenarioMatches.length > 0, hasTermMatch: termMatches.length > 0 };
  }).sort((a, b) => b.rawScore - a.rawScore || a.section.pageStart - b.section.pageStart);

  return ranked
    .filter((item) => item.rawScore > 0
      && item.matchReasons.length > 0
      && (!shouldFocusScenario || item.hasFocusedScenarioMatch || item.hasTermMatch))
    .slice(0, AG002_CONFIG.maxSections)
    .map(({ section, relevance, matchReasons }) => ({ section, relevance, matchReasons }));
}

function selectAnswerSections(intent: ManualIntent, rankedSections: RankedManualSection[]) {
  const selected = new Map<string, RankedManualSection["section"]>();
  for (const topic of intent.topics) {
    const match = rankedSections.find(({ section }) => section.topics.includes(topic));
    if (match) selected.set(match.section.id, match.section);
  }
  if (selected.size === 0 && rankedSections[0]) selected.set(rankedSections[0].section.id, rankedSections[0].section);
  return [...selected.values()].slice(0, 3);
}

export function buildManualOutput(
  manual: ParsedManual,
  intent: ManualIntent,
  rankedSections: RankedManualSection[],
): AgentManualOutput {
  const includeOperationalDetail = intent.topics.some((topic) => ["operation", "safety", "troubleshooting", "compliance"].includes(topic));
  const stepCandidates = includeOperationalDetail
    ? rankedSections.flatMap(({ section }) => section.steps.map((step) => ({ step, section })))
    : [];
  const seenSteps = new Set<string>();
  const steps = stepCandidates.flatMap(({ step, section }) => {
    if (seenSteps.has(step.title)) return [];
    seenSteps.add(step.title);
    return [{
      order: seenSteps.size,
      title: step.title,
      instruction: step.instruction,
      condition: step.condition,
      safety_note: step.safetyNote,
      source_ref: sectionLocation(section),
    }];
  }).slice(0, AG002_CONFIG.maxSteps).map((step, index) => ({ ...step, order: index + 1 }));

  const seenRisks = new Set<string>();
  const riskMarkers = (includeOperationalDetail ? rankedSections : []).flatMap(({ section }) => section.risks.flatMap((risk) => {
    const key = `${risk.level}:${risk.label}`;
    if (seenRisks.has(key)) return [];
    seenRisks.add(key);
    return [{ level: risk.level, label: risk.label, detail: risk.detail, source_ref: sectionLocation(section) }];
  }));

  const seenTerms = new Set<string>();
  const glossary = rankedSections.flatMap(({ section }) => section.glossary.flatMap((item) => {
    if (seenTerms.has(item.term) || (intent.terms.length && !intent.terms.includes(item.term))) return [];
    seenTerms.add(item.term);
    return [{ term: item.term, plain_explanation: item.plainExplanation, source_ref: sectionLocation(section) }];
  }));

  const citations = rankedSections.map(({ section, relevance }) => ({
    section_id: section.id,
    section_title: section.title,
    location: sectionLocation(section),
    excerpt: section.plainLanguage,
    relevance,
  }));
  const terminologyOnly = intent.topics.every((topic) => topic === "terminology") && glossary.length > 0;
  const answer = terminologyOnly
    ? glossary.map((item) => `${item.term}：${item.plain_explanation}`).join("；")
    : selectAnswerSections(intent, rankedSections).map((section) => section.plainLanguage).join(" ");

  return {
    engine: "langgraph-demo",
    document: {
      id: manual.id,
      title: manual.title,
      product_name: manual.productName,
      version: manual.version,
      updated_at: manual.updatedAt,
      source_type: manual.sourceType,
    },
    intent: { topics: intent.topics, scenarios: intent.scenarios, terms: intent.terms },
    answer,
    steps,
    risk_markers: riskMarkers,
    glossary,
    citations,
    document_structure: {
      chapters: manual.structure.chapters,
      tables: manual.structure.tables,
      figures: manual.structure.figures,
      scanned_pages: manual.structure.scannedPages,
      recognition_mode: manual.recognitionMode,
    },
    capability_coverage: AG002_CONFIG.capabilityCoverage.map((item) => ({ ...item })),
    data_notice: "当前结果仅基于虚构样例说明书和 Mock 文档解析生成；正式操作必须核对真实有效手册、现行法规并由具备资质的人员确认。",
    rule_version: AG002_CONFIG.ruleVersion,
  };
}
