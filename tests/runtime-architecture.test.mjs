import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("registers every runnable Agent with schemas, policies, versions, and invocation factories", async () => {
  const registry = await source("../app/lib/agent-runtime-registry.ts");
  for (const symbol of ["ag001Module", "ag012Module", "ag025Module", "ag027Module"]) assert.match(registry, new RegExp(symbol));
  for (const symbol of ["ag002Module", "ag003Module", "ag004Module", "ag006Module", "ag016Module", "ag023Module", "ag028Module"]) assert.doesNotMatch(registry, new RegExp(symbol));
  assert.match(registry, /only these[\s\S]*four engineering examples are deployable/);
  assert.match(registry, /requestSchema:/);
  assert.match(registry, /responseSchema:/);
  assert.match(registry, /accessPolicy:/);
  assert.match(registry, /timeoutPolicy:/);
  assert.match(registry, /executionMode:/);
  assert.match(registry, /versions:/);
  assert.match(registry, /invoke:/);
});

test("the invocation route delegates to the runtime registry instead of branching by Agent", async () => {
  const route = await source("../app/api/agents/[agentId]/invoke/route.ts");
  const handler = await source("../app/lib/agent-runtime-handler.ts");
  assert.match(route, /handleAgentInvocation/);
  assert.match(handler, /getRuntimeAgentDefinition/);
  assert.doesNotMatch(route, /invokeAg00|agent\.id ===/);
});

test("separates customer processing steps from internal trace details", async () => {
  const observability = await source("../app/lib/observability.ts");
  const contracts = await source("../app/lib/contracts.ts");
  assert.match(observability, /processingSteps/);
  assert.match(observability, /exposeInternalTrace/);
  assert.match(observability, /trace: undefined/);
  assert.match(contracts, /processing_steps:/);
});

test("requires approval and idempotency before business action execution", async () => {
  const ports = await source("../app/lib/runtime-ports.ts");
  assert.match(ports, /command\.mode === "execute"/);
  assert.match(ports, /command\.approvalToken/);
  assert.match(ports, /command\.idempotencyKey/);
});

test("provides an independently deployable Agent Runtime surface", async () => {
  const worker = await source("../worker/agent-runtime.ts");
  assert.match(worker, /\/health\/live/);
  assert.match(worker, /\/health\/ready/);
  assert.match(worker, /\/v1\/agents/);
  assert.ok(worker.includes("\\/v1\\/tasks"));
  assert.ok(worker.includes("\\/v1\\/callbacks"));
  assert.match(worker, /async queue/);
  assert.match(worker, /assertProductionAuthConfiguration/);
  assert.match(worker, /assertProductionAdapterConfiguration/);
  assert.match(worker, /cleanupExpiredRuntimeState/);
});

test("locks showcase traceability to the current v2.14 function and source identifiers", async () => {
  const coverage = JSON.parse(await source("../app/lib/capability-coverage.json"));
  assert.deepEqual(Object.fromEntries(Object.entries(coverage).map(([agentId, items]) => [agentId, items.length])), {
    "AG-001": 12,
    "AG-002": 13,
    "AG-003": 50,
    "AG-004": 19,
    "AG-005": 7,
    "AG-006": 8,
    "AG-007": 13,
    "AG-008": 28,
    "AG-009": 20,
    "AG-010": 16,
    "AG-012": 66,
    "AG-013": 32,
    "AG-014": 3,
    "AG-015": 23,
    "AG-016": 8,
    "AG-017": 12,
    "AG-018": 36,
    "AG-019": 3,
    "AG-020": 16,
    "AG-023": 29,
    "AG-025": 56,
    "AG-026": 82,
    "AG-027": 50,
    "AG-028": 15,
  });
  for (const items of Object.values(coverage)) {
    assert.equal(new Set(items.map((item) => item.function_id)).size, items.length);
    assert.ok(items.every((item) => /^F-\d{4}$/.test(item.function_id)));
    assert.ok(items.every((item) => /^\d+$/.test(item.source_requirement_id)));
    assert.ok(items.every((item) => item.capability && !("requirement_id" in item)));
  }
});

test("hardens asynchronous work against conflicting keys and concurrent delivery", async () => {
  const asyncRuntime = await source("../app/lib/async-runtime.ts");
  assert.match(asyncRuntime, /request_hash/);
  assert.match(asyncRuntime, /AsyncTaskConflictError/);
  assert.match(asyncRuntime, /state IN \('queued', 'failed'\)/);
  assert.match(asyncRuntime, /attempt_count = attempt_count \+ 1/);
  assert.match(asyncRuntime, /state = 'failed'/);
});

test("signs control headers and persists one-time authentication nonces", async () => {
  const identity = await source("../app/lib/request-identity.ts");
  assert.match(identity, /idempotency-key/);
  assert.match(identity, /x-jdz-callback-id/);
  assert.match(identity, /auth_nonce_records/);
  assert.match(identity, /ON CONFLICT\(tenant_id, nonce\) DO NOTHING/);
});
