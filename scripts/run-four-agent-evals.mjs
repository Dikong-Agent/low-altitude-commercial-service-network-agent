import { isDeepStrictEqual } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dataset = JSON.parse(await readFile(new URL("evals/four-agent-golden-cases.json", root), "utf8"));
const workerUrl = new URL("dist/server/index.js", root);
workerUrl.searchParams.set("four-agent-eval", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

function atPath(value, path) { return path.split(".").reduce((current, key) => current?.[key], value); }
function printable(value) { return typeof value === "string" ? value : JSON.stringify(value); }
function evaluate(definition, httpStatus, body) {
  const failures = []; const expected = definition.expect;
  if (httpStatus !== expected.http_status) failures.push(`HTTP状态期望${expected.http_status}，实际${httpStatus}`);
  if (body?.agent_id !== definition.agent_id) failures.push(`Agent标识不一致：${printable(body?.agent_id)}`);
  if (body?.environment !== "demo") failures.push(`评测环境必须为demo，实际${printable(body?.environment)}`);
  if (body?.status !== expected.response_status) failures.push(`业务状态期望${expected.response_status}，实际${printable(body?.status)}`);
  if (!/^TRC-/.test(body?.trace_id ?? "")) failures.push("缺少有效trace_id");
  if (expected.review_request && !/^RVW-/.test(body?.output?.review_request?.review_id ?? "")) failures.push("需要复核的结果未创建正式复核任务");
  for (const [path, value] of Object.entries(expected.path_equals ?? {})) if (!isDeepStrictEqual(atPath(body, path), value)) failures.push(`${path}期望${printable(value)}，实际${printable(atPath(body, path))}`);
  for (const path of expected.path_absent ?? []) if (atPath(body, path) !== undefined) failures.push(`${path}应为空或不存在`);
  for (const [path, minimum] of Object.entries(expected.path_min_length ?? {})) { const actual = atPath(body, path); if (actual == null || typeof actual.length !== "number" || actual.length < minimum) failures.push(`${path}长度应不小于${minimum}`); }
  for (const [path, pattern] of Object.entries(expected.path_matches ?? {})) if (!new RegExp(pattern).test(printable(atPath(body, path)))) failures.push(`${path}未匹配/${pattern}/`);
  for (const [path, pattern] of Object.entries(expected.path_not_matches ?? {})) if (new RegExp(pattern).test(printable(atPath(body, path)))) failures.push(`${path}不应匹配/${pattern}/`);
  for (const assertion of expected.array_some ?? []) { const array = atPath(body, assertion.path); if (!Array.isArray(array) || !array.some((item) => isDeepStrictEqual(atPath(item, assertion.field), assertion.equals))) failures.push(`${assertion.path}中未找到${assertion.field}=${printable(assertion.equals)}`); }
  return failures;
}

const results = [];
for (const definition of dataset.cases) {
  const payload = { agent_id: definition.agent_id, input: definition.input, ...(definition.context ? { context: definition.context } : {}) };
  const response = await worker.fetch(new Request(`http://localhost/api/agents/${definition.agent_id}/invoke`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), env, ctx);
  let body; try { body = await response.json(); } catch { body = undefined; }
  const failures = evaluate(definition, response.status, body);
  results.push({ id: definition.id, agent_id: definition.agent_id, category: definition.category, passed: failures.length === 0, trace_id: body?.trace_id ?? null, review_id: body?.output?.review_request?.review_id ?? null, failures });
}
const passed = results.filter((item) => item.passed).length;
const report = { schema_version: "1.0", baseline: dataset.baseline, evaluated_at: new Date().toISOString(), environment: "demo", source: "evals/four-agent-golden-cases.json", total: results.length, passed, failed: results.length - passed, results, boundary: dataset.description };
await mkdir(new URL("reports/", root), { recursive: true });
await writeFile(new URL("reports/four-agent-evaluation-report.json", root), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`四Agent黄金评测：${passed}/${results.length}通过`);
for (const item of results.filter((result) => !result.passed)) console.error(`${item.id}: ${item.failures.join("；")}`);
if (report.failed) process.exitCode = 1;
