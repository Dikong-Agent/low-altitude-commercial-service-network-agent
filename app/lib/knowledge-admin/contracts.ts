import { z } from "zod/v4";

export const ManagedAgentIdSchema = z.enum(["AG-001", "AG-012", "AG-025", "AG-027"]);
export type ManagedAgentId = z.infer<typeof ManagedAgentIdSchema>;

export const KnowledgeLifecycleSchema = z.enum(["draft", "in_review", "published", "superseded", "withdrawn"]);
export type KnowledgeLifecycle = z.infer<typeof KnowledgeLifecycleSchema>;

export const ParseStatusSchema = z.enum(["pending", "parsed", "failed", "external_service_required"]);
export type ParseStatus = z.infer<typeof ParseStatusSchema>;

export const KnowledgeMetadataSchema = z.object({
  agentId: ManagedAgentIdSchema,
  title: z.string().trim().min(2).max(200),
  documentType: z.string().trim().min(1).max(80),
  domain: z.string().trim().min(1).max(80),
  sourceOrganization: z.string().trim().min(1).max(160),
  sourceNature: z.string().trim().min(1).max(80),
  sourceUri: z.string().trim().min(1).max(500).optional(),
  version: z.string().trim().min(1).max(64),
  publishedAt: z.string().date().optional(),
  effectiveFrom: z.string().date().optional(),
  effectiveTo: z.string().date().nullable().optional(),
  confidentiality: z.string().trim().min(1).max(80),
  visibilityRoles: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
  reviewOwner: z.string().trim().min(1).max(160),
});
export type KnowledgeMetadata = z.infer<typeof KnowledgeMetadataSchema>;

export const RegisterKnowledgeSchema = z.object({
  metadata: KnowledgeMetadataSchema,
  file: z.object({
    name: z.string().trim().min(1).max(240),
    type: z.string().trim().max(120).default("text/plain"),
    content: z.string().max(1_500_000),
  }),
});

export const MetadataPatchSchema = KnowledgeMetadataSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one metadata field is required");

export interface ChunkPreview { chunkId: string; order: number; characters: number; excerpt: string }
export interface KnowledgeRevision {
  revisionId: string; version: string; lifecycleStatus: KnowledgeLifecycle; content: string;
  metadata: KnowledgeMetadata; createdAt: string; actor: string; reason: string;
}
export interface ManagedKnowledgeDocument extends KnowledgeMetadata {
  id: string; lifecycleStatus: KnowledgeLifecycle; parseStatus: ParseStatus; fileName: string; fileType: string;
  content: string; checksum: string; chunks: ChunkPreview[]; createdAt: string; updatedAt: string; lastError?: string;
  publishedIndexVersion?: string; publicationNamespace?: string; revisions: KnowledgeRevision[]; seeded: boolean;
}
export interface PublicationEvent {
  id: string; documentId: string; agentId: ManagedAgentId; action: "publish" | "withdraw" | "rollback" | "seed";
  version: string; indexVersion?: string; actor: string; createdAt: string; detail: string;
}
export interface QaSample {
  id: string; agentId: ManagedAgentId; question: string; expectedKnowledgeIds: string[];
  result: "pending" | "pass" | "fail"; note: string; reviewedAt?: string; reviewer?: string;
}
export interface KnowledgeAdminSnapshot {
  schemaVersion: "1.0"; documents: ManagedKnowledgeDocument[]; publications: PublicationEvent[];
  qaSamples: QaSample[]; updatedAt: string;
}
