import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("ag027-depth", `${process.pid}-${Date.now()}-${crypto.randomUUID()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
async function invoke(worker, input, sessionId = `ag027-${crypto.randomUUID()}`) {
  const response = await worker.fetch(new Request("http://localhost/api/agents/AG-027/invoke", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent_id: "AG-027", input, session_id: sessionId }),
  }), env, ctx);
  assert.equal(response.status, 200);
  return response.json();
}

test("AG-027 executes an 8-week comparison, category drill-down and chart plan", async () => {
  const response = await invoke(await loadWorker(), "分析近8周B2C成交额趋势，按品类分解并与前8周比较");
  const analysis = response.output.data_analysis;
  assert.equal(response.status, "completed");
  assert.equal(analysis.metric.metric_id, "M-DEMO-GMV-B2C");
  assert.equal(analysis.query_scope.comparison_mode, "period_over_period");
  assert.equal(analysis.query_plan.status, "executed");
  assert.equal(analysis.chart.series[0].points.length, 8);
  assert.equal(analysis.chart.series[1].points.length, 8);
  assert.equal(analysis.breakdown.length, 3);
  assert.ok(analysis.comparison.change_rate > 0);
  assert.ok(analysis.lineage.length >= 3);
  assert.ok(response.trace.some((item) => item.name === "执行指标查询计划"));
});

test("AG-027 clarifies an ambiguous metric before querying data", async () => {
  const response = await invoke(await loadWorker(), "查询转化率");
  const analysis = response.output.data_analysis;
  assert.equal(response.status, "needs_clarification");
  assert.equal(analysis.query_plan.status, "clarification_required");
  assert.deepEqual(analysis.clarification.options.map((item) => item.label), ["订单转化率", "线索转化率"]);
  assert.equal(analysis.observations.length, 0);
  assert.match(analysis.warnings[0], /未向数据端发起/);
});

test("AG-027 reuses metric context in a follow-up drill-down", async () => {
  const worker = await loadWorker(); const sessionId = `ag027-followup-${crypto.randomUUID()}`;
  const first = await invoke(worker, "分析近8周B2C成交额趋势", sessionId);
  assert.equal(first.status, "completed");
  const second = await invoke(worker, "再按品类分解，并与前8周比较", sessionId);
  const analysis = second.output.data_analysis;
  assert.equal(second.status, "completed");
  assert.equal(analysis.metric.metric_id, "M-DEMO-GMV-B2C");
  assert.equal(analysis.conversation.turn_count, 2);
  assert.equal(analysis.conversation.prior_context_used, true);
  assert.equal(analysis.breakdown.length, 3);
  assert.equal(analysis.query_scope.comparison_mode, "period_over_period");
  assert.ok(second.trace.some((item) => item.name === "加载分析会话"));
  assert.ok(second.trace.some((item) => item.name === "保存分析会话"));
});

test("AG-027 returns a truthful empty result instead of inventing a trend", async () => {
  const response = await invoke(await loadWorker(), "分析近8周退款率无数据的范围");
  const analysis = response.output.data_analysis;
  assert.equal(response.status, "completed");
  assert.equal(analysis.observations.length, 0);
  assert.equal(analysis.chart, null);
  assert.equal(analysis.insights.length, 0);
  assert.ok(analysis.next_questions.length >= 2);
  assert.match(analysis.result.summary, /未查到可用数据/);
});

test("AG-027 gates poor quality, causal claims, restricted detail and business execution", async () => {
  const worker = await loadWorker();
  const quality = await invoke(worker, "分析近8周B2C成交额，当前数据质量不足且完整率偏低");
  assert.equal(quality.status, "needs_review");
  assert.equal(quality.output.data_analysis.quality.status, "failed");
  const boundary = await invoke(worker, "认定某活动导致B2C成交额增长并自动调价");
  assert.equal(boundary.status, "needs_review");
  assert.equal(boundary.output.data_analysis.result.business_action_execution, "not_performed");
  assert.ok(boundary.output.data_analysis.warnings.some((item) => /不能直接形成因果/.test(item)));
  assert.ok(boundary.output.data_analysis.warnings.some((item) => /未调价/.test(item)));
  const restricted = await invoke(worker, "查询退款率并按客户明细下钻，返回手机号");
  assert.equal(restricted.status, "needs_review");
  assert.ok(!restricted.output.data_analysis.query_scope.dimensions.includes("客户"));
  assert.ok(restricted.output.data_analysis.warnings.some((item) => /未返回客户/.test(item)));
});
