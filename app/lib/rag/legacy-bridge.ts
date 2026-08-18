import type { KnowledgeChunk } from "./contracts.ts";
import { createDefaultQueryPlan } from "./kernel.ts";
import { getRagAgentProfile } from "./profiles.ts";
import { getSharedRagRuntime, type LegacyRagResult } from "./runtime.ts";
import { findFormalKnowledgeDocument, FORMAL_KNOWLEDGE_CATALOG } from "./formal-knowledge.ts";

export interface LegacyKnowledgeRecord { id: string; title: string; content: string; sourceUri: string; domain: string }

/**
 * Routes existing pre-parsed Demo records through the common ACL, BM25, RRF and
 * rerank path. It deliberately has no fake embedding; vector retrieval is only
 * enabled when a real EmbeddingPort is configured in the main RagKernel.
 */
export async function rankLegacyKnowledge(agentId: string, query: string, records: readonly LegacyKnowledgeRecord[]): Promise<LegacyRagResult> {
  if (!records.length) return { ranks: new Map(), status: "insufficient_evidence", evidence: [], audit: { errors: ["No knowledge records were supplied"] } };
  const runtime = getSharedRagRuntime(); const namespace = `${agentId.toLowerCase()}-demo`; const managedNamespace = `demo-tenant-${agentId.toLowerCase()}-managed`; const profile = getRagAgentProfile(agentId);
  const chunks: KnowledgeChunk[] = records.map((record) => {
    const formal = findFormalKnowledgeDocument(agentId, record.id);
    const metadata: KnowledgeChunk["metadata"] = formal ? {
      knowledge_id: formal.knowledge_id, source_organization: formal.source_organization, source_nature: formal.source_nature,
      confidentiality: formal.confidentiality, lifecycle_status: formal.lifecycle_status, published_at: formal.published_at,
      effective_from: formal.effective_from, effective_to: formal.effective_to ?? "", review_owner: formal.review_owner,
      reviewed_at: formal.reviewed_at, catalog_version: FORMAL_KNOWLEDGE_CATALOG.catalog_version, original_source_ref: record.sourceUri,
    } : { catalog_version: FORMAL_KNOWLEDGE_CATALOG.catalog_version, original_source_ref: record.sourceUri, lifecycle_status: "unregistered" };
    return {
      chunkId: record.id,
      documentId: formal?.knowledge_id ?? record.id.split(":")[0] ?? record.id,
      documentVersion: formal?.version ?? "demo-v1",
      namespace,
      sourceType: formal?.document_type ?? "demo-preparsed",
      sourceUri: formal?.document_uri ?? record.sourceUri,
      title: formal?.title ?? record.title,
      sectionPath: [record.title],
      locator: { section: record.title },
      content: `${record.title}\n${record.content}`,
      contentHash: `${FORMAL_KNOWLEDGE_CATALOG.catalog_version}:${formal?.knowledge_id ?? "unregistered"}:${record.id}:${record.content}`,
      tenantId: "DEMO-TENANT",
      visibilityRoles: ["*"],
      status: "active",
      entityIds: [record.id],
      domainTags: [record.domain],
      riskTags: [record.domain === "policy" || record.domain === "standard" ? "policy" : record.domain.includes("manual") ? "safety" : null].filter((item): item is string => Boolean(item)),
      metadata,
    };
  });
  await runtime.ensureChunks(namespace, chunks);
  const domains = [...new Set(records.map((record) => record.domain))];
  const result = await runtime.answer({ query, plan: createDefaultQueryPlan({ agentId, query, knowledgeDomains: domains }), access: { tenantId: "DEMO-TENANT", roles: ["visitor"] }, namespaces: [namespace, managedNamespace], retrieveK: profile.retrieval.retrieveK, rerankK: profile.retrieval.rerankK, contextK: profile.retrieval.contextK, fusion: profile.retrieval.fusion, fusionWeights: profile.retrieval.fusionWeights, minVectorScore: profile.retrieval.minVectorScore, minLexicalCoverage: profile.retrieval.minLexicalCoverage, minRerankScore: profile.retrieval.minRerankScore });
  const prefix = `${namespace}:`;
  return { ...result, ranks: new Map(result.evidence.map((item, index) => [item.chunkId.startsWith(prefix) ? item.chunkId.slice(prefix.length) : item.chunkId, index])) };
}
