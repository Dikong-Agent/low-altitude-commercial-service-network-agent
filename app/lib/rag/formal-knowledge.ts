import { z } from "zod/v4";
import rawCatalog from "../../../knowledge/catalog.json" with { type: "json" };

const FormalKnowledgeDocumentSchema = z.object({
  knowledge_id: z.string().regex(/^KB-AG\d{3}-\d{4}$/),
  agent_id: z.string().regex(/^AG-\d{3}$/),
  title: z.string().min(1),
  document_type: z.string().min(1),
  knowledge_domain: z.string().min(1),
  source_organization: z.string().min(1),
  source_nature: z.string().min(1),
  document_uri: z.string().min(1),
  version: z.string().min(1),
  published_at: z.string().date(),
  effective_from: z.string().date(),
  effective_to: z.string().date().nullable(),
  confidentiality: z.string().min(1),
  lifecycle_status: z.enum(["published", "superseded", "withdrawn"]),
  review_owner: z.string().min(1),
  reviewed_at: z.string().date(),
  record_ids: z.array(z.string().min(1)).min(1),
});

const FormalKnowledgeCatalogSchema = z.object({
  catalog_version: z.string().min(1), baseline_date: z.string().date(), data_notice: z.string().min(1),
  documents: z.array(FormalKnowledgeDocumentSchema).min(15),
}).superRefine((catalog, context) => {
  const ids = new Set<string>(); const recordKeys = new Set<string>();
  for (const [index, document] of catalog.documents.entries()) {
    if (ids.has(document.knowledge_id)) context.addIssue({ code: "custom", message: `Duplicate knowledge_id ${document.knowledge_id}`, path: ["documents", index, "knowledge_id"] });
    ids.add(document.knowledge_id);
    for (const recordId of document.record_ids) {
      const key = `${document.agent_id}:${recordId}`;
      if (recordKeys.has(key)) context.addIssue({ code: "custom", message: `Duplicate runtime record mapping ${key}`, path: ["documents", index, "record_ids"] });
      recordKeys.add(key);
    }
  }
});

export const FORMAL_KNOWLEDGE_CATALOG = FormalKnowledgeCatalogSchema.parse(rawCatalog);
export type FormalKnowledgeDocument = z.infer<typeof FormalKnowledgeDocumentSchema>;

const mapping = new Map<string, FormalKnowledgeDocument>();
for (const document of FORMAL_KNOWLEDGE_CATALOG.documents) for (const recordId of document.record_ids) mapping.set(`${document.agent_id}:${recordId}`, document);

export function findFormalKnowledgeDocument(agentId: string, recordId: string): FormalKnowledgeDocument | undefined {
  return mapping.get(`${agentId}:${recordId}`);
}

export function formalKnowledgeSummary() {
  return {
    catalogVersion: FORMAL_KNOWLEDGE_CATALOG.catalog_version,
    documentCount: FORMAL_KNOWLEDGE_CATALOG.documents.length,
    agentCounts: Object.fromEntries([...new Set(FORMAL_KNOWLEDGE_CATALOG.documents.map((item) => item.agent_id))].map((agentId) => [agentId, FORMAL_KNOWLEDGE_CATALOG.documents.filter((item) => item.agent_id === agentId).length])),
  };
}
