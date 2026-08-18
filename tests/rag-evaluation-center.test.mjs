import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeRagEvaluation } from "../app/lib/rag-evaluation/evaluator.ts";
import { getEvaluationDashboard, resetEvaluationStoreForTests, runEvaluation, setEvaluationBaseline } from "../app/lib/rag-evaluation/store.ts";

test("third-stage evaluator runs 200 versioned cases and enforces every public gate", async () => {
  const run = await executeRagEvaluation();
  assert.equal(run.totalCases, 200); assert.equal(run.passedCases, 200); assert.equal(run.gateStatus, "passed");
  assert.equal(run.metrics.length, 11); assert.ok(run.metrics.every((metric) => metric.passed));
  assert.equal(run.agents.length, 4); assert.ok(run.agents.every((agent) => agent.cases === 50 && agent.passedCases === 50 && agent.specialGatePassed));
  assert.equal(run.categories.length, 10); assert.ok(run.categories.every((category) => category.cases === 20 && category.passRate === 1));
  assert.equal(run.failures.length, 0); assert.match(run.boundary, /不代表甲方正式知识/);
});

test("evaluation metrics cover retrieval, generation, timeliness, ACL and sensitive-action safety", async () => {
  const run = await executeRagEvaluation(); const metrics = Object.fromEntries(run.metrics.map((metric) => [metric.id, metric]));
  for (const id of ["recall_at_20", "ndcg_at_10", "citation_coverage", "citation_accuracy", "faithfulness", "abstention", "hard_constraint", "invalid_misuse", "acl_leak", "sensitive_action", "latency_p95"]) assert.ok(metrics[id], `missing ${id}`);
  assert.equal(metrics.acl_leak.value, 0); assert.equal(metrics.invalid_misuse.value, 0); assert.equal(metrics.sensitive_action.value, 0);
  assert.ok(metrics.citation_accuracy.value >= 0.98); assert.ok(metrics.faithfulness.value >= 0.95);
});

test("evaluation history supports immutable runs, comparisons and an approved baseline", async () => {
  resetEvaluationStoreForTests(); const initial = await getEvaluationDashboard();
  assert.equal(initial.runs.length, 1); assert.equal(initial.current.baseline, true); assert.equal(initial.dataset.totalCases, 200);
  const second = await runEvaluation(); assert.equal(second.baseline, false);
  const updated = await getEvaluationDashboard(); assert.equal(updated.runs.length, 2); assert.equal(updated.comparison.length, 11);
  await setEvaluationBaseline(second.id); const final = await getEvaluationDashboard();
  assert.equal(final.baseline.id, second.id); assert.equal(final.runs.filter((run) => run.baseline).length, 1);
});

test("evaluation center exposes gates, agents, failures, versions and operations without overclaiming", async () => {
  const page = await readFile(new URL("../app/evaluation-center/page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/rag-evaluation/route.ts", import.meta.url), "utf8");
  for (const label of ["质量总览", "共性质量指标", "分智能体评测", "问题样本分析", "版本与基线", "运行监控", "运行完整评测", "设为基线"]) assert.match(page, new RegExp(label));
  assert.match(page, /正式验收仍需甲方授权数据、接口和业务专家确认/); assert.match(route, /evaluator/); assert.match(route, /loopback/);
});

test("evaluation persistence migration and documentation are present", async () => {
  const migration = await readFile(new URL("../db/migrations/0006_rag_evaluation_snapshots.sql", import.meta.url), "utf8");
  const operations = await readFile(new URL("../docs/RAG_EVALUATION_OPERATIONS.md", import.meta.url), "utf8");
  assert.match(migration, /rag_evaluation_snapshots/); assert.match(migration, /PRIMARY KEY/);
  assert.match(operations, /200题/); assert.match(operations, /正式知识接入后/); assert.match(operations, /不说明甲方正式数据/);
});
