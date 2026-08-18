import type { HybridSearchPort, IndexPublication, KnowledgeChunk, RagEvidence, RagSearchRequest, RagSearchRequestInput } from "./contracts.ts";
import { KnowledgeChunkSchema, RagSearchRequestSchema } from "./contracts.ts";
import { cosineSimilarity, normalizeSearchText, termFrequency, tokenize } from "./text.ts";

interface Snapshot { publication: IndexPublication; chunks: readonly KnowledgeChunk[] }

function valueMatches(actual: unknown, expected: string | number | boolean | string[]): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) ? expected.some((item) => actual.includes(item)) : expected.includes(String(actual));
  return Array.isArray(actual) ? actual.includes(String(expected)) : actual === expected;
}

function canAccess(chunk: KnowledgeChunk, request: RagSearchRequest): boolean {
  const asOf = Date.parse(request.plan.asOf);
  if (!request.namespaces.includes(chunk.namespace)) return false;
  if (chunk.status !== "active" || (chunk.tenantId !== "*" && chunk.tenantId !== request.access.tenantId)) return false;
  if (!chunk.visibilityRoles.includes("*") && !request.access.roles.some((role) => chunk.visibilityRoles.includes(role))) return false;
  if (chunk.effectiveFrom && Date.parse(chunk.effectiveFrom) > asOf) return false;
  if (chunk.effectiveTo && Date.parse(chunk.effectiveTo) < asOf) return false;
  if (!request.plan.knowledgeDomains.some((domain) => chunk.domainTags.includes(domain))) return false;
  return Object.entries(request.plan.filters).every(([key, expected]) => {
    const builtIn: Record<string, unknown> = { documentId: chunk.documentId, documentVersion: chunk.documentVersion, sourceType: chunk.sourceType, entityIds: chunk.entityIds };
    return valueMatches(key in builtIn ? builtIn[key] : chunk.metadata[key], expected);
  });
}

