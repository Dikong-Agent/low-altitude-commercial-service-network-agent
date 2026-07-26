import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function invoke(worker, agentId, input) {
  return invokeBody(worker, agentId, { agent_id: agentId, input });
}

async function invokeBody(worker, agentId, body) {
  return worker.fetch(new Request(`http://localhost/api/agents/${agentId}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env, ctx);
}

test("renders the Agent capability showroom", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /AI Agent 能力展厅/);
  assert.match(html, /五种模式，一套底座/);
  assert.match(html, /AG-001/);
  assert.match(html, /AG-025/);
  assert.match(html, /V1\.2/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("exposes the reserved Agent interface", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-012", "演示政策解读");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.agent_id, "AG-012");
  assert.equal(body.environment, "demo");
  assert.equal(body.status, "preview");
  assert.match(body.trace_id, /^TRC-/);
  assert.ok(body.output.evidence.length > 0);
  assert.ok(body.trace.length > 0);
});

test("runs AG-001 through the LangGraph comparison workflow", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "对比云巡 X8 和山岳 T60，重点看续航、载荷和抗风能力");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-agent-engine"), "langgraph-demo");
  const body = await response.json();
  assert.equal(response.headers.get("x-trace-id"), body.trace_id);
  assert.equal(body.status, "completed");
  assert.equal(body.output.comparison.engine, "langgraph-demo");
  assert.equal(body.output.comparison.products.length, 2);
  assert.ok(body.output.comparison.table.length >= 8);
  const productOrder = body.output.comparison.products.map((item) => item.id);
  assert.ok(body.output.comparison.table.every((row) => row.values.map((item) => item.product_id).join(",") === productOrder.join(",")));
  assert.ok(body.output.comparison.recommendation.primary_product_id);
  assert.ok(body.output.evidence.every((item) => /Mock|规则/.test(item)));
  assert.ok(body.trace.length >= 5);
});

test("AG-001 rejects forced recommendations when hard constraints conflict", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "对比云巡 X8 和山岳 T60，续航至少80分钟");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_review");
  assert.equal(body.output.comparison.recommendation.primary_product_id, null);
  assert.ok(body.output.comparison.conflicts.length >= 3);
});

test("AG-001 asks for clarification on an unusable input", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "你好");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_clarification");
  assert.equal(body.output.comparison, undefined);
});

test("serves the AG-001 mock product catalog through BusinessDataPort", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/data/products?scenario=%E5%9B%AD%E5%8C%BA%E5%B7%A1%E6%A3%80"), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.environment, "demo");
  assert.equal(body.connector.status, "mock-active");
  assert.ok(body.items.length >= 2);
  assert.ok(body.items.every((item) => item.name.startsWith("样例·")));
});

test("AG-001 evaluates hard constraints before limiting candidates", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "载荷至少5公斤，推荐哪个型号");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.equal(body.output.comparison.recommendation.primary_product_id, "DEMO-R6");
  assert.ok(body.output.comparison.products.some((item) => item.id === "DEMO-R6"));
});

test("AG-001 requests a second model for direct single-model comparisons", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "对比云巡 X8");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_clarification");
  assert.match(body.output.summary, /至少补充另一个型号/);
});

test("AG-001 preserves compound business scenarios", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "用于山区电力巡检，载荷至少3公斤、抗风至少13米/秒，有合适型号吗？");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.output.comparison.intent.use_cases, ["山区巡检", "电力巡检"]);
});

test("AG-001 asks for the unit when a budget is ambiguous", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "预算20，用于园区巡检，推荐哪个型号？");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_clarification");
  assert.match(body.output.summary, /缺少单位/);
});

test("rejects null and malformed Agent request objects with 400", async () => {
  const worker = await loadWorker();
  const nullResponse = await invokeBody(worker, "AG-001", null);
  assert.equal(nullResponse.status, 400);
  const nullBody = await nullResponse.json();
  assert.equal(nullBody.code, "INVALID_AGENT_REQUEST");

  const sessionResponse = await invokeBody(worker, "AG-001", { agent_id: "AG-001", input: "对比 X8 和 T60", session_id: "same" });
  assert.equal(sessionResponse.status, 400);
});

test("rejects oversized Agent requests", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", `对比${"A".repeat(21_000)}`);
  assert.equal(response.status, 413);
  const body = await response.json();
  assert.equal(body.code, "REQUEST_TOO_LARGE");
});

test("returns 404 for unknown business data resources", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/data/unknown"), env, ctx);
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.code, "DATA_RESOURCE_NOT_FOUND");
});
