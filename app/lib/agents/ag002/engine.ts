import type { AgentManualOutput } from "../../contracts";
import { AG002_CONFIG } from "./config";
import type { ManualIntent, ParsedManual, RankedManualSection } from "./types";

function sectionLocation(section: RankedManualSection["section"]): string {
  const pages = section.pageStart === section.pageEnd ? `第${section.pageStart}页` : `第${section.pageStart}–${section.pageEnd}页`;
  return `${pages} · ${section.title}`;
}

export function rankManualSections(manual: ParsedManual, intent: ManualIntent, query: string): RankedManualSection[] {
  const ranked = manual.sections.map((section) => {
    const topicMatches = intent.topics.filter((topic) => section.topics.includes(topic)).length;
    const scenarioMatches = intent.scenarios.filter((scenario) => section.scenarios.includes(scenario)).length;
    const termMatches = intent.terms.filter((term) => section.glossary.some((item) => item.term === term || item.aliases.includes(term))).length;
    const phraseMatches = section.scenarios.filter((scenario) => query.includes(scenario)).length;
    const rawScore = topicMatches * 4 + scenarioMatches * 7 + termMatches * 6 + phraseMatches * 2;
    return { section, rawScore, relevance: Math.min(1, Number((0.35 + rawScore * 0.055).toFixed(2))) };
  }).sort((a, b) => b.rawScore - a.rawScore || a.section.pageStart - b.section.pageStart);

  const matched = ranked.filter((item) => item.rawScore > 0).slice(0, AG002_CONFIG.maxSections);
  const fallback = ranked.filter((item) => item.section.topics.includes("overview") || item.section.topics.includes("safety"));
  return (matched.length ? matched : fallback.slice(0, 2)).map(({ section, relevance }) => ({ section, relevance }));
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
  const answer = rankedSections.slice(0, 2).map(({ section }) => section.plainLanguage).join(" ");

  return {
    engine: "langgraph-demo",
    document: {
      id: manual.id,
      title: manual.title,
      product_name: manual.productName,
      version: manual.version,
      updated_at: manual.updatedAt,
      source_type: "虚构样例说明书",
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
