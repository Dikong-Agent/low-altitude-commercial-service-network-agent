import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  InMemoryHybridSearch, LocalLexicalReranker, RagKernel, createDefaultQueryPlan, getRagAgentProfile,
  loadRagRuntimeConfig, validateGroundedAnswer, OpenAICompatibleEmbeddingPort, OpenAICompatibleModelGateway,
  QwenRerankPort, SharedRagRuntime, FORMAL_KNOWLEDGE_CATALOG, formalKnowledgeSummary, rankLegacyKnowledge,
  findFormalKnowledgeDocument,
} from "../app/lib/rag/index.ts";
import { DEMO_PRODUCT_CATALOG } from "../app/lib/agents/ag001/catalog.ts";
import { DEMO_POLICY_DOCUMENTS } from "../app/lib/agents/ag012/catalog.ts";
import { DEMO_CUSTOMER_SERVICE_KNOWLEDGE } from "../app/lib/agents/ag025/catalog.ts";

const tenantAccess = { tenantId: "tenant-a", roles: ["agent-user"] };
function request(query, domains, overrides = {}) {
  const plan = createDefaultQueryPlan({ agentId: "AG-001", query, knowledgeDomains: domains, asOf: "2026-08-13T00:00:00+08:00" });
  return { query, plan, access: tenantAccess, retrieveK: 20, rerankK: 10, contextK: 6, ...overrides };
}
function document(id, content, overrides = {}) {
  return { documentId: id, documentVersion: "v1", sourceType: "manual", sourceUri: `mock://${id}`, title: id, content, tenantId: "tenant-a", visibilityRoles: ["agent-user"], status: "active", domainTags: ["product-manual"], entityIds: [], riskTags: [], metadata: {}, ...overrides };
}

class TestEmbeddingPort {
  provider = "test"; model = "semantic-fixture"; version = "test:semantic-fixture:v1";
  vector(text) { return text.includes("电池坚持多久") || text.includes("长航时能力") ? [1, 0] : [0, 1]; }
  async embedDocuments(texts) { return texts.map((text) => this.vector(text)); }
  async embedQuery(text) { return this.vector(text); }
}

