import { z } from "zod/v4";

export const KnowledgeStatusSchema = z.enum(["draft", "active", "inactive", "withdrawn", "archived"]);
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;

export const KnowledgeLocatorSchema = z.object({
  section: z.string().trim().min(1).optional(),
  pageStart: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
});

export const KnowledgeChunkSchema = z.object({
  chunkId: z.string().trim().min(1), documentId: z.string().trim().min(1), documentVersion: z.string().trim().min(1),
  namespace: z.string().trim().min(1).default("default"),
  sourceType: z.string().trim().min(1), sourceUri: z.string().trim().min(1), title: z.string().trim().min(1),
  sectionPath: z.array(z.string().trim().min(1)).default([]), locator: KnowledgeLocatorSchema.default({}), content: z.string().trim().min(1),
  contentHash: z.string().trim().min(1), tenantId: z.string().trim().min(1), visibilityRoles: z.array(z.string().trim().min(1)).default(["*"]),
  effectiveFrom: z.string().datetime({ offset: true }).optional(), effectiveTo: z.string().datetime({ offset: true }).optional(),
  status: KnowledgeStatusSchema, entityIds: z.array(z.string().trim().min(1)).default([]), domainTags: z.array(z.string().trim().min(1)).min(1),
  riskTags: z.array(z.string().trim().min(1)).default([]),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
  embedding: z.array(z.number().finite()).min(1).optional(), embeddingVersion: z.string().trim().min(1).optional(), indexVersion: z.string().trim().min(1).optional(),
});
export type KnowledgeChunk = z.infer<typeof KnowledgeChunkSchema>;

export const KnowledgeDocumentSchema = z.object({
  documentId: z.string().trim().min(1), documentVersion: z.string().trim().min(1), sourceType: z.string().trim().min(1),
  sourceUri: z.string().trim().min(1), title: z.string().trim().min(1), content: z.string().trim().min(1), tenantId: z.string().trim().min(1),
  visibilityRoles: z.array(z.string().trim().min(1)).default(["*"]), effectiveFrom: z.string().datetime({ offset: true }).optional(),
  effectiveTo: z.string().datetime({ offset: true }).optional(), status: KnowledgeStatusSchema.default("active"),
  entityIds: z.array(z.string().trim().min(1)).default([]), domainTags: z.array(z.string().trim().min(1)).min(1),
  riskTags: z.array(z.string().trim().min(1)).default([]),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
});
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;

export const RagQueryPlanSchema = z.object({
  agentId: z.string().regex(/^AG-\d{3}$/), intent: z.string().trim().min(1), subQueries: z.array(z.string().trim().min(1)).min(1),
  exactTerms: z.array(z.string().trim().min(1)).default([]),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
  asOf: z.string().datetime({ offset: true }), knowledgeDomains: z.array(z.string().trim().min(1)).min(1),
});
export type RagQueryPlan = z.infer<typeof RagQueryPlanSchema>;

export const RagAccessScopeSchema = z.object({ tenantId: z.string().trim().min(1), roles: z.array(z.string().trim().min(1)).min(1) });
export type RagAccessScope = z.infer<typeof RagAccessScopeSchema>;

export const RagSearchRequestSchema = z.object({
  query: z.string().trim().min(1), plan: RagQueryPlanSchema, access: RagAccessScopeSchema,
  namespaces: z.array(z.string().trim().min(1)).min(1).max(20).default(["default"]),
  retrieveK: z.number().int().positive().max(100).default(20), rerankK: z.number().int().positive().max(50).default(10),
  contextK: z.number().int().positive().max(20).default(6), indexVersion: z.string().trim().min(1).optional(),
  fusion: z.enum(["rrf", "weighted"]).default("rrf"),
  fusionWeights: z.object({ lexical: z.number().min(0).max(1), vector: z.number().min(0).max(1) }).default({ lexical: 0.5, vector: 0.5 }),
  minVectorScore: z.number().min(-1).max(1).default(0.2),
  minLexicalCoverage: z.number().min(0).max(1).default(0.3),
  minRerankScore: z.number().min(-1).max(1).default(0.12),
}).superRefine((value, context) => {
  if (value.retrieveK < value.rerankK || value.rerankK < value.contextK) context.addIssue({ code: "custom", message: "retrieveK must be >= rerankK >= contextK", path: ["retrieveK"] });
  if (value.fusion === "weighted" && value.fusionWeights.lexical + value.fusionWeights.vector <= 0) context.addIssue({ code: "custom", message: "At least one fusion weight must be positive", path: ["fusionWeights"] });
});
export type RagSearchRequest = z.infer<typeof RagSearchRequestSchema>;
export type RagSearchRequestInput = z.input<typeof RagSearchRequestSchema>;

