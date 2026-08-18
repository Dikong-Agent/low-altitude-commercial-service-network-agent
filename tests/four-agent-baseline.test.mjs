import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const agentIds = ["AG-001", "AG-012", "AG-025", "AG-027"];

test("four-Agent golden baseline covers the retained engineering examples", async () => {
  const dataset = JSON.parse(await readFile(new URL("../evals/four-agent-golden-cases.json", import.meta.url), "utf8"));
  assert.equal(dataset.baseline, "FOUR-AGENT-20260817");
  assert.equal(new Set(dataset.cases.map((item) => item.id)).size, dataset.cases.length);
  assert.deepEqual([...new Set(dataset.cases.map((item) => item.agent_id))].sort(), agentIds);
  for (const agentId of agentIds) assert.ok(dataset.cases.filter((item) => item.agent_id === agentId).length >= 2, `${agentId}至少需要2个代表性黄金用例`);
  for (const category of ["normal", "no_data", "conflict", "high_risk", "data_quality", "causal_boundary", "permission"]) assert.ok(dataset.cases.some((item) => item.category === category), `缺少${category}类别`);
  for (const item of dataset.cases.filter((item) => item.expect.response_status === "needs_review")) assert.equal(item.expect.review_request, true, `${item.id}必须验收复核任务`);
});