test("formal knowledge catalog covers governed documents for every registered Agent", async () => {
  const summary = formalKnowledgeSummary();
  assert.equal(summary.documentCount, 15);
  assert.deepEqual(summary.agentCounts, { "AG-001": 3, "AG-012": 4, "AG-027": 3, "AG-025": 5 });
  assert.equal(new Set(FORMAL_KNOWLEDGE_CATALOG.documents.map((item) => item.knowledge_id)).size, 15);
  assert.ok(FORMAL_KNOWLEDGE_CATALOG.documents.every((item) => ["公开演示", "公开资料"].includes(item.confidentiality) && item.reviewed_at));
  const official = FORMAL_KNOWLEDGE_CATALOG.documents.filter((item) => item.document_uri.startsWith("https://www.gov.cn/"));
  assert.equal(official.length, 1);
  assert.equal(official[0].knowledge_id, "KB-AG012-0004");
  assert.match(official[0].document_uri, /^https:\/\/www\.gov\.cn\//);
  for (const source of [
    "../knowledge/AG-001_产品选型与比较/产品参数资料.md", "../knowledge/AG-012_政策与标准/政策标准资料.md",
    "../knowledge/AG-027_指标与分析治理/指标与分析资料.md", "../knowledge/AG-025_客服知识/客服知识资料.md",
  ]) assert.match(await readFile(new URL(source, import.meta.url), "utf8"), /知识编号/);
});

test("legacy sample records are indexed with formal knowledge identity and governance metadata", async () => {
  const result = await rankLegacyKnowledge("AG-001", "云巡X8续航参数", [{ id: "DEMO-X8", title: "样例·云巡 X8", content: "续航55分钟，适用于园区巡检。", sourceUri: "Mock产品参数库", domain: "product-master" }]);
  assert.match(result.evidence[0]?.documentId ?? "", /KB-AG001-0001$/);
  assert.equal(result.evidence[0]?.documentVersion, "v1.0");
  assert.equal(result.evidence[0]?.metadata?.knowledge_id, "KB-AG001-0001");
  assert.equal(result.evidence[0]?.metadata?.source_nature, "项目自编虚构演示材料");
  assert.match(result.evidence[0]?.sourceUri ?? "", /^knowledge\//);
});

test("every record reachable by the four registered knowledge paths has a formal catalog mapping", () => {
  const reachable = {
    "AG-001": DEMO_PRODUCT_CATALOG.map((item) => item.id),
    "AG-012": DEMO_POLICY_DOCUMENTS.flatMap((document) => document.sections.map((section) => `${document.id}:${section.id}`)),
    "AG-027": ["METRIC-GMV-V2", "METRIC-REFUND-RATE-V2", "METRIC-CONVERSION-RATE-V2", "LINEAGE-ORDER-PAYMENT", "LINEAGE-REFUND", "LINEAGE-TRAFFIC", "GUIDE-GRAIN-COMPATIBILITY", "GUIDE-ANOMALY-INTERPRETATION", "GUIDE-CAUSAL-BOUNDARY"],
    "AG-025": DEMO_CUSTOMER_SERVICE_KNOWLEDGE.map((item) => item.id),
  };
  for (const [agentId, recordIds] of Object.entries(reachable)) for (const recordId of recordIds) assert.ok(findFormalKnowledgeDocument(agentId, recordId), `Missing formal knowledge mapping for ${agentId}:${recordId}`);
});

test("publishes immutable versions and can roll back an active knowledge index", async () => {
  const store = new InMemoryHybridSearch(); const kernel = new RagKernel(store);
  const first = await kernel.ingestDocument(document("manual-1", "第一版包含返航操作说明。"));
  const second = await kernel.ingestDocument(document("manual-1", "第二版仅包含电池维护说明。", { documentVersion: "v2" }));
  assert.notEqual(first.indexVersion, second.indexVersion);
  assert.equal((await kernel.retrieve(request("返航", ["product-manual"]))).length, 0);
  await store.rollback(first.indexVersion);
  assert.equal((await kernel.retrieve(request("返航", ["product-manual"]))).at(0)?.documentVersion, "v1");
});

test("shared runtime reuses unchanged namespaces and replaces stale namespace documents", async () => {
  const runtime = new SharedRagRuntime(loadRagRuntimeConfig({ RAG_RUNTIME_MODE: "local" }));
  const first = await runtime.ingestDocuments("manual-demo", [document("manual-a", "alpha return procedure")]);
  const reused = await runtime.ingestDocuments("manual-demo", [document("manual-a", "alpha return procedure")]);
  assert.equal(reused[0].indexVersion, first[0].indexVersion);

  const replaced = await runtime.ingestDocuments("manual-demo", [document("manual-b", "beta battery procedure")]);
  assert.notEqual(replaced[0].indexVersion, first[0].indexVersion);
  assert.equal((await runtime.retrieve(request("alpha", ["product-manual"], { namespaces: ["manual-demo"] }))).length, 0);
  const evidence = await runtime.retrieve(request("beta", ["product-manual"], { namespaces: ["manual-demo"] }));
  assert.equal(evidence[0].documentId, "manual-demo:manual-b");
  assert.equal(runtime.health().indexedNamespaces, 1);
});

test("hybrid retrieval uses vector evidence when lexical terms do not overlap", async () => {
  const store = new InMemoryHybridSearch(); const kernel = new RagKernel(store, new TestEmbeddingPort(), new LocalLexicalReranker());
  await kernel.ingestDocument(document("manual-vector", "该机型具有长航时能力，标准环境下可持续飞行。"));
  const evidence = await kernel.retrieve(request("电池坚持多久", ["product-manual"]));
  assert.equal(evidence.at(0)?.documentId, "manual-vector");
  assert.ok((evidence.at(0)?.scores.vector ?? 0) > 0.9);
  assert.equal(evidence.at(0)?.embeddingVersion, "test:semantic-fixture:v1");
});

test("weighted fusion can prioritize the semantic channel for recommendation profiles", async () => {
  const store = new InMemoryHybridSearch();
  const base = { documentVersion: "v1", sourceType: "metric", tenantId: "tenant-a", visibilityRoles: ["agent-user"], status: "active", entityIds: [], domainTags: ["metric-dictionary"], riskTags: [], metadata: {}, locator: {}, sectionPath: [] };
  await store.publish([
    { ...base, chunkId: "semantic", documentId: "semantic", sourceUri: "mock://semantic", title: "语义候选", content: "主题相关但没有精确字面词", contentHash: "h1", embedding: [1, 0], embeddingVersion: "test-v1" },
    { ...base, chunkId: "lexical", documentId: "lexical", sourceUri: "mock://lexical", title: "字面候选", content: "exactword", contentHash: "h2", embedding: [0, 1], embeddingVersion: "test-v1" },
  ]);
  const plan = createDefaultQueryPlan({ agentId: "AG-027", query: "exactword", knowledgeDomains: ["metric-dictionary"] });
  const result = await store.search({ query: "exactword", plan, access: tenantAccess, retrieveK: 10, rerankK: 10, contextK: 2, fusion: "weighted", fusionWeights: { lexical: 0, vector: 1 } }, [1, 0]);
  assert.deepEqual(result.map((item) => item.chunkId), ["semantic", "lexical"]);
});

test("filters tenant, role, status and effective time before retrieval", async () => {
  const store = new InMemoryHybridSearch(); const kernel = new RagKernel(store);
  await kernel.ingestDocument(document("allowed", "唯一授权口令 alpha。"));
  await kernel.ingestDocument(document("other-tenant", "其他租户口令 alpha。", { tenantId: "tenant-b" }));
  await kernel.ingestDocument(document("withdrawn", "已撤回口令 alpha。", { status: "withdrawn" }));
  await kernel.ingestDocument(document("future", "未来生效口令 alpha。", { effectiveFrom: "2027-01-01T00:00:00+08:00" }));
  await kernel.ingestDocument(document("admin-only", "管理员口令 alpha。", { visibilityRoles: ["admin"] }));
  const evidence = await kernel.retrieve(request("alpha", ["product-manual"]));
  assert.deepEqual(evidence.map((item) => item.documentId), ["allowed"]);
});

test("rejects generated claims that cite evidence outside the retrieved context", async () => {
  const store = new InMemoryHybridSearch();
  const badModel = { provider: "test", model: "bad-citation", async generateGroundedAnswer() { return { summary: "错误引用", claims: [{ text: "结论", evidenceChunkIds: ["missing"] }], missingInformation: [], conflicts: [], reviewRequired: false }; } };
  const kernel = new RagKernel(store, undefined, new LocalLexicalReranker(), badModel);
  await kernel.ingestDocument(document("manual-grounding", "返航前必须核对电量。", { riskTags: ["safety"] }));
  const result = await kernel.answer(request("返航电量", ["product-manual"]));
  assert.equal(result.status, "validation_failed");
  assert.match(result.audit.errors.join(" "), /unavailable chunks/);
});

test("degrades to evidence-only when remote generation is unavailable", async () => {
  const store = new InMemoryHybridSearch();
  const unavailableModel = { provider: "test", model: "unavailable", async generateGroundedAnswer() { throw new Error("upstream failure"); } };
  const kernel = new RagKernel(store, undefined, new LocalLexicalReranker(), unavailableModel);
  await kernel.ingestDocument(document("manual-fallback", "返航前必须核对电量。"));
  const result = await kernel.answer(request("返航电量", ["product-manual"]));
  assert.equal(result.status, "evidence_only");
  assert.equal(result.evidence.length, 1);
  assert.match(result.audit.errors.join(" "), /generation was unavailable/);
});

test("validates all four design profiles and remote provider completeness", async () => {
  for (const id of ["AG-001", "AG-012", "AG-025", "AG-027"]) {
    const profile = getRagAgentProfile(id); assert.ok(profile.retrieval.retrieveK >= profile.retrieval.rerankK); assert.ok(profile.retrieval.rerankK >= profile.retrieval.contextK);
  }
  assert.equal(getRagAgentProfile("AG-027").retrieval.fusionWeights.vector, 0.3);
  const design = JSON.parse(await readFile(new URL("../../../Agent研发设计/rag_profiles.json", import.meta.url), "utf8"));
  for (const item of design.profiles) {
    const runtime = getRagAgentProfile(item.agent_id);
    assert.deepEqual(runtime.knowledgeDomains, item.knowledge_domains);
    assert.deepEqual(
      [runtime.retrieval.retrieveK, runtime.retrieval.rerankK, runtime.retrieval.contextK, runtime.retrieval.fusion, runtime.retrieval.minVectorScore, runtime.retrieval.minLexicalCoverage, runtime.retrieval.minRerankScore],
      [item.retrieval.retrieve_k, item.retrieval.rerank_k, item.retrieval.context_k, item.retrieval.fusion, item.retrieval.min_vector_score, item.retrieval.min_lexical_coverage, item.retrieval.min_rerank_score],
    );
  }
  assert.equal(loadRagRuntimeConfig({ RAG_RUNTIME_MODE: "local" }).model.provider, "disabled");
  assert.equal(loadRagRuntimeConfig({ RAG_RUNTIME_MODE: "local" }).retrieval.maxIndexVersions, 20);
  const qwenEmbedding = loadRagRuntimeConfig({ RAG_RUNTIME_MODE: "local", EMBEDDING_PROVIDER: "qwen", EMBEDDING_API_KEY: "server-only", EMBEDDING_MODEL: "text-embedding-v4" });
  assert.equal(qwenEmbedding.embedding.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  assert.equal(qwenEmbedding.embedding.provider, "qwen");
  assert.equal(qwenEmbedding.embedding.maxBatch, 10);
  assert.throws(() => loadRagRuntimeConfig({ RAG_RUNTIME_MODE: "remote", MODEL_PROVIDER: "deepseek" }), /remote configuration is incomplete/);
});

test("calls OpenAI-compatible embedding and grounded generation contracts", async () => {
  const originalFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), authorization: new Headers(init.headers).get("authorization"), body: JSON.parse(init.body) });
    if (String(url).endsWith("/embeddings")) return Response.json({ data: [{ index: 0, embedding: [0.2, 0.8] }] });
    return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "依据说明书回答", claims: [{ text: "返航前核对电量", evidenceChunkIds: ["c1"] }], missingInformation: [], conflicts: [], reviewRequired: false }) } }] });
  };
  try {
    const embedding = new OpenAICompatibleEmbeddingPort({ provider: "openai-compatible", baseUrl: "https://embedding.example/v1", apiKey: "server-secret", model: "embedding-model", timeoutMs: 1_000 });
    assert.deepEqual(await embedding.embedQuery("返航"), [0.2, 0.8]);
    const gateway = new OpenAICompatibleModelGateway({ provider: "deepseek", baseUrl: "https://model.example/v1", apiKey: "server-secret", model: "deepseek-chat", timeoutMs: 1_000 });
    const evidence = [{ chunkId: "c1", documentId: "d1", documentVersion: "v1", title: "说明书", content: "返航前核对电量", sourceUri: "mock://d1", locator: {}, domainTags: ["product-manual"], riskTags: [], scores: { fused: 1 }, indexVersion: "idx-1" }];
    const answer = await gateway.generateGroundedAnswer({ question: "返航前检查什么", plan: createDefaultQueryPlan({ agentId: "AG-001", query: "返航前检查什么", knowledgeDomains: ["product-manual"] }), evidence });
    assert.equal(answer.claims[0].evidenceChunkIds[0], "c1");
    assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ["/v1/embeddings", "/v1/chat/completions"]);
    assert.ok(calls.every((call) => call.authorization === "Bearer server-secret"));
    assert.equal(calls[1].body.response_format.type, "json_object");
  } finally { globalThis.fetch = originalFetch; }
});

