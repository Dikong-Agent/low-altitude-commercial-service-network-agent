import type { GroundedAnswer, IndexPublication, KnowledgeChunk, KnowledgeDocument, RagEvidence, RagSearchRequestInput } from "./contracts.ts";
import { loadRagRuntimeConfig, type RagRuntimeConfig } from "./config.ts";
import { createRagKernel } from "./factory.ts";
import type { RagRunResult } from "./kernel.ts";
import { sha256 } from "./text.ts";
import { chunkKnowledgeDocument } from "./chunking.ts";
import { createRuntimeRagKnowledgeStore, type RagKnowledgeStore } from "./persistence.ts";
import { getRuntimeBindings } from "../runtime-bindings.ts";
function portableChunk(chunk: KnowledgeChunk): KnowledgeChunk { const copy = { ...chunk }; delete copy.indexVersion; return copy; }

export interface RagRuntimeHealth {
  status: "ready" | "not_configured" | "invalid_configuration";
  mode: "disabled" | "local" | "remote" | "unknown";
  capabilities: { lexical: boolean; vector: boolean; rerank: boolean; generation: boolean; persistence: boolean };
  providers: { model: string; embedding: string; rerank: string };
  activeIndex?: { indexVersion: string; embeddingVersion?: string; publishedAt: string; chunkCount: number };
  indexedNamespaces: number;
  metrics: { runs: number; completed: number; insufficientEvidence: number; validationFailed: number; degraded: number; averageDurationMs: number };
  message: string;
}

export class SharedRagRuntime {
  private readonly kernel;
  readonly config: RagRuntimeConfig;
  private readonly namespaceDigests = new Map<string, string>();
  private readonly namespacePublications = new Map<string, IndexPublication>();
  private readonly namespaceDocumentIds = new Map<string, Set<string>>();
  private readonly namespaceChunks = new Map<string, KnowledgeChunk[]>();
  private publicationTail: Promise<void> = Promise.resolve();
  private readonly persistence: RagKnowledgeStore;
  private readonly metrics = { runs: 0, completed: 0, insufficientEvidence: 0, validationFailed: 0, degraded: 0, totalDurationMs: 0 };

  constructor(config: RagRuntimeConfig, persistence: RagKnowledgeStore = createRuntimeRagKnowledgeStore()) { this.config = config; this.kernel = createRagKernel(config); this.persistence = persistence; }

  private expectedEmbeddingVersion(): string | undefined {
    return this.config.embedding.provider === "disabled" ? undefined : `${this.config.embedding.provider}:${this.config.embedding.model}`;
  }

  private rawNamespaceChunks(namespace: string, publication: IndexPublication): KnowledgeChunk[] {
    const prefix = `${namespace}:`;
    return this.kernel.getChunks(publication.indexVersion).filter((chunk) => chunk.namespace === namespace).map((chunk) => {
      const rest = portableChunk(chunk);
      return { ...rest, namespace: "default", chunkId: rest.chunkId.startsWith(prefix) ? rest.chunkId.slice(prefix.length) : rest.chunkId, documentId: rest.documentId.startsWith(prefix) ? rest.documentId.slice(prefix.length) : rest.documentId };
    });
  }

