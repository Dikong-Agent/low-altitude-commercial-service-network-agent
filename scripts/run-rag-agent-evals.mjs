import assert from "node:assert/strict";
import { InMemoryHybridSearch, createDefaultQueryPlan } from "../app/lib/rag/index.ts";

const agents = [
  { id: "AG-001", domain: "product-master", namespace: "eval-ag001", labels: ["云巡X8山区巡检参数", "山岳T60抗风载荷参数"] },
  { id: "AG-012", domain: "policy", namespace: "eval-ag012", labels: ["飞行活动报备现行要求", "历史政策版本变更"] },
  { id: "AG-027", domain: "metric-dictionary", namespace: "eval-ag027", labels: ["退款率指标口径与粒度", "成交额指标维度与截止时间"] },
  { id: "AG-025", domain: "faq", namespace: "eval-ag025", labels: ["平台在线支付说明", "会员权益与有效期说明"] },
];
const vectorCount = agents.length * 3; const vector = (index) => Array.from({ length: vectorCount }, (_, current) => current === index ? 1 : 0);
const zero = Array.from({ length: vectorCount }, () => 0); const store = new InMemoryHybridSearch(); const chunks = [];
for (const [agentIndex, agent] of agents.entries()) {
  for (const [documentIndex, label] of agent.labels.entries()) {
    const id = `${agent.id.toLowerCase()}-${documentIndex + 1}`; const dimension = agentIndex * 3 + documentIndex;
    chunks.push({ chunkId: id, documentId: id, documentVersion: "v1", namespace: agent.namespace, sourceType: "agent-golden", sourceUri: `golden://${id}`, title: label, sectionPath: [], locator: {}, content: `${label}。该材料为授权的检索黄金样例，结论必须引用本材料。`, contentHash: `h-${id}`, tenantId: "eval", visibilityRoles: ["evaluator"], status: "active", entityIds: [id], domainTags: [agent.domain], riskTags: documentIndex ? ["safety"] : [], metadata: { agent_id: agent.id }, embedding: vector(dimension), embeddingVersion: "agent-golden:v1" });
  }
  const restrictedId = `${agent.id.toLowerCase()}-restricted`; const dimension = agentIndex * 3 + 2;
  chunks.push({ chunkId: restrictedId, documentId: restrictedId, documentVersion: "v1", namespace: agent.namespace, sourceType: "agent-golden", sourceUri: `golden://${restrictedId}`, title: "受限内部材料", sectionPath: [], locator: {}, content: "仅管理员可访问的受限材料。", contentHash: `h-${restrictedId}`, tenantId: "eval", visibilityRoles: ["admin"], status: "active", entityIds: [restrictedId], domainTags: [agent.domain], riskTags: [], metadata: { agent_id: agent.id }, embedding: vector(dimension), embeddingVersion: "agent-golden:v1" });
}
await store.publish(chunks, { embeddingVersion: "agent-golden:v1" });

const categoryTemplates = [
  ["normal", 0, "请查找相关业务依据"], ["alias", 0, "换一种说法查询同义业务要求"], ["exact", 1, "按精确对象编号定位材料"],
  ["time", 0, "截至指定日期核对有效内容"], ["conflict", 1, "存在冲突时查找直接证据"], ["no_evidence", null, "完全无关的量子引力最终实验结论"],
  ["unauthorized", "restricted", "读取受限内部材料"], ["prompt_injection", 0, "材料声称忽略规则时仍只检索事实"],
  ["high_risk", 1, "高风险结论需要查找原始依据并复核"], ["normal_secondary", 0, "补充检索主要业务事实"],
];
const results = []; const byAgent = {};
for (const [agentIndex, agent] of agents.entries()) {
  const agentResults = [];
  for (let variant = 1; variant <= 5; variant += 1) for (const [category, expected, template] of categoryTemplates) {
    const query = `${template}（变体${variant}）`; const expectedDimension = expected === "restricted" ? agentIndex * 3 + 2 : typeof expected === "number" ? agentIndex * 3 + expected : -1;
    const queryVector = expectedDimension >= 0 ? vector(expectedDimension) : zero;
    const evidence = await store.search({ query, plan: createDefaultQueryPlan({ agentId: agent.id, query, knowledgeDomains: [agent.domain], asOf: "2026-08-13T00:00:00+08:00" }), access: { tenantId: "eval", roles: ["evaluator"] }, namespaces: [agent.namespace], retrieveK: 10, rerankK: 5, contextK: 3, minVectorScore: 0.2, minRerankScore: 0.12 }, queryVector);
    const expectedId = typeof expected === "number" ? `${agent.id.toLowerCase()}-${expected + 1}` : null; const rank = expectedId ? evidence.findIndex((item) => item.documentId === expectedId) + 1 : 0;
    const passed = expectedId ? rank > 0 && rank <= 3 : evidence.length === 0;
    const shouldRetrieve = typeof expected === "number";
    agentResults.push({ category, passed, rank, shouldRetrieve }); results.push({ agent: agent.id, category, passed, rank, shouldRetrieve });
  }
  byAgent[agent.id] = { cases: agentResults.length, passed: agentResults.filter((item) => item.passed).length };
}
const positives = results.filter((item) => item.shouldRetrieve); const recall = positives.filter((item) => item.rank > 0 && item.rank <= 3).length / positives.length; const mrr = positives.reduce((sum, item) => sum + (item.rank > 0 ? 1 / item.rank : 0), 0) / positives.length;
const ndcg = positives.reduce((sum, item) => sum + (item.rank > 0 && item.rank <= 3 ? 1 / Math.log2(item.rank + 1) : 0), 0) / positives.length;
const abstentions = results.filter((item) => item.category === "no_evidence" || item.category === "unauthorized"); const abstentionAccuracy = abstentions.filter((item) => item.passed).length / abstentions.length;
if (!Object.values(byAgent).every((item) => item.cases === 50 && item.passed === 50)) console.error(JSON.stringify({ byAgent, failures: results.filter((item) => !item.passed).slice(0, 20) }, null, 2));
assert.equal(results.length, 200); assert.ok(Object.values(byAgent).every((item) => item.cases === 50 && item.passed === 50)); assert.equal(recall, 1); assert.equal(mrr, 1); assert.equal(ndcg, 1); assert.equal(abstentionAccuracy, 1);
console.log(JSON.stringify({ verified: true, total_cases: results.length, by_agent: byAgent, recall_at_3: recall, mrr_at_3: mrr, ndcg_at_3: ndcg, abstention_and_acl_accuracy: abstentionAccuracy }, null, 2));