function bm25(chunks: readonly KnowledgeChunk[], queryTokens: readonly string[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (!queryTokens.length || !chunks.length) return scores;
  const tokenized = chunks.map((chunk) => tokenize(`${chunk.title} ${chunk.sectionPath.join(" ")} ${chunk.content} ${chunk.entityIds.join(" ")}`));
  const averageLength = tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / tokenized.length || 1;
  const uniqueQuery = [...new Set(queryTokens)]; const k1 = 1.2; const b = 0.75;
  for (let docIndex = 0; docIndex < chunks.length; docIndex += 1) {
    const frequencies = termFrequency(tokenized[docIndex]!); let score = 0;
    for (const term of uniqueQuery) {
      const documentFrequency = tokenized.reduce((count, tokens) => count + (tokens.includes(term) ? 1 : 0), 0);
      const inverse = Math.log(1 + (chunks.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
      const frequency = frequencies.get(term) ?? 0;
      score += inverse * ((frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * tokenized[docIndex]!.length / averageLength)));
    }
    if (score > 0) scores.set(chunks[docIndex]!.chunkId, score);
  }
  return scores;
}

function ranks(scores: ReadonlyMap<string, number>): Map<string, number> {
  return new Map([...scores].sort((left, right) => right[1] - left[1]).map(([id], index) => [id, index + 1]));
}

export class InMemoryHybridSearch implements HybridSearchPort {
  private readonly snapshots = new Map<string, Snapshot>();
  private activeVersion: string | undefined;
  private readonly rrfK: number;
  private readonly maxSnapshots: number;
  constructor(rrfK = 60, maxSnapshots = 20) {
    if (!Number.isInteger(maxSnapshots) || maxSnapshots < 2) throw new Error("maxSnapshots must be an integer of at least 2");
    this.rrfK = rrfK; this.maxSnapshots = maxSnapshots;
  }

  async publish(rawChunks: readonly KnowledgeChunk[], options: { replaceDocumentIds?: readonly string[]; embeddingVersion?: string } = {}): Promise<IndexPublication> {
    const chunks = rawChunks.map((chunk) => KnowledgeChunkSchema.parse(chunk));
    if (new Set(chunks.map((chunk) => chunk.chunkId)).size !== chunks.length) throw new Error("Duplicate chunkId in publication");
    const previous = this.activeVersion ? this.snapshots.get(this.activeVersion) : undefined;
    const replaceIds = new Set(options.replaceDocumentIds ?? []);
    const retained = previous?.chunks.filter((chunk) => !replaceIds.has(chunk.documentId)) ?? [];
    const all = [...retained, ...chunks];
    if (new Set(all.map((chunk) => chunk.chunkId)).size !== all.length) throw new Error("Duplicate chunkId across active index");
    const dimensions = new Set(all.flatMap((chunk) => chunk.embedding ? [chunk.embedding.length] : []));
    if (dimensions.size > 1) throw new Error("Embedding dimensions must be consistent across the active index");
    const embeddingVersions = new Set(all.flatMap((chunk) => chunk.embeddingVersion ? [chunk.embeddingVersion] : []));
    if (embeddingVersions.size > 1) throw new Error("Embedding versions must be consistent across the active index");
    if (options.embeddingVersion && embeddingVersions.size && !embeddingVersions.has(options.embeddingVersion)) throw new Error("Publication embedding version does not match chunk embeddings");
    const indexVersion = `idx-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const publishedChunks = all.map((chunk) => Object.freeze({ ...chunk, indexVersion }));
    const publication: IndexPublication = Object.freeze({ indexVersion, embeddingVersion: options.embeddingVersion ?? [...embeddingVersions][0], embeddingDimensions: [...dimensions][0], publishedAt: new Date().toISOString(), chunkCount: publishedChunks.length, previousVersion: previous?.publication.indexVersion });
    this.snapshots.set(indexVersion, { publication, chunks: Object.freeze(publishedChunks) }); this.activeVersion = indexVersion;
    while (this.snapshots.size > this.maxSnapshots) {
      const oldest = this.snapshots.keys().next().value;
      if (!oldest || oldest === this.activeVersion) break;
      this.snapshots.delete(oldest);
    }
    return publication;
  }

  async rollback(indexVersion: string): Promise<IndexPublication> {
    const snapshot = this.snapshots.get(indexVersion);
    if (!snapshot) throw new Error(`Unknown index version: ${indexVersion}`);
    this.activeVersion = indexVersion; return snapshot.publication;
  }
  getActivePublication(): IndexPublication | undefined { return this.activeVersion ? this.snapshots.get(this.activeVersion)?.publication : undefined; }
  getChunks(indexVersion = this.activeVersion): readonly KnowledgeChunk[] { if (!indexVersion) return []; const snapshot = this.snapshots.get(indexVersion); if (!snapshot) throw new Error(`Unknown index version: ${indexVersion}`); return snapshot.chunks; }

  async search(rawRequest: RagSearchRequestInput, queryEmbedding?: readonly number[]): Promise<RagEvidence[]> {
    const request = RagSearchRequestSchema.parse(rawRequest); const version = request.indexVersion ?? this.activeVersion;
    if (!version) return [];
    const snapshot = this.snapshots.get(version); if (!snapshot) throw new Error(`Unknown index version: ${version}`);
    const eligible = snapshot.chunks.filter((chunk) => canAccess(chunk, request));
    const queryTokens = tokenize([request.query, ...request.plan.subQueries, ...request.plan.exactTerms].join(" "));
    const lexical = bm25(eligible, queryTokens); const vector = new Map<string, number>();
    const uniqueQueryTokens = [...new Set(queryTokens)];
    for (const chunk of eligible) if (lexical.has(chunk.chunkId)) {
      const documentTokens = new Set(tokenize(`${chunk.title} ${chunk.sectionPath.join(" ")} ${chunk.content} ${chunk.entityIds.join(" ")}`));
      const coverage = uniqueQueryTokens.length ? uniqueQueryTokens.filter((token) => documentTokens.has(token)).length / uniqueQueryTokens.length : 0;
      if (coverage < request.minLexicalCoverage) lexical.delete(chunk.chunkId);
    }
    if (queryEmbedding?.length) for (const chunk of eligible) if (chunk.embedding?.length === queryEmbedding.length) {
      const score = cosineSimilarity(chunk.embedding, queryEmbedding); if (score >= request.minVectorScore) vector.set(chunk.chunkId, score);
    }
    const lexicalRanks = ranks(lexical); const vectorRanks = ranks(vector); const normalizedExact = request.plan.exactTerms.map(normalizeSearchText);
    const maximumLexical = Math.max(0, ...lexical.values()); const maximumVector = Math.max(0, ...vector.values());
    return eligible.map((chunk): RagEvidence | undefined => {
      const lexicalRank = lexicalRanks.get(chunk.chunkId); const vectorRank = vectorRanks.get(chunk.chunkId);
      if (!lexicalRank && !vectorRank) return undefined;
      const searchable = normalizeSearchText(`${chunk.title} ${chunk.content} ${chunk.entityIds.join(" ")}`);
      const exactBoost = normalizedExact.some((term) => term && searchable.includes(term)) ? 1 : 0;
      const fused = request.fusion === "weighted"
        ? (maximumLexical ? (lexical.get(chunk.chunkId) ?? 0) / maximumLexical * request.fusionWeights.lexical : 0)
          + (maximumVector ? (vector.get(chunk.chunkId) ?? 0) / maximumVector * request.fusionWeights.vector : 0) + exactBoost
        : (lexicalRank ? 1 / (this.rrfK + lexicalRank) : 0) + (vectorRank ? 1 / (this.rrfK + vectorRank) : 0) + exactBoost;
      return { chunkId: chunk.chunkId, documentId: chunk.documentId, documentVersion: chunk.documentVersion, namespace: chunk.namespace, title: chunk.title, content: chunk.content, sourceUri: chunk.sourceUri,
        locator: chunk.locator, domainTags: chunk.domainTags, riskTags: chunk.riskTags, sourceType: chunk.sourceType, sectionPath: chunk.sectionPath,
        effectiveFrom: chunk.effectiveFrom, effectiveTo: chunk.effectiveTo, status: chunk.status, metadata: chunk.metadata,
        scores: { lexical: lexical.get(chunk.chunkId), vector: vector.get(chunk.chunkId), fused }, indexVersion: version, embeddingVersion: chunk.embeddingVersion };
    }).filter((item): item is RagEvidence => Boolean(item)).sort((left, right) => right.scores.fused - left.scores.fused).slice(0, request.retrieveK);
  }
}