test("grounding validator reports complete claim-level citation coverage", () => {
  const evidence = [{ chunkId: "c1", documentId: "d1", documentVersion: "v1", title: "t", content: "事实", sourceUri: "mock://d1", locator: {}, domainTags: [], riskTags: [], scores: { fused: 1 }, indexVersion: "idx-1" }];
  const result = validateGroundedAnswer({ summary: "摘要", claims: [{ text: "事实", evidenceChunkIds: ["c1"] }], missingInformation: [], conflicts: [], reviewRequired: false }, evidence);
  assert.equal(result.valid, true); assert.equal(result.citationCoverage, 1);
});

test("ACL and effective metadata changes always publish a fresh index", async () => {
  const runtime = new SharedRagRuntime(loadRagRuntimeConfig({ RAG_RUNTIME_MODE: "local" }));
  const first = await runtime.ingestDocuments("acl-demo", [document("sensitive", "sensitive-alpha")]);
  const second = await runtime.ingestDocuments("acl-demo", [document("sensitive", "sensitive-alpha", { visibilityRoles: ["admin"] })]);
  assert.notEqual(first[0].indexVersion, second[0].indexVersion);
  assert.equal((await runtime.retrieve(request("sensitive-alpha", ["product-manual"], { namespaces: ["acl-demo"] }))).length, 0);
});

