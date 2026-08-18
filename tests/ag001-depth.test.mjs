import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${crypto.randomUUID()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
async function invoke(worker, input) {
  const response = await worker.fetch(new Request("http://localhost/api/agents/AG-001/invoke", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent_id: "AG-001", input, session_id: `ag001-${crypto.randomUUID()}` }),
  }), env, ctx);
  assert.equal(response.status, 200);
  return response.json();
}

test("AG-001 keeps a neutral comparison neutral and exposes the material source conflict", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "对比云巡 X8 和山岳 T60，重点看续航、载荷和抗风能力");
  const result = response.output.comparison;
  assert.equal(response.status, "completed");
  assert.equal(result.intent.comparison_mode, "neutral_comparison");
  assert.equal(result.recommendation.primary_product_id, null);
  assert.equal(result.decision_assessment.status, "comparison_only");
  assert.ok(result.parameter_quality.conflict_items.some((item) => item.product_id === "DEMO-X8" && item.field === "标称续航"));
  assert.ok(result.difference_analysis.some((item) => item.key === "payloadKg"));
});

test("AG-001 interprets IP54以上 as a minimum and does not turn a negated feature into a requirement", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "需要IP54以上，但不需要热成像，对比云巡X8和山岳T60，推荐更适合园区巡检的型号");
  const result = response.output.comparison;
  assert.deepEqual(result.intent.requested_features, ["防护等级不低于IP54"]);
  for (const product of result.products) {
    const check = product.constraint_checks.find((item) => item.label === "防护等级不低于IP54");
    assert.equal(check?.determination, "passed");
  }
});

test("AG-001 parses price limits without requiring the word budget and gates a conflicted primary", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "价格不超过20万元、续航50分钟以上，推荐两款无人机");
  const result = response.output.comparison;
  assert.ok(result.intent.hard_constraints.some((item) => item.includes("预算不超过20万元")));
  assert.ok(result.intent.hard_constraints.some((item) => item.includes("续航不低于50分钟")));
  assert.equal(result.decision_assessment.status, "quality_review");
  assert.equal(result.recommendation.primary_product_id, null);
});

test("AG-001 distinguishes true missing data from a source-verification gap", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "对比灵鹞S3和绘界M5，最大作业海拔至少4000米，推荐哪个");
  const result = response.output.comparison;
  assert.ok(result.parameter_quality.missing_items.some((item) => item.product_id === "DEMO-S3" && item.field === "最大作业海拔"));
  const s3 = result.products.find((item) => item.id === "DEMO-S3");
  assert.equal(s3.constraint_checks.find((item) => item.label.includes("最大作业海拔"))?.determination, "needs_review");
  assert.equal(result.recommendation.primary_product_id, "DEMO-M5");
});

test("AG-001 stops when numeric requirements contradict each other", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "推荐无人机，续航至少50分钟，续航不超过40分钟");
  assert.equal(response.status, "needs_clarification");
  assert.match(response.output.summary, /相互冲突/);
  assert.equal(response.output.comparison, undefined);
});

test("AG-001 forms a grounded recommendation when one candidate clears every hard condition", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "用于山区电力巡检，预算20万元，载荷至少3公斤、抗风至少13米/秒，有合适型号吗？");
  const result = response.output.comparison;
  assert.equal(response.status, "completed");
  assert.equal(result.decision_assessment.status, "recommended");
  assert.equal(result.recommendation.primary_product_id, "DEMO-T60");
  assert.ok(result.products.find((item) => item.id === "DEMO-T60").constraint_checks.every((item) => item.determination === "passed"));
  assert.ok(result.recommendation.alternative_reasons.length >= 0);
});
