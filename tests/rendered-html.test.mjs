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

test("renders the Agent capability showroom", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /AI Agent 能力展厅/);
  assert.match(html, /五种模式，一套底座/);
  assert.match(html, /AG-001/);
  assert.match(html, /AG-025/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("exposes the reserved Agent interface", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/agents/AG-012/invoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent_id: "AG-012", input: "演示政策解读" }),
  }), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.agent_id, "AG-012");
  assert.equal(body.environment, "demo");
  assert.ok(body.output.evidence.length > 0);
  assert.ok(body.trace.length > 0);
});
