import assert from "node:assert/strict";
import test from "node:test";
import { DependencyUnavailableError, executeWithPolicy } from "../app/lib/reliability.ts";

test("retries an idempotent dependency call within the configured limit", async () => {
  let attempts = 0;
  const result = await executeWithPolicy("test.retry", {
    timeoutMs: 100,
    maxAttempts: 2,
    circuitFailureThreshold: 3,
    circuitResetMs: 100,
  }, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary failure");
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("times out and opens a dependency circuit after the configured threshold", async () => {
  let attempts = 0;
  const policy = {
    timeoutMs: 10,
    maxAttempts: 1,
    circuitFailureThreshold: 1,
    circuitResetMs: 1_000,
  };
  await assert.rejects(
    executeWithPolicy("test.timeout", policy, async () => {
      attempts += 1;
      return new Promise(() => {});
    }),
    DependencyUnavailableError,
  );
  await assert.rejects(
    executeWithPolicy("test.timeout", policy, async () => {
      attempts += 1;
      return "unexpected";
    }),
    DependencyUnavailableError,
  );
  assert.equal(attempts, 1);
});
