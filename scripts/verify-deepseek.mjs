import assert from "node:assert/strict";

const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url));
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const cases = [
  { agentId: "AG-001", input: "比较云巡 X8 和山岳 T60，主要用于山区巡检，关注续航与抗风。", select: (body) => body.output.comparison },
  { agentId: "AG-012", input: "样例飞行活动管理办法有哪些要求？", select: (body) => body.output.policy },
  { agentId: "AG-027", input: "分析近8周退款率趋势，说明指标口径、数据质量和异常线索。", select: (body) => body.output.data_analysis },
  { agentId: "AG-025", input: "平台支持哪些支付方式？", select: (body) => body.output.customer_service },
];
const results = [];

for (const item of cases) {
  const startedAt = Date.now();
  const response = await worker.fetch(new Request(`http://localhost/api/agents/${item.agentId}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent_id: item.agentId, input: item.input }),
  }), env, ctx);
  const body = await response.json();
  assert.equal(response.status, 200, `${item.agentId} failed with HTTP ${response.status}`);
  assert.ok(["completed", "needs_review"].includes(body.status), `${item.agentId} returned unexpected status ${body.status}`);
  const output = item.select(body);
  assert.equal(output.rag_runtime?.status, "completed");
  assert.match(output.rag_runtime?.model_provider ?? "", /^deepseek:/);
  assert.equal(output.rag_runtime?.embedding_version, "qwen:text-embedding-v4");
  assert.equal(output.rag_runtime?.rerank_provider, "qwen:gte-rerank-v2");
  assert.ok(output.rag_runtime?.vector_evidence_count > 0, `${item.agentId} did not return vector-scored evidence`);
  assert.equal(output.rag_runtime?.citation_coverage, 1);
  assert.ok(output.rag_runtime?.grounding_support >= 0.08, `${item.agentId} grounding support was too low`);
  assert.ok(output.rag_runtime?.claims.length > 0, `${item.agentId} did not preserve claim-to-evidence mappings`);
  assert.ok(output.rag_runtime?.evidence.length > 0, `${item.agentId} did not expose governed evidence records`);
  assert.ok(output.rag_runtime.evidence.every((evidence) => evidence.knowledge_id.startsWith(`KB-${item.agentId.replace("-", "")}-`) && evidence.source_nature.includes("虚构") && evidence.source_uri.startsWith("knowledge/")), `${item.agentId} returned evidence outside the formal demonstration catalog`);
  results.push({
    agent_id: item.agentId,
    response_status: body.status,
    rag_status: output.rag_runtime.status,
    model_provider: output.rag_runtime.model_provider,
    embedding_version: output.rag_runtime.embedding_version,
    rerank_provider: output.rag_runtime.rerank_provider,
    lexical_evidence_count: output.rag_runtime.lexical_evidence_count,
    vector_evidence_count: output.rag_runtime.vector_evidence_count,
    citation_coverage: output.rag_runtime.citation_coverage,
    grounding_support: output.rag_runtime.grounding_support,
    model_tokens: output.rag_runtime.model_usage?.total_tokens ?? null,
    governed_evidence_count: output.rag_runtime.evidence.length,
    duration_ms: Date.now() - startedAt,
  });
}

console.log(JSON.stringify({ verified: true, results }, null, 2));
