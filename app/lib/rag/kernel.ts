import type { EmbeddingPort, GroundedAnswer, HybridSearchPort, IndexPublication, KnowledgeChunk, KnowledgeDocument, ModelGateway, RagEvidence, RagQueryPlan, RagSearchRequestInput, RerankPort } from "./contracts.ts";
import { KnowledgeChunkSchema, RagQueryPlanSchema, RagSearchRequestSchema } from "./contracts.ts";
import { chunkKnowledgeDocument, type ChunkingOptions } from "./chunking.ts";
import { evidenceRequiresReview, validateGroundedAnswer } from "./grounding.ts";

export interface RagKernelOptions { minEvidence?: number; maxEmbeddingBatch?: number }
export type RagRunResult = {
  status: "completed" | "evidence_only" | "insufficient_evidence" | "validation_failed";
  evidence: RagEvidence[];
  answer?: GroundedAnswer;
  audit: { indexVersion?: string; embeddingVersion?: string; rerankProvider?: string; modelProvider?: string; citationCoverage?: number; groundingSupport?: number; lexicalEvidenceCount?: number; vectorEvidenceCount?: number; degradedStages?: Array<"embedding" | "rerank" | "generation">; timingsMs?: Record<string, number>; modelUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }; errors: string[] };
};

export class RagKernel {
  private readonly minEvidence: number; private readonly maxEmbeddingBatch: number;
  private readonly search: HybridSearchPort; private readonly embedding?: EmbeddingPort; private readonly reranker?: RerankPort; private readonly model?: ModelGateway;
  constructor(search: HybridSearchPort, embedding?: EmbeddingPort, reranker?: RerankPort, model?: ModelGateway, options: RagKernelOptions = {}) {
    this.search = search; this.embedding = embedding; this.reranker = reranker; this.model = model;
    this.minEvidence = options.minEvidence ?? 1; this.maxEmbeddingBatch = options.maxEmbeddingBatch ?? 32;
  }

  getChunks(indexVersion?: string): readonly KnowledgeChunk[] { return this.search.getChunks(indexVersion); }

  async ingestDocument(document: KnowledgeDocument, options: ChunkingOptions & { signal?: AbortSignal } = {}): Promise<IndexPublication> {
    const chunks = await chunkKnowledgeDocument(document, options);
    return this.ingestChunks(chunks, { replaceDocumentIds: [document.documentId], signal: options.signal });
  }

  async ingestChunks(rawChunks: readonly KnowledgeChunk[], options: { replaceDocumentIds?: readonly string[]; signal?: AbortSignal } = {}): Promise<IndexPublication> {
    const chunks = rawChunks.map((chunk) => KnowledgeChunkSchema.parse(chunk));
    const missingVectors = chunks.filter((chunk) => !chunk.embedding);
    const generatedVectors: number[][] = [];
    let embeddingWarning: string | undefined;
    if (this.embedding) try {
      for (let offset = 0; offset < missingVectors.length; offset += this.maxEmbeddingBatch) {
        const batch = missingVectors.slice(offset, offset + this.maxEmbeddingBatch); const vectors = await this.embedding.embedDocuments(batch.map((chunk) => chunk.content), { signal: options.signal });
        if (vectors.length !== batch.length) throw new Error("Embedding response count does not match chunk count");
        generatedVectors.push(...vectors);
      }
      for (let index = 0; index < missingVectors.length; index += 1) { missingVectors[index]!.embedding = generatedVectors[index]; missingVectors[index]!.embeddingVersion = this.embedding.version; }
    } catch {
      embeddingWarning = "Embedding generation failed; the publication is available for lexical retrieval and will be retried";
    }
    const publication = await this.search.publish(chunks, { replaceDocumentIds: options.replaceDocumentIds, embeddingVersion: embeddingWarning ? undefined : this.embedding?.version ?? chunks.find((chunk) => chunk.embeddingVersion)?.embeddingVersion });
    return embeddingWarning ? { ...publication, warnings: [embeddingWarning] } : publication;
  }

  async retrieve(rawRequest: RagSearchRequestInput, options?: { signal?: AbortSignal }): Promise<RagEvidence[]> {
    return (await this.retrieveWithAudit(rawRequest, options)).evidence;
  }

