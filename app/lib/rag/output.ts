import type { AgentRagRuntime } from "../contracts.ts";
import type { RagAugmentation } from "./contracts.ts";

export function toAgentRagRuntime(value: RagAugmentation | undefined): AgentRagRuntime | undefined {
  if (!value) return undefined;
  return {
    status: value.status,
    index_version: value.audit.indexVersion ?? null,
    embedding_version: value.audit.embeddingVersion ?? null,
    rerank_provider: value.audit.rerankProvider ?? null,
    model_provider: value.audit.modelProvider ?? null,
    citation_coverage: value.audit.citationCoverage ?? null,
    grounding_support: value.audit.groundingSupport ?? null,
    claim_count: value.answer?.claims.length ?? 0,
    lexical_evidence_count: value.audit.lexicalEvidenceCount ?? 0,
    vector_evidence_count: value.audit.vectorEvidenceCount ?? 0,
    claims: value.answer?.claims.map((claim) => ({ text: claim.text, evidence_chunk_ids: [...claim.evidenceChunkIds] })) ?? [],
    missing_information: [...(value.answer?.missingInformation ?? [])],
    conflicts: [...(value.answer?.conflicts ?? [])],
    review_required: value.answer?.reviewRequired ?? false,
    degraded_stages: [...(value.audit.degradedStages ?? [])],
    timings_ms: { ...(value.audit.timingsMs ?? {}) },
    model_usage: value.audit.modelUsage ? { prompt_tokens: value.audit.modelUsage.promptTokens, completion_tokens: value.audit.modelUsage.completionTokens, total_tokens: value.audit.modelUsage.totalTokens } : null,
    evidence: (value.evidence ?? []).map((item) => ({
      chunk_id: item.chunkId,
      knowledge_id: String(item.metadata?.knowledge_id ?? item.documentId),
      title: item.title,
      document_version: item.documentVersion,
      document_type: item.sourceType ?? "知识材料",
      source_uri: item.sourceUri,
      source_organization: String(item.metadata?.source_organization ?? "演示知识来源"),
      source_nature: String(item.metadata?.source_nature ?? "演示样例材料"),
      confidentiality: String(item.metadata?.confidentiality ?? "公开演示"),
      lifecycle_status: String(item.metadata?.lifecycle_status ?? item.status ?? "active"),
      effective_from: item.metadata?.effective_from ? String(item.metadata.effective_from) : item.effectiveFrom ?? null,
      effective_to: item.metadata?.effective_to ? String(item.metadata.effective_to) : item.effectiveTo ?? null,
      section: item.locator.section ?? item.sectionPath?.at(-1) ?? null,
      excerpt: item.content.length > 220 ? `${item.content.slice(0, 220)}…` : item.content,
      lexical_score: item.scores.lexical ?? null,
      vector_score: item.scores.vector ?? null,
      rerank_score: item.scores.rerank ?? null,
      fused_score: item.scores.fused,
    })),
    errors: [...value.audit.errors],
  };
}