  async ensureChunks(namespace: string, chunks: readonly KnowledgeChunk[], signal?: AbortSignal): Promise<IndexPublication> {
    let release = () => {};
    const previous = this.publicationTail;
    this.publicationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      if (!namespace.trim() || namespace.includes(":")) throw new Error("RAG namespace must be a non-empty identifier without ':'");
      if (chunks.length > this.config.storage.maxChunksPerNamespace) throw new Error("RAG namespace exceeds its configured chunk capacity");
      const projectedTotal = [...this.namespaceChunks].reduce((sum, [key, items]) => sum + (key === namespace ? 0 : items.length), 0) + chunks.length;
      if (projectedTotal > this.config.storage.maxTotalChunks) throw new Error("RAG runtime exceeds its configured total chunk capacity");
      const digest = await sha256(JSON.stringify(chunks.map(portableChunk)));
      const existing = this.namespacePublications.get(namespace);
      if (existing && this.namespaceDigests.get(namespace) === digest) return existing;
      const prefixed = chunks.map((chunk) => ({ ...chunk, namespace, chunkId: `${namespace}:${chunk.chunkId}`, documentId: `${namespace}:${chunk.documentId}` }));
      const currentDocumentIds = new Set(prefixed.map((chunk) => chunk.documentId));
      const replaceDocumentIds = [...new Set([...(this.namespaceDocumentIds.get(namespace) ?? []), ...currentDocumentIds])];
      const publication = await this.kernel.ingestChunks(prefixed, { replaceDocumentIds, signal });
      if (!publication.warnings?.length) this.namespaceDigests.set(namespace, digest); else this.namespaceDigests.delete(namespace);
      this.namespacePublications.set(namespace, publication); this.namespaceDocumentIds.set(namespace, currentDocumentIds);
      const persistedChunks = this.rawNamespaceChunks(namespace, publication); this.namespaceChunks.set(namespace, persistedChunks);
      await this.persistence.save({ namespace, digest, embeddingVersion: publication.embeddingVersion, chunks: persistedChunks, updatedAt: new Date().toISOString() });
      return publication;
    } finally { release(); }
  }

  async ingestDocuments(namespace: string, documents: readonly KnowledgeDocument[], signal?: AbortSignal): Promise<IndexPublication[]> {
    const chunks = (await Promise.all(documents.map((document) => chunkKnowledgeDocument(document)))).flat();
    return [await this.ensureChunks(namespace, chunks, signal)];
  }

  async hydrateNamespace(namespace: string, signal?: AbortSignal): Promise<IndexPublication | undefined> {
    if (this.namespacePublications.has(namespace)) return this.namespacePublications.get(namespace);
    const persisted = await this.persistence.load(namespace); if (!persisted) return undefined;
    const expected = this.expectedEmbeddingVersion();
    const chunks = persisted.chunks.map((chunk) => expected && chunk.embeddingVersion !== expected ? { ...chunk, embedding: undefined, embeddingVersion: undefined } : chunk);
    return this.ensureChunks(namespace, chunks, signal);
  }

  async upsertDocuments(namespace: string, documents: readonly KnowledgeDocument[], signal?: AbortSignal): Promise<IndexPublication[]> {
    await this.hydrateNamespace(namespace, signal);
    const incoming = (await Promise.all(documents.map((document) => chunkKnowledgeDocument(document)))).flat();
    const replacing = new Set(incoming.map((chunk) => chunk.documentId));
    const retained = (this.namespaceChunks.get(namespace) ?? []).filter((chunk) => !replacing.has(chunk.documentId));
    return [await this.ensureChunks(namespace, [...retained, ...incoming], signal)];
  }

  async deleteDocuments(namespace: string, documentIds?: readonly string[], signal?: AbortSignal): Promise<IndexPublication | undefined> {
    await this.hydrateNamespace(namespace, signal); const current = this.namespaceChunks.get(namespace);
    if (!current) return undefined;
    const deleting = documentIds ? new Set(documentIds) : undefined;
    const remaining = deleting ? current.filter((chunk) => !deleting.has(chunk.documentId)) : [];
    const publication = await this.ensureChunks(namespace, remaining, signal);
    if (!remaining.length) { this.namespaceChunks.delete(namespace); this.namespaceDigests.delete(namespace); this.namespacePublications.delete(namespace); this.namespaceDocumentIds.delete(namespace); await this.persistence.delete(namespace); }
    return publication;
  }

  async retrieve(request: RagSearchRequestInput, signal?: AbortSignal): Promise<RagEvidence[]> { for (const namespace of request.namespaces ?? ["default"]) await this.hydrateNamespace(namespace, signal); return this.kernel.retrieve(request, { signal }); }
  async answer(request: RagSearchRequestInput, signal?: AbortSignal): Promise<RagRunResult> {
    const started = performance.now();
    for (const namespace of request.namespaces ?? ["default"]) await this.hydrateNamespace(namespace, signal);
    const result = await this.kernel.answer(request, { signal }); const duration = performance.now() - started;
    this.metrics.runs += 1; this.metrics.totalDurationMs += duration;
    if (result.status === "completed") this.metrics.completed += 1;
    if (result.status === "insufficient_evidence") this.metrics.insufficientEvidence += 1;
    if (result.status === "validation_failed") this.metrics.validationFailed += 1;
    if (result.audit.degradedStages?.length) this.metrics.degraded += 1;
    result.audit.timingsMs = { ...(result.audit.timingsMs ?? {}), total: duration }; return result;
  }

  health(): RagRuntimeHealth {
    const publication = this.namespacePublications.size ? [...this.namespacePublications.values()].at(-1) : undefined;
    const localMessage = this.config.model.provider === "disabled"
      ? "本地证据检索模式可用；未配置或调用外部Embedding与大模型。"
      : "本地证据检索与远端受约束生成已配置；远端实际可用性需通过请求验证。";
    return {
      status: this.config.mode === "disabled" ? "not_configured" : "ready", mode: this.config.mode,
      capabilities: { lexical: true, vector: this.config.embedding.provider !== "disabled", rerank: this.config.rerank.provider !== "disabled", generation: this.config.model.provider !== "disabled", persistence: Boolean(getRuntimeBindings()?.DB) },
      providers: { model: this.config.model.provider === "disabled" ? "disabled" : `${this.config.model.provider}:${this.config.model.model}`, embedding: this.config.embedding.provider === "disabled" ? "disabled" : `${this.config.embedding.provider}:${this.config.embedding.model}`, rerank: this.config.rerank.provider === "disabled" ? "disabled" : `${this.config.rerank.provider}:${this.config.rerank.model ?? "deterministic"}` },
      activeIndex: publication && { indexVersion: publication.indexVersion, embeddingVersion: publication.embeddingVersion, publishedAt: publication.publishedAt, chunkCount: publication.chunkCount },
      indexedNamespaces: this.namespaceDigests.size,
      metrics: { runs: this.metrics.runs, completed: this.metrics.completed, insufficientEvidence: this.metrics.insufficientEvidence, validationFailed: this.metrics.validationFailed, degraded: this.metrics.degraded, averageDurationMs: this.metrics.runs ? this.metrics.totalDurationMs / this.metrics.runs : 0 },
      message: this.config.mode === "remote" ? "远端Embedding与生成适配器配置完整；实际可用性需通过探针或请求验证。" : this.config.mode === "local" ? localMessage : "RAG运行时已禁用。",
    };
  }
}