  private async retrieveWithAudit(rawRequest: RagSearchRequestInput, options?: { signal?: AbortSignal }): Promise<{ evidence: RagEvidence[]; errors: string[]; degradedStages: Array<"embedding" | "rerank">; timingsMs: Record<string, number> }> {
    const request = RagSearchRequestSchema.parse(rawRequest); const errors: string[] = []; const degradedStages: Array<"embedding" | "rerank"> = []; const timingsMs: Record<string, number> = {};
    let queryEmbedding: number[] | undefined;
    const embeddingStarted = performance.now();
    if (this.embedding) try { queryEmbedding = await this.embedding.embedQuery(request.query, { signal: options?.signal }); }
    catch { errors.push("Embedding query failed; lexical retrieval was used"); degradedStages.push("embedding"); }
    timingsMs.embedding = performance.now() - embeddingStarted;
    const searchStarted = performance.now(); const candidates = await this.search.search(request, queryEmbedding); timingsMs.search = performance.now() - searchStarted;
    if (!this.reranker || !candidates.length) return { evidence: candidates.slice(0, request.contextK), errors, degradedStages, timingsMs };
    const rerankInput = candidates.slice(0, request.rerankK); const rerankStarted = performance.now();
    try {
      const ranking = await this.reranker.rerank(request.query, rerankInput, { signal: options?.signal }); const scores = new Map(ranking.map((item) => [item.chunkId, item.score]));
      const evidence = rerankInput.map((item) => ({ ...item, scores: { ...item.scores, rerank: scores.get(item.chunkId) } }))
        .filter((item) => (item.scores.rerank ?? Number.NEGATIVE_INFINITY) >= request.minRerankScore)
        .sort((left, right) => (right.scores.rerank ?? Number.NEGATIVE_INFINITY) - (left.scores.rerank ?? Number.NEGATIVE_INFINITY)).slice(0, request.contextK);
      timingsMs.rerank = performance.now() - rerankStarted; return { evidence, errors, degradedStages, timingsMs };
    } catch {
      errors.push("Rerank failed; fused retrieval order was used"); degradedStages.push("rerank"); timingsMs.rerank = performance.now() - rerankStarted;
      return { evidence: rerankInput.slice(0, request.contextK), errors, degradedStages, timingsMs };
    }
  }

  async answer(rawRequest: RagSearchRequestInput, options?: { signal?: AbortSignal }): Promise<RagRunResult> {
    const request = RagSearchRequestSchema.parse(rawRequest); const retrieval = await this.retrieveWithAudit(request, options); const evidence = retrieval.evidence; const active = this.search.getActivePublication();
    const audit: RagRunResult["audit"] = {
      indexVersion: request.indexVersion ?? active?.indexVersion, embeddingVersion: active?.embeddingVersion,
      rerankProvider: this.reranker ? `${this.reranker.provider}:${this.reranker.model}` : undefined,
      modelProvider: this.model ? `${this.model.provider}:${this.model.model}` : undefined,
      lexicalEvidenceCount: evidence.filter((item) => (item.scores.lexical ?? 0) > 0).length,
      vectorEvidenceCount: evidence.filter((item) => (item.scores.vector ?? 0) > 0).length,
      degradedStages: [...retrieval.degradedStages], timingsMs: { ...retrieval.timingsMs }, errors: [...retrieval.errors],
    };
    if (evidence.length < this.minEvidence) return { status: "insufficient_evidence", evidence, audit: { ...audit, errors: ["Evidence sufficiency threshold was not met"] } };
    if (!this.model) return { status: "evidence_only", evidence, audit };
    let generated: GroundedAnswer;
    const generationStarted = performance.now();
    try {
      const result = await this.model.generateGroundedAnswer({ question: request.query, plan: request.plan, evidence }, { signal: options?.signal });
      const { usage, ...answer } = result; generated = answer; audit.modelUsage = usage; audit.timingsMs = { ...(audit.timingsMs ?? {}), generation: performance.now() - generationStarted };
    } catch {
      audit.timingsMs = { ...(audit.timingsMs ?? {}), generation: performance.now() - generationStarted }; audit.errors.push("Model generation was unavailable or violated the grounded answer contract"); audit.degradedStages?.push("generation");
      return { status: "evidence_only", evidence, audit };
    }
    const answer = evidenceRequiresReview(evidence) ? { ...generated, reviewRequired: true } : generated;
    const validation = validateGroundedAnswer(answer, evidence); audit.citationCoverage = validation.citationCoverage; audit.groundingSupport = validation.groundingSupport; audit.errors.push(...validation.errors);
    if (!validation.valid) return { status: "validation_failed", evidence, answer, audit };
    return { status: "completed", evidence, answer, audit };
  }
}

export function createDefaultQueryPlan(input: { agentId: string; query: string; knowledgeDomains: string[]; asOf?: string; exactTerms?: string[]; filters?: RagQueryPlan["filters"] }): RagQueryPlan {
  return RagQueryPlanSchema.parse({ agentId: input.agentId, intent: "knowledge-grounded-answer", subQueries: [input.query], exactTerms: input.exactTerms ?? [], filters: input.filters ?? {}, asOf: input.asOf ?? new Date().toISOString(), knowledgeDomains: input.knowledgeDomains });
}