test("namespace is a mandatory retrieval isolation boundary", async () => {
  const runtime = new SharedRagRuntime(loadRagRuntimeConfig({ RAG_RUNTIME_MODE: "local" }));
  await runtime.ingestDocuments("namespace-one", [document("one", "sharedterm one")]);
  await runtime.ingestDocuments("namespace-two", [document("two", "sharedterm two")]);
  const one = await runtime.retrieve(request("sharedterm", ["product-manual"], { namespaces: ["namespace-one"] }));
  assert.deepEqual(one.map((item) => item.documentId), ["namespace-one:one"]);
});

test("tiny vector similarity does not pass evidence sufficiency", async () => {
  const lowEmbedding = { provider: "test", model: "low", version: "test:low", async embedDocuments() { return [[0.0001, 0.999999995]]; }, async embedQuery() { return [1, 0]; } };
  const kernel = new RagKernel(new InMemoryHybridSearch(), lowEmbedding, new LocalLexicalReranker());
  await kernel.ingestDocument(document("unrelated", "completely unrelated content"));
  const result = await kernel.answer(request("semantic query without overlap", ["product-manual"]));
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.evidence.length, 0);
});

test("active index rejects mixed embedding dimensions and versions", async () => {
  const store = new InMemoryHybridSearch(); const base = { namespace: "default", documentVersion: "v1", sourceType: "manual", tenantId: "tenant-a", visibilityRoles: ["agent-user"], status: "active", entityIds: [], domainTags: ["product-manual"], riskTags: [], metadata: {}, locator: {}, sectionPath: [] };
  await store.publish([{ ...base, chunkId: "old", documentId: "old", sourceUri: "mock://old", title: "old", content: "old", contentHash: "h1", embedding: [1, 0], embeddingVersion: "v1" }], { embeddingVersion: "v1" });
  await assert.rejects(store.publish([{ ...base, chunkId: "new", documentId: "new", sourceUri: "mock://new", title: "new", content: "new", contentHash: "h2", embedding: [1, 0, 0], embeddingVersion: "v2" }], { embeddingVersion: "v2" }), /dimensions|versions/);
});

