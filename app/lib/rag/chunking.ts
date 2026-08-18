import type { KnowledgeChunk, KnowledgeDocument } from "./contracts.ts";
import { KnowledgeDocumentSchema } from "./contracts.ts";
import { sha256 } from "./text.ts";

export interface ChunkingOptions { targetCharacters?: number; overlapCharacters?: number }
function paragraphs(content: string): string[] { return content.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((item) => item.trim()).filter(Boolean); }
function splitLongParagraph(value: string, target: number): string[] {
  if (value.length <= target) return [value];
  const sentences = value.split(/(?<=[。！？；.!?;])\s*/).filter(Boolean); const result: string[] = []; let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > target) { result.push(current); current = ""; }
    if (sentence.length > target) for (let offset = 0; offset < sentence.length; offset += target) result.push(sentence.slice(offset, offset + target)); else current += sentence;
  }
  if (current) result.push(current); return result;
}
export async function chunkKnowledgeDocument(raw: KnowledgeDocument, options: ChunkingOptions = {}): Promise<KnowledgeChunk[]> {
  const document = KnowledgeDocumentSchema.parse(raw); const target = options.targetCharacters ?? 700; const overlap = options.overlapCharacters ?? 100;
  if (target < 200 || overlap < 0 || overlap >= target) throw new Error("Invalid chunking options");
  const blocks = paragraphs(document.content).flatMap((item) => splitLongParagraph(item, target)); const contents: string[] = []; let current = "";
  for (const block of blocks) { const candidate = current ? `${current}\n\n${block}` : block; if (current && candidate.length > target) { contents.push(current); current = `${current.slice(Math.max(0, current.length - overlap))}\n\n${block}`; } else current = candidate; }
  if (current) contents.push(current);
  return Promise.all(contents.map(async (content, index) => { const contentHash = await sha256(content); return {
    chunkId: `${document.documentId}:${document.documentVersion}:${String(index + 1).padStart(4, "0")}:${contentHash.slice(0, 12)}`,
    documentId: document.documentId, documentVersion: document.documentVersion, namespace: "default", sourceType: document.sourceType, sourceUri: document.sourceUri,
    title: document.title, sectionPath: [], locator: {}, content, contentHash, tenantId: document.tenantId, visibilityRoles: document.visibilityRoles,
    effectiveFrom: document.effectiveFrom, effectiveTo: document.effectiveTo, status: document.status, entityIds: document.entityIds,
    domainTags: document.domainTags, riskTags: document.riskTags, metadata: document.metadata,
  } satisfies KnowledgeChunk; }));
}