let cached: { fingerprint: string; runtime: SharedRagRuntime } | undefined;
// The fingerprint never leaves server memory. Including credentials here ensures
// a rotated provider key creates fresh adapters instead of reusing stale ones.
function fingerprint(config: RagRuntimeConfig): string { return JSON.stringify(config); }
export function getSharedRagRuntime(): SharedRagRuntime {
  const config = loadRagRuntimeConfig(); const key = fingerprint(config);
  if (!cached || cached.fingerprint !== key) cached = { fingerprint: key, runtime: new SharedRagRuntime(config) };
  return cached.runtime;
}

export function getRagRuntimeHealth(): RagRuntimeHealth {
  try { return getSharedRagRuntime().health(); }
  catch (error) { return { status: "invalid_configuration", mode: "unknown", capabilities: { lexical: false, vector: false, rerank: false, generation: false, persistence: false }, providers: { model: "unknown", embedding: "unknown", rerank: "unknown" }, indexedNamespaces: 0, metrics: { runs: 0, completed: 0, insufficientEvidence: 0, validationFailed: 0, degraded: 0, averageDurationMs: 0 }, message: error instanceof Error ? error.message : "RAG configuration is invalid" }; }
}

export interface LegacyRagResult {
  ranks: Map<string, number>;
  status: RagRunResult["status"];
  answer?: GroundedAnswer;
  evidence: RagEvidence[];
  audit: RagRunResult["audit"];
}