test("embedding and rerank failures degrade to lexical evidence", async () => {
  const badEmbedding = { provider: "test", model: "down", version: "test:down", async embedDocuments() { throw new Error("down"); }, async embedQuery() { throw new Error("down"); } };
  const badReranker = { provider: "test", model: "down", async rerank() { throw new Error("down"); } };
  const kernel = new RagKernel(new InMemoryHybridSearch(), badEmbedding, badReranker);
  const publication = await kernel.ingestDocument(document("fallback", "返航前必须核对电量"));
  assert.equal(publication.warnings?.length, 1);
  const result = await kernel.answer(request("返航 电量", ["product-manual"]));
  assert.equal(result.status, "evidence_only");
  assert.deepEqual(result.audit.degradedStages, ["embedding", "rerank"]);
  assert.equal(result.evidence[0].documentId, "fallback");
});

test("grounding rejects a citation that exists but does not support the claim", () => {
  const evidence = [{ chunkId: "c1", documentId: "d1", documentVersion: "v1", namespace: "default", title: "t", content: "平台支持在线支付。", sourceUri: "mock://d1", locator: {}, domainTags: [], riskTags: [], scores: { fused: 1 }, indexVersion: "idx-1" }];
  const result = validateGroundedAnswer({ summary: "摘要", claims: [{ text: "该飞行器续航120分钟并达到IP99防护等级", evidenceChunkIds: ["c1"] }], missingInformation: [], conflicts: [], reviewRequired: false }, evidence);
  assert.equal(result.valid, false); assert.match(result.errors.join(" "), /unsupported|not sufficiently supported/);
});