export const RagEvidenceSchema = z.object({
  chunkId: z.string().min(1), documentId: z.string().min(1), documentVersion: z.string().min(1), namespace: z.string().min(1), title: z.string().min(1),
  content: z.string().min(1), sourceUri: z.string().min(1), locator: KnowledgeLocatorSchema, domainTags: z.array(z.string()), riskTags: z.array(z.string()),
  sourceType: z.string().optional(), sectionPath: z.array(z.string()).optional(), effectiveFrom: z.string().optional(), effectiveTo: z.string().optional(), status: KnowledgeStatusSchema.optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
  scores: z.object({ lexical: z.number().finite().optional(), vector: z.number().finite().optional(), fused: z.number().finite(), rerank: z.number().finite().optional() }),
  indexVersion: z.string().min(1), embeddingVersion: z.string().min(1).optional(),
});
export type RagEvidence = z.infer<typeof RagEvidenceSchema>;

export const GroundedAnswerSchema = z.object({
  summary: z.string(),
  claims: z.array(z.object({ text: z.string().trim().min(1), evidenceChunkIds: z.array(z.string().trim().min(1)).min(1) })),
  missingInformation: z.array(z.string()), conflicts: z.array(z.string()), reviewRequired: z.boolean(),
});
export type GroundedAnswer = z.infer<typeof GroundedAnswerSchema>;

export const RagAugmentationSchema = z.object({
  status: z.enum(["completed", "evidence_only", "insufficient_evidence", "validation_failed"]),
  answer: GroundedAnswerSchema.optional(),
  evidence: z.array(RagEvidenceSchema).default([]),
  audit: z.object({
    indexVersion: z.string().optional(), embeddingVersion: z.string().optional(), rerankProvider: z.string().optional(),
    modelProvider: z.string().optional(), citationCoverage: z.number().min(0).max(1).optional(), groundingSupport: z.number().min(0).max(1).optional(),
    lexicalEvidenceCount: z.number().int().nonnegative().optional(), vectorEvidenceCount: z.number().int().nonnegative().optional(),
    degradedStages: z.array(z.enum(["embedding", "rerank", "generation"])).optional(),
    timingsMs: z.record(z.string(), z.number().nonnegative()).optional(), modelUsage: z.object({ promptTokens: z.number().int().nonnegative(), completionTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() }).optional(), errors: z.array(z.string()),
  }),
});
export type RagAugmentation = z.infer<typeof RagAugmentationSchema>;

export interface EmbeddingPort {
  readonly provider: string; readonly model: string; readonly version: string;
  embedDocuments(texts: readonly string[], options?: { signal?: AbortSignal }): Promise<number[][]>;
  embedQuery(text: string, options?: { signal?: AbortSignal }): Promise<number[]>;
}
export interface RerankPort {
  readonly provider: string; readonly model: string;
  rerank(query: string, evidence: readonly RagEvidence[], options?: { signal?: AbortSignal }): Promise<Array<{ chunkId: string; score: number }>>;
}
export interface ModelGateway {
  readonly provider: string; readonly model: string;
  generateGroundedAnswer(input: { question: string; plan: RagQueryPlan; evidence: readonly RagEvidence[] }, options?: { signal?: AbortSignal }): Promise<GroundedAnswer & { usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>;
}
export interface IndexPublication { indexVersion: string; embeddingVersion?: string; embeddingDimensions?: number; publishedAt: string; chunkCount: number; previousVersion?: string; warnings?: string[] }
export interface HybridSearchPort {
  publish(chunks: readonly KnowledgeChunk[], options?: { replaceDocumentIds?: readonly string[]; embeddingVersion?: string }): Promise<IndexPublication>;
  rollback(indexVersion: string): Promise<IndexPublication>;
  search(request: RagSearchRequestInput, queryEmbedding?: readonly number[]): Promise<RagEvidence[]>;
  getActivePublication(): IndexPublication | undefined;
  getChunks(indexVersion?: string): readonly KnowledgeChunk[];
}
