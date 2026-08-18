import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("ag012-depth", `${process.pid}-${Date.now()}-${crypto.randomUUID()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function invoke(worker, input, context = { as_of_date: "2026-08-17" }) {
  const response = await worker.fetch(new Request("http://localhost/api/agents/AG-012/invoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent_id: "AG-012", input, context }),
  }), env, ctx);
  assert.equal(response.status, 200);
  return response.json();
}

test("AG-012 turns official flight clauses into requirements, verification steps and source links", async () => {
  const response = await invoke(await loadWorker(), "根据《无人驾驶航空器飞行管理暂行条例》第十九条、第二十六条和第二十七条，物流企业在景德镇开展低空配送前需要核对哪些事项？");
  const policy = response.output.policy;
  assert.equal(response.status, "needs_review");
  assert.equal(policy.evidence_assessment.status, "partial");
  assert.deepEqual(policy.evidence_assessment.missing_referenced_locators, ["第三十一条"]);
  assert.deepEqual(new Set(policy.requirement_items.map((item) => item.kind)), new Set(["airspace_restriction", "application_timing", "application_materials"]));
  assert.ok(policy.verification_steps.length >= 5);
  assert.ok(policy.verification_steps.some((item) => item.action.includes("第三十一条") && item.external_confirmation));
  assert.ok(policy.verification_steps.some((item) => item.action.includes("景德镇市") && item.external_confirmation));
  assert.ok(policy.citations.every((item) => item.source_url === "https://www.gov.cn/zhengce/content/202306/content_6888799.htm"));
});

test("AG-012 keeps a focused registration question free of unrelated application clauses", async () => {
  const response = await invoke(await loadWorker(), "根据《无人驾驶航空器飞行管理暂行条例》，实名登记有哪些要求？");
  const policy = response.output.policy;
  assert.equal(response.status, "completed");
  assert.equal(policy.evidence_assessment.status, "sufficient");
  assert.deepEqual(policy.requirement_items.map((item) => item.kind), ["registration"]);
  assert.deepEqual(policy.citations.map((item) => item.locator), ["第十条"]);
  assert.equal(policy.citations[0].source_url, "https://www.gov.cn/zhengce/content/202306/content_6888799.htm");
});

test("AG-012 compares one governed version chain and preserves the recorded changes", async () => {
  const response = await invoke(await loadWorker(), "比较样例低空政策2025试行版和2026修订稿的主要变化");
  const policy = response.output.policy;
  assert.equal(response.status, "completed");
  assert.equal(policy.current_version.version, "2026修订稿");
  assert.equal(policy.changes.length, 4);
  assert.ok(policy.changes.some((item) => item.topic === "活动报备"));
  assert.ok(policy.changes.some((item) => item.topic === "运行记录"));
  assert.ok(policy.documents.some((item) => item.effective_status === "expired"));
});

test("AG-012 refuses to infer a requested clause that is absent from the governed excerpt", async () => {
  const response = await invoke(await loadWorker(), "根据《无人驾驶航空器飞行管理暂行条例》第三十一条，哪些情形可以免于申请？");
  assert.equal(response.status, "needs_clarification");
  assert.equal(response.output.policy, undefined);
  assert.match(response.output.summary, /第三十一条/);
  assert.match(response.output.summary, /不能使用邻近条款替代/);
});

test("AG-012 retains the airworthiness stop boundary without authoritative material", async () => {
  const response = await invoke(await loadWorker(), "云巡X8是否已经取得适航证，可以直接用于商业物流吗？");
  assert.equal(response.status, "needs_review");
  assert.equal(response.output.policy, undefined);
  assert.match(response.output.title, /适航结论暂需权威资料与专业确认/);
  assert.match(response.output.summary, /尚未接入权威适航资料/);
});
