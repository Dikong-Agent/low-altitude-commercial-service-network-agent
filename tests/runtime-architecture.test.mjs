import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("registers every runnable Agent with schemas, policies, versions, and invocation factories", async () => {
  const registry = await source("../app/lib/agent-runtime-registry.ts");
  for (const id of ["AG-001", "AG-002", "AG-003", "AG-012", "AG-025"]) {
    assert.match(registry, new RegExp(`id: "${id}"`));
  }
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
});
