import assert from "node:assert/strict";
import { OpenAICompatibleModelGateway, createDefaultQueryPlan, loadRagRuntimeConfig } from "../app/lib/rag/index.ts";

const config = loadRagRuntimeConfig();
assert.equal(config.model.provider, "deepseek");
assert.ok(config.model.baseUrl && config.model.apiKey && config.model.model, "DeepSeek configuration is incomplete");
const gateway = new OpenAICompatibleModelGateway({
  provider: config.model.provider,
  baseUrl: config.model.baseUrl,
  apiKey: config.model.apiKey,
  model: config.model.model,
  timeoutMs: config.model.timeoutMs,
});
const evidence = [{
  chunkId: "connectivity-check:c1", documentId: "connectivity-check", documentVersion: "v1",
  title: "连通性验证资料", content: "样例设备飞行前应检查桨叶、电池、定位、返航设置、天气与空域。",
  sourceUri: "verification://local-evidence", locator: {}, domainTags: ["product-manual"], riskTags: [],
  scores: { fused: 1 }, indexVersion: "verification-index",
}];
const startedAt = Date.now();
const answer = await gateway.generateGroundedAnswer({
  question: "样例设备飞行前应检查哪些方面？",
  plan: createDefaultQueryPlan({ agentId: "AG-001", query: "样例设备飞行前应检查哪些方面？", knowledgeDomains: ["product-manual"] }),
  evidence,
});
assert.ok(answer.claims.length > 0);
assert.ok(answer.claims.every((claim) => claim.evidenceChunkIds.every((id) => id === "connectivity-check:c1")));
console.log(JSON.stringify({ verified: true, provider: config.model.provider, model: config.model.model, duration_ms: Date.now() - startedAt, claim_count: answer.claims.length }, null, 2));