class MemoryRagStore {
  values = new Map();
  async load(namespace) { return structuredClone(this.values.get(namespace) ?? null); }
  async save(value) { this.values.set(value.namespace, structuredClone(value)); }
  async delete(namespace) { this.values.delete(namespace); }
}

test("persistent namespace restores, incrementally upserts and deletes documents", async () => {
  const persistence = new MemoryRagStore(); const config = loadRagRuntimeConfig({ RAG_RUNTIME_MODE: "local" });
  const first = new SharedRagRuntime(config, persistence); await first.upsertDocuments("persistent", [document("a", "alpha restore")]);
  const restored = new SharedRagRuntime(config, persistence);
  assert.equal((await restored.retrieve(request("alpha", ["product-manual"], { namespaces: ["persistent"] })))[0].documentId, "persistent:a");
  await restored.upsertDocuments("persistent", [document("b", "beta incremental")]);
  await restored.deleteDocuments("persistent", ["a"]);
  assert.equal((await restored.retrieve(request("alpha", ["product-manual"], { namespaces: ["persistent"] }))).length, 0);
  assert.equal((await restored.retrieve(request("beta", ["product-manual"], { namespaces: ["persistent"] })))[0].documentId, "persistent:b");
  await restored.deleteDocuments("persistent");
  assert.equal(await persistence.load("persistent"), null);
});

test("concurrent namespace publications serialize and capacity is enforced", async () => {
  const config = loadRagRuntimeConfig({ RAG_RUNTIME_MODE: "local", RAG_MAX_CHUNKS_PER_NAMESPACE: "1", RAG_MAX_TOTAL_CHUNKS: "2" });
  const runtime = new SharedRagRuntime(config);
  const [first, second] = await Promise.all([runtime.ingestDocuments("serial", [document("a", "alpha")]), runtime.ingestDocuments("serial", [document("b", "beta")])]);
  assert.notEqual(first[0].indexVersion, second[0].indexVersion);
  const active = [
    ...(await runtime.retrieve(request("alpha", ["product-manual"], { namespaces: ["serial"] }))),
    ...(await runtime.retrieve(request("beta", ["product-manual"], { namespaces: ["serial"] }))),
  ];
  assert.equal(active.length, 1);
  assert.ok(["serial:a", "serial:b"].includes(active[0].documentId));
  await assert.rejects(runtime.ingestDocuments("too-large", [document("c", "one\n\n" + "x".repeat(800))]), /capacity/);
});

test("calls the native Qwen semantic rerank contract", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { const body = JSON.parse(init.body); assert.equal(body.input.query, "返航"); return Response.json({ output: { results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.1 }] } }); };
  try {
    const reranker = new QwenRerankPort({ provider: "qwen", baseUrl: "https://example.test/rerank", apiKey: "secret", model: "gte-rerank-v2", timeoutMs: 1000 });
    const evidence = ["a", "b"].map((id) => ({ chunkId: id, documentId: id, documentVersion: "v1", namespace: "default", title: id, content: id, sourceUri: `mock://${id}`, locator: {}, domainTags: [], riskTags: [], scores: { fused: 1 }, indexVersion: "idx" }));
    assert.deepEqual((await reranker.rerank("返航", evidence)).map((item) => item.chunkId), ["b", "a"]);
  } finally { globalThis.fetch = originalFetch; }
});
