import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { defineAgentModule } from "../app/lib/agent-sdk/index.ts";
import { AgentInvokeRequestSchema, AgentInvokeResponseSchema } from "../app/lib/contracts.ts";
import { getHumanReview, resolveHumanReview, submitHumanReview } from "../app/lib/human-review.ts";
import { getAgentRuntimeSnapshot, recordAgentRun, resetAgentRuntimeSnapshotForTests } from "../app/lib/observability.ts";
import { cancelAgentTask, TaskCancellationError } from "../app/lib/task-control.ts";
import { runWithRuntimeBindings } from "../app/lib/runtime-bindings.ts";
import { HumanReviewCallbackSchema, HumanReviewSubmissionSchema, R0_FOUNDATION_VERSION } from "../app/lib/r0/contracts.ts";
import { r0OpenApiDocument } from "../app/lib/r0/openapi.ts";

const identity = { source: "trusted-gateway", tenantId: "tenant-r0", subjectId: "user-r0", roles: ["agent-user"] };
const reviewerIdentity = { source: "trusted-gateway", tenantId: "tenant-r0", subjectId: "reviewer-r0", roles: ["human-reviewer"] };

test("R0 defines and validates the common Agent module boundary", () => {
  const definition = defineAgentModule({
    id: "AG-001", requestSchema: AgentInvokeRequestSchema, responseSchema: AgentInvokeResponseSchema,
    accessPolicy: { productionRequiresTrustedIdentity: true, requiredAnyRole: ["agent-user"] },
    timeoutPolicy: { totalTimeoutMs: 10_000, maxSynchronousMs: 5_000 }, executionMode: "synchronous",
    versions: { capability: "1", workflow: "1", prompt: "1", rule: "1", model: "upstream-managed" },
    async invoke() { throw new Error("not invoked by contract test"); },
  });
  assert.equal(definition.id, "AG-001");
  assert.ok(Object.isFrozen(definition));
  assert.throws(() => defineAgentModule({ ...definition, timeoutPolicy: { totalTimeoutMs: 1, maxSynchronousMs: 2 } }));
});

test("R0 OpenAPI exposes the seven public interface families", () => {
  const document = r0OpenApiDocument("https://runtime.test");
  assert.equal(document.info.version, R0_FOUNDATION_VERSION);
  for (const path of ["/v1/agents/{agentId}/invoke", "/v1/agents/{agentId}/tasks", "/v1/tasks/{taskId}", "/v1/tasks/{taskId}/cancel", "/v1/reviews", "/v1/reviews/{reviewId}/callback"]) assert.ok(path in document.paths, path);
  assert.match(document["x-jdz-boundary"], /业务Agent应用层/);
});

test("human review lifecycle is tenant scoped, validated and idempotent in demo mode", async () => {
  const previous = process.env.AGENT_RUNTIME_MODE; process.env.AGENT_RUNTIME_MODE = "demo";
  try {
    const request = HumanReviewSubmissionSchema.parse({ agent_id: "AG-001", trace_id: "TRC-R0-001", reason: "涉及重要业务选择，需要人工确认", evidence: ["MOCK-EVIDENCE-001"] });
    const created = await submitHumanReview(request, identity);
    assert.equal(created.status, "pending");
    assert.equal((await getHumanReview(created.review_id, identity))?.trace_id, "TRC-R0-001");
    assert.equal(await getHumanReview(created.review_id, { ...identity, subjectId: "other" }), null);
    const callback = HumanReviewCallbackSchema.parse({ decision: "approved", reviewer_id: "reviewer-r0", comment: "测试通过", decided_at: new Date().toISOString(), evidence: [] });
    await assert.rejects(resolveHumanReview(created.review_id, callback, identity));
    const resolved = await resolveHumanReview(created.review_id, callback, reviewerIdentity);
    assert.equal(resolved.status, "approved");
    assert.deepEqual(await resolveHumanReview(created.review_id, callback, reviewerIdentity), resolved);
  } finally { if (previous === undefined) delete process.env.AGENT_RUNTIME_MODE; else process.env.AGENT_RUNTIME_MODE = previous; }
});

test("queued tasks can be cancelled but processing tasks cannot be falsely reported as cancelled", async () => {
  const rows = new Map([["TSK-R0-QUEUED", "queued"], ["TSK-R0-RUNNING", "processing"]]);
  const db = { prepare(sql) { let values = []; return { bind(...next) { values = next; return this; }, async first() { return rows.has(values[0]) ? { task_id: values[0], state: rows.get(values[0]) } : null; }, async run() { if (/SET state = 'cancelled'/.test(sql) && rows.get(values[1]) === "queued") { rows.set(values[1], "cancelled"); return { success: true, meta: { changes: 1 } }; } return { success: true, meta: { changes: 0 } }; } }; }, async batch() { return []; } };
  const cancelled = await runWithRuntimeBindings({ DB: db }, () => cancelAgentTask("TSK-R0-QUEUED", identity));
  assert.equal(cancelled?.state, "cancelled");
  await assert.rejects(runWithRuntimeBindings({ DB: db }, () => cancelAgentTask("TSK-R0-RUNNING", identity)), TaskCancellationError);
});

test("runtime snapshot keeps bounded sanitized evidence for the development center", () => {
  resetAgentRuntimeSnapshotForTests();
  recordAgentRun({ traceId: "TRC-R0-SNAPSHOT", requestId: "REQ-R0", agentId: "AG-001", status: "completed", durationMs: 12, internalTrace: [{ name: "private", detail: "must not leak" }] });
  const snapshot = getAgentRuntimeSnapshot();
  assert.equal(snapshot.metrics.total, 1);
  assert.equal(snapshot.runs[0].traceId, "TRC-R0-SNAPSHOT");
  assert.ok(!("internalTrace" in snapshot.runs[0]));
});

test("independent runtime and development pages expose R0 contracts", async () => {
  const worker = await readFile(new URL("../worker/agent-runtime.ts", import.meta.url), "utf8");
  for (const marker of ["/openapi.json", "handleAgentTaskCreation", "handleAgentTaskCancellation", "handleHumanReviewSubmission", "handleHumanReviewCallback"]) assert.match(worker, new RegExp(marker.replaceAll("/", "\\/")));
  const runtimePage = await readFile(new URL("../app/runtime-center/page.tsx", import.meta.url), "utf8");
  assert.match(runtimePage, /七类接口按同一规范接入/);
  for (const file of ["types.ts.template", "config.ts.template", "providers.ts.template", "adapters.ts.template", "workflow.ts.template", "tests.test.mjs.template", "evals.json.template"]) await readFile(new URL(`../templates/agent-module/${file}`, import.meta.url), "utf8");
});
