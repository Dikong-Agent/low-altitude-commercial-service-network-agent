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

async function invoke(worker, input, sessionId = `ag025-${crypto.randomUUID()}`) {
  const response = await worker.fetch(new Request("http://localhost/api/agents/AG-025/invoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent_id: "AG-025", input, session_id: sessionId, context: { as_of_date: "2026-08-17" } }),
  }), env, ctx);
  assert.equal(response.status, 200);
  return response.json();
}

test("AG-025 produces a complaint intake packet without claiming that the complaint was accepted", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "我要投诉订单 JDZ-DEMO-1001，昨天物流一直不更新，希望尽快退款，我有物流截图。", `complaint-${crypto.randomUUID()}`);
  const result = response.output.customer_service;
  assert.equal(response.status, "needs_review");
  assert.equal(result.intent.route, "human_handoff");
  assert.equal(result.service_guidance.category, "complaint");
  assert.ok(result.service_guidance.checklist.some((item) => item.item === "可核验材料" && item.status === "provided"));
  assert.equal(result.resolution_assessment.status, "requires_human");
  assert.equal(result.handoff.reason_code, "complaint");
  assert.ok(result.handoff.evidence_summary.length > 0);
  assert.ok(result.handoff.suggested_reply);
  assert.match(result.data_notice, /未执行.*立案|未执行.*人工转接/);
});

test("AG-025 explains the general financing process and identifies missing preparation materials", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "我们处于融资准备阶段，想了解融资流程和材料清单。已有营业执照、商业计划书和财务报表，还缺什么？");
  const result = response.output.customer_service;
  assert.equal(response.status, "needs_review");
  assert.equal(result.service_guidance.category, "finance");
  assert.ok(result.answer_coverage.answered_questions.includes("办理流程"));
  assert.ok(result.answer_coverage.answered_questions.includes("材料清单"));
  assert.ok(result.service_guidance.checklist.some((item) => item.item === "企业基本资料" && item.status === "provided"));
  assert.ok(result.service_guidance.checklist.some((item) => item.status === "missing"));
  assert.ok(result.knowledge_matches.every((item) => !item.id.startsWith("FAQ-CREDIT")));
  assert.match(result.answer, /专业人员|机构确认/);
  assert.ok(result.resolution_assessment.unresolved_reason_codes.includes("professional_judgment"));
});

test("AG-025 provides a credit application preparation checklist without making an approval decision", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "企业申请贷款一般怎么走流程？我有营业执照和银行流水，还需要哪些材料？");
  const result = response.output.customer_service;
  assert.equal(result.service_guidance.category, "credit");
  assert.ok(result.service_guidance.checklist.some((item) => item.item === "纳税或经营流水" && item.status === "provided"));
  assert.match(result.service_guidance.scope_notice, /不代表.*准入条件|不代表.*授信意见/);
  assert.match(result.answer, /审批结果|机构确认/);
});

test("AG-025 masks sensitive evidence and detects repeated communication-risk signals across turns", async () => {
  const worker = await loadWorker();
  const sessionId = `risk-${crypto.randomUUID()}`;
  const first = await invoke(worker, "对方让我加微信私下转账，还索要手机号 13812345678 和验证码。", sessionId);
  const firstResult = first.output.customer_service;
  assert.equal(firstResult.risk_review.review_required, true);
  assert.ok(firstResult.risk_review.signals.some((item) => item.type === "off_platform"));
  assert.ok(firstResult.risk_review.signals.some((item) => item.type === "personal_data"));
  assert.doesNotMatch(JSON.stringify(firstResult.risk_review), /13812345678/);
  assert.match(JSON.stringify(firstResult.risk_review), /138\*\*\*\*5678/);
  assert.equal(firstResult.risk_review.enforcement_execution, "not_performed");

  const second = await invoke(worker, "对方再次让我加微信私下交易。", sessionId);
  assert.equal(second.output.customer_service.risk_review.repeated_signal, true);
  assert.ok(second.output.customer_service.resolution_assessment.unresolved_reason_codes.includes("risk_review"));
});

test("AG-025 records negative user feedback as an unresolved-service signal", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "之前的答复还是没解决，我要投诉并转人工。", `feedback-${crypto.randomUUID()}`);
  const result = response.output.customer_service;
  assert.equal(result.resolution_assessment.user_feedback, "negative");
  assert.equal(result.resolution_assessment.status, "requires_human");
  assert.ok(result.resolution_assessment.unresolved_reason_codes.includes("complaint_handling"));
});
