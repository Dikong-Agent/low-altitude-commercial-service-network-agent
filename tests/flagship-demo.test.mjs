import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getEvaluationDashboard, resetEvaluationStoreForTests } from "../app/lib/rag-evaluation/store.ts";
import { FORMAL_KNOWLEDGE_CATALOG } from "../app/lib/rag/index.ts";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${crypto.randomUUID()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
async function invoke(worker, agentId, body) {
  const response = await worker.fetch(new Request(`http://localhost/api/agents/${agentId}/invoke`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), env, ctx);
  assert.equal(response.status, 200);
  return response.json();
}

test("AG-012 retrieves the verified State Council regulation with an auditable trace", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-012", {
    agent_id: "AG-012",
    input: "根据《无人驾驶航空器飞行管理暂行条例》，实名登记和飞行活动申请有哪些要求？",
    context: { as_of_date: "2026-08-14" },
  });
  const policy = response.output.policy;
  assert.equal(response.status, "needs_review");
  assert.ok(policy);
  assert.equal(policy.documents[0]?.id, "OFFICIAL-UAS-REG-2023");
  assert.ok(policy.citations.length >= 2);
  assert.ok(policy.citations.every((item) => item.document_id === "OFFICIAL-UAS-REG-2023"));
  assert.ok(policy.citations.every((item) => item.source_url?.startsWith("https://www.gov.cn/")));
  assert.ok(policy.requirement_items.some((item) => item.kind === "registration"));
  assert.ok(policy.requirement_items.some((item) => item.kind === "application_timing"));
  assert.deepEqual(policy.evidence_assessment.missing_referenced_locators, ["第三十一条"]);
  assert.ok(policy.verification_steps.some((item) => item.action.includes("第三十一条") && item.external_confirmation));
  assert.match(policy.data_notice, /国务院官网|官方/);
  assert.ok(response.trace.some((item) => item.name === "检索并整理依据"));
  assert.ok(response.trace.some((item) => item.name === "核验版本与时效"));
});

test("official AG-012 records have one governed catalog identity and verified public URL", () => {
  const document = FORMAL_KNOWLEDGE_CATALOG.documents.find((item) => item.knowledge_id === "KB-AG012-0004");
  assert.ok(document);
  assert.match(document.document_uri, /^https:\/\/www\.gov\.cn\//);
  assert.equal(document.record_ids.length, 5);
  assert.match(document.source_nature, /国务院官网/);
});

test("AG-025 reuses trusted session context and exposes the real workflow trace", async () => {
  const worker = await loadWorker();
  const session_id = `flagship-${crypto.randomUUID()}`;
  const first = await invoke(worker, "AG-025", { agent_id: "AG-025", input: "查询订单 JDZ-DEMO-1001 的物流进度", session_id });
  assert.equal(first.status, "completed");
  const second = await invoke(worker, "AG-025", { agent_id: "AG-025", input: "它现在到哪了？", session_id });
  assert.equal(second.status, "completed");
  assert.equal(second.output.customer_service.intent.route, "knowledge_answer");
  assert.equal(second.output.customer_service.intent.specialist_agent_id, null);
  assert.equal(second.output.customer_service.order_assessment.freshness, "stale");
  assert.equal(second.output.customer_service.intent.prior_context_used, true);
  assert.equal(second.output.customer_service.conversation.turn_count, 2);
  for (const node of ["加载会话上下文", "查询知识与业务数据", "整理答复依据", "保存会话摘要"]) {
    assert.ok(second.trace.some((item) => item.name === node), `missing workflow node: ${node}`);
  }
});

test("AG-025 performs an actual AG-001 collaboration instead of returning a routing suggestion", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-025", {
    agent_id: "AG-025",
    input: "我想购买巡检无人机，但不知道应该从哪里开始选",
    session_id: `specialist-${crypto.randomUUID()}`,
  });
  const customerService = response.output.customer_service;
  assert.equal(customerService.intent.route, "specialist_agent");
  assert.equal(customerService.specialist_collaboration?.agent_id, "AG-001");
  assert.ok(customerService.tool_results.some((item) => item.tool === "agent_collaboration"));
  assert.ok(response.trace.some((item) => item.name === "转交专业业务Agent"));
  assert.match(customerService.answer, /已协同 AG-001/);
});

test("evaluation dashboard separates engineering, online sampling and formal acceptance", async () => {
  resetEvaluationStoreForTests();
  const dashboard = await getEvaluationDashboard();
  assert.equal(dashboard.evaluationLayers.engineering.cases, 200);
  assert.equal(dashboard.evaluationLayers.online.sampleCount, 4);
  assert.equal(dashboard.evaluationLayers.online.citationCoverage, 1);
  assert.ok(dashboard.evaluationLayers.online.minimumGroundingSupport < 0.95);
  assert.equal(dashboard.evaluationLayers.formal.completed, 1);
  assert.equal(dashboard.evaluationLayers.formal.total, 5);
  assert.deepEqual(dashboard.remediation.workflow, ["定位责任环节", "关联修复版本", "全量回归", "复测关闭"]);
});

test("experience page renders actual execution traces for the flagship Agents", async () => {
  const source = await readFile(new URL("../app/experience/page.tsx", import.meta.url), "utf8");
  assert.match(source, /ActualExecutionPanel/);
  assert.match(source, /LiveTracePanel/);
  assert.match(source, /response\.trace/);
  assert.match(source, /国务院官网/);
  assert.match(source, /需求功能已关联/);
  assert.match(source, /DataAnalysisPanel/);
  assert.match(source, /response\.output\.data_analysis/);
  assert.match(source, /output\.data_analysis\?\.rag_runtime/);
});

test("AG-027 exposes metric semantics, data quality and non-causal analysis boundaries", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-027", {
    agent_id: "AG-027",
    input: "分析退款率异常",
  });
  const analysis = response.output.data_analysis;
  assert.equal(response.status, "needs_review");
  assert.equal(analysis.metric.name, "退款率");
  assert.ok(analysis.anomaly_signals.length > 0);
  assert.ok(analysis.hypotheses_to_verify.length > 0);
  assert.equal(analysis.result.business_action_execution, "not_performed");
  assert.ok(["completed", "evidence_only"].includes(analysis.rag_runtime.status));
  assert.ok(analysis.rag_runtime.evidence.some((item) => item.knowledge_id.startsWith("KB-AG027-")));
  assert.ok(response.trace.some((item) => item.name === "理解分析问题"));
  assert.ok(response.trace.some((item) => item.name === "检索指标治理知识"));
  assert.ok(response.trace.some((item) => item.name === "生成分析结果"));
});
