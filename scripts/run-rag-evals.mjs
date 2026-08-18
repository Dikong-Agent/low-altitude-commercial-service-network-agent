import assert from "node:assert/strict";
import { InMemoryHybridSearch, createDefaultQueryPlan } from "../app/lib/rag/index.ts";

const dimensions = {
  return: [1, 0, 0, 0], battery: [0, 1, 0, 0], policy: [0, 0, 1, 0], payment: [0, 0, 0, 1],
};
const cases = [
  ["自动返程前检查什么", "return"], ["失联后怎样回到起点", "return"],
  ["电池怎样长期保存", "battery"], ["低温环境如何维护电芯", "battery"],
  ["现行飞行活动管理要求", "policy"], ["报备材料依据哪个办法", "policy"],
  ["结算时能用什么付款", "payment"], ["订单在线支付规则", "payment"],
];
const contents = {
  return: "飞行器启动自动返航前，应核对电量、返航点和返航高度。",
  battery: "电池长期存放应保持适当电量，并定期检查电芯状态。",
  policy: "飞行活动应依据现行管理办法准备报备材料并核对适用范围。",
  payment: "平台样例订单支持在线支付，实际方式以结算页面为准。",
};

const store = new InMemoryHybridSearch();
const base = { namespace: "rag-eval", documentVersion: "v1", sourceType: "golden", tenantId: "eval", visibilityRoles: ["evaluator"], status: "active", entityIds: [], domainTags: ["eval"], riskTags: [], metadata: {}, locator: {}, sectionPath: [], embeddingVersion: "fixture:v1" };
await store.publish(Object.entries(contents).map(([id, content]) => ({ ...base, chunkId: id, documentId: id, sourceUri: `golden://${id}`, title: id, content, contentHash: `h-${id}`, embedding: dimensions[id] })), { embeddingVersion: "fixture:v1" });

const reciprocalRanks = []; const recalls = []; const ndcgs = []; const latencies = [];
for (const [query, expected] of cases) {
  const started = performance.now();
  const result = await store.search({ query, plan: createDefaultQueryPlan({ agentId: "AG-001", query, knowledgeDomains: ["eval"] }), access: { tenantId: "eval", roles: ["evaluator"] }, namespaces: ["rag-eval"], retrieveK: 4, rerankK: 4, contextK: 3, minVectorScore: 0.2, minRerankScore: 0.12 }, dimensions[expected]);
  latencies.push(performance.now() - started);
  const rank = result.findIndex((item) => item.documentId === expected) + 1;
  recalls.push(rank > 0 && rank <= 3 ? 1 : 0); reciprocalRanks.push(rank > 0 && rank <= 3 ? 1 / rank : 0); ndcgs.push(rank > 0 && rank <= 3 ? 1 / Math.log2(rank + 1) : 0);
}
const average = (values) => values.reduce((sum, item) => sum + item, 0) / values.length;
const sortedLatency = [...latencies].sort((a, b) => a - b); const p95 = sortedLatency[Math.min(sortedLatency.length - 1, Math.ceil(sortedLatency.length * 0.95) - 1)];
const concurrentStarted = performance.now();
await Promise.all(Array.from({ length: 50 }, (_, index) => {
  const [query, expected] = cases[index % cases.length];
  return store.search({ query, plan: createDefaultQueryPlan({ agentId: "AG-001", query, knowledgeDomains: ["eval"] }), access: { tenantId: "eval", roles: ["evaluator"] }, namespaces: ["rag-eval"], retrieveK: 4, rerankK: 4, contextK: 3, minVectorScore: 0.2, minRerankScore: 0.12 }, dimensions[expected]);
}));
const concurrentDuration = performance.now() - concurrentStarted;
const metrics = { cases: cases.length, recall_at_3: average(recalls), mrr_at_3: average(reciprocalRanks), ndcg_at_3: average(ndcgs), latency_ms_p95: p95, concurrent_queries: 50, concurrent_total_ms: concurrentDuration };
assert.ok(metrics.recall_at_3 >= 0.95); assert.ok(metrics.mrr_at_3 >= 0.9); assert.ok(metrics.ndcg_at_3 >= 0.9); assert.ok(metrics.latency_ms_p95 < 100);
assert.ok(metrics.concurrent_total_ms < 1000);
console.log(JSON.stringify({ verified: true, metrics }, null, 2));
