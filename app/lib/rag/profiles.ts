import { z } from "zod/v4";

export const RagAgentProfileSchema = z.object({
  agentId: z.enum(["AG-001", "AG-012", "AG-025", "AG-027"]),
  pattern: z.enum(["structured_decision_rag", "document_rag", "routed_multi_source_rag", "structured_analytics_retrieval"]),
  knowledgeDomains: z.array(z.string()).min(1),
  retrieval: z.object({ retrieveK: z.number().int().positive(), rerankK: z.number().int().positive(), contextK: z.number().int().positive(), fusion: z.enum(["rrf", "weighted"]), fusionWeights: z.object({ lexical: z.number().min(0).max(1), vector: z.number().min(0).max(1) }), minVectorScore: z.number().min(-1).max(1), minLexicalCoverage: z.number().min(0).max(1), minRerankScore: z.number().min(-1).max(1) }),
  minimumDirectEvidence: z.number().int().positive(),
  failurePolicy: z.enum(["return_gap_without_recommendation", "abstain_and_review", "clarify_or_abstain", "clarify_metric_or_review"]),
});
export type RagAgentProfile = z.infer<typeof RagAgentProfileSchema>;

const profileList = z.array(RagAgentProfileSchema).length(4).parse([
  { agentId: "AG-001", pattern: "structured_decision_rag", knowledgeDomains: ["product-master", "product-manual", "service-terms"], retrieval: { retrieveK: 30, rerankK: 12, contextK: 6, fusion: "rrf", fusionWeights: { lexical: 0.5, vector: 0.5 }, minVectorScore: 0.2, minLexicalCoverage: 0.3, minRerankScore: 0.12 }, minimumDirectEvidence: 1, failurePolicy: "return_gap_without_recommendation" },
  { agentId: "AG-012", pattern: "document_rag", knowledgeDomains: ["policy", "standard", "implementation-rule", "version-notice"], retrieval: { retrieveK: 50, rerankK: 15, contextK: 8, fusion: "rrf", fusionWeights: { lexical: 0.5, vector: 0.5 }, minVectorScore: 0.2, minLexicalCoverage: 0.3, minRerankScore: 0.12 }, minimumDirectEvidence: 1, failurePolicy: "abstain_and_review" },
  { agentId: "AG-025", pattern: "routed_multi_source_rag", knowledgeDomains: ["faq", "platform-rule", "service-guide", "after-sales", "product-guide"], retrieval: { retrieveK: 40, rerankK: 12, contextK: 6, fusion: "rrf", fusionWeights: { lexical: 0.5, vector: 0.5 }, minVectorScore: 0.2, minLexicalCoverage: 0.3, minRerankScore: 0.12 }, minimumDirectEvidence: 1, failurePolicy: "clarify_or_abstain" },
  { agentId: "AG-027", pattern: "structured_analytics_retrieval", knowledgeDomains: ["metric-dictionary", "metric-lineage", "analysis-guidance"], retrieval: { retrieveK: 30, rerankK: 10, contextK: 5, fusion: "weighted", fusionWeights: { lexical: 0.7, vector: 0.3 }, minVectorScore: 0.2, minLexicalCoverage: 0.4, minRerankScore: 0.12 }, minimumDirectEvidence: 1, failurePolicy: "clarify_metric_or_review" },
]);

export const RAG_AGENT_PROFILES: ReadonlyMap<RagAgentProfile["agentId"], RagAgentProfile> = new Map(profileList.map((profile) => [profile.agentId, Object.freeze(profile)]));
export function getRagAgentProfile(agentId: string): RagAgentProfile {
  const profile = RAG_AGENT_PROFILES.get(agentId as RagAgentProfile["agentId"]); if (!profile) throw new Error(`No RAG profile for ${agentId}`); return profile;
}
