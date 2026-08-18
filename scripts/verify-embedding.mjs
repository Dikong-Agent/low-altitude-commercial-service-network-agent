import assert from "node:assert/strict";
import {
  InMemoryHybridSearch, OpenAICompatibleEmbeddingPort, RagKernel,
  createDefaultQueryPlan, loadRagRuntimeConfig,
} from "../app/lib/rag/index.ts";
import { cosineSimilarity } from "../app/lib/rag/text.ts";

const config = loadRagRuntimeConfig();
assert.notEqual(config.embedding.provider, "disabled", "Configure an independent Embedding provider first");
assert.ok(config.embedding.baseUrl && config.embedding.apiKey && config.embedding.model, "Embedding configuration is incomplete");
const embedding = new OpenAICompatibleEmbeddingPort({
  provider: config.embedding.provider, baseUrl: config.embedding.baseUrl, apiKey: config.embedding.apiKey,
  model: config.embedding.model, timeoutMs: config.embedding.timeoutMs,
});

const query = "battery duration";
const relevant = "This aircraft provides long endurance for continuous inspection missions.";
const distractor = "The payment portal supports settlement and invoice management.";
const startedAt = Date.now();
const [queryVector, documentVectors] = await Promise.all([embedding.embedQuery(query), embedding.embedDocuments([relevant, distractor])]);
assert.ok(queryVector.length >= 64, "Embedding dimensions are unexpectedly small");
assert.ok(documentVectors.every((vector) => vector.length === queryVector.length && vector.every(Number.isFinite)), "Embedding vectors are invalid");
const relevantSimilarity = cosineSimilarity(queryVector, documentVectors[0]);
const distractorSimilarity = cosineSimilarity(queryVector, documentVectors[1]);
assert.ok(relevantSimilarity > distractorSimilarity, "Semantic similarity did not rank the relevant text first");

const store = new InMemoryHybridSearch();
// This script verifies the embedding channel in isolation. A lexical reranker
// would intentionally suppress a semantic-only match with no shared tokens and
// would turn a healthy vector result into a false negative.
const kernel = new RagKernel(store, embedding);
const base = { documentVersion: "v1", sourceType: "verification", tenantId: "verification-tenant", visibilityRoles: ["agent-user"], status: "active", domainTags: ["product-manual"], entityIds: [], riskTags: [], metadata: {} };
await kernel.ingestDocument({ ...base, documentId: "vector-relevant", sourceUri: "verification://vector-relevant", title: "Endurance", content: relevant });
await kernel.ingestDocument({ ...base, documentId: "vector-distractor", sourceUri: "verification://vector-distractor", title: "Settlement", content: distractor });
const evidence = await kernel.retrieve({
  query, plan: createDefaultQueryPlan({ agentId: "AG-001", query, knowledgeDomains: ["product-manual"] }),
  access: { tenantId: "verification-tenant", roles: ["agent-user"] }, retrieveK: 10, rerankK: 10, contextK: 2,
});
assert.equal(evidence[0]?.documentId, "vector-relevant");
assert.ok((evidence[0]?.scores.vector ?? 0) > 0, "Top evidence has no vector score");
assert.equal(evidence[0]?.embeddingVersion, `${config.embedding.provider}:${config.embedding.model}`);

console.log(JSON.stringify({
  verified: true, provider: config.embedding.provider, model: config.embedding.model,
  dimensions: queryVector.length, relevant_similarity: relevantSimilarity, distractor_similarity: distractorSimilarity,
  top_document: evidence[0].documentId, top_vector_score: evidence[0].scores.vector,
  embedding_version: evidence[0].embeddingVersion, duration_ms: Date.now() - startedAt,
}, null, 2));
