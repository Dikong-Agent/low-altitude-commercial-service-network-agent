import type { AgentInvokeRequest } from "./contracts";
import { getRuntimeAgentDefinition } from "./agent-runtime-registry";
import { assertSafeAgentOutput } from "./ai-safety";
import { persistAgentRun } from "./durable-state";
import { recordAgentRun, toClientAgentResponse } from "./observability";
import { createAgentExecutionContext, DependencyUnavailableError, runWithAgentExecutionContext } from "./reliability";
import type { RequestIdentity } from "./request-identity";
import { getRuntimeBindings } from "./runtime-bindings";

function retentionHours(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 720) {
    throw new DependencyUnavailableError("async-runtime.config", `${name} is invalid`, { retryable: false });
  }
  return value;
}

function expiresAt(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enqueueAgentTask(
  request: AgentInvokeRequest,
  identity: RequestIdentity,
  idempotencyKey: string,
): Promise<{ taskId: string }> {
  if (identity.source !== "trusted-gateway") {
    throw new DependencyUnavailableError("async-runtime.identity", "Trusted identity is required for asynchronous tasks", { retryable: false });
  }
  const bindings = getRuntimeBindings();
  if (!bindings?.DB || !bindings.AGENT_TASKS) {
    throw new DependencyUnavailableError("async-runtime.queue", "The asynchronous Agent task queue is not configured", { retryable: false });
  }
  const taskId = `TSK-${crypto.randomUUID().toUpperCase()}`;
  const now = new Date().toISOString();
  const result = await bindings.DB.prepare(
    "INSERT INTO agent_tasks (task_id, tenant_id, subject_id, roles_json, agent_id, idempotency_key, request_json, state, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?) ON CONFLICT(tenant_id, subject_id, agent_id, idempotency_key) DO NOTHING",
  ).bind(taskId, identity.tenantId, identity.subjectId, JSON.stringify(identity.roles), request.agent_id, idempotencyKey, JSON.stringify(request), now, now, expiresAt(retentionHours("JDZ_AGENT_TASK_RETENTION_HOURS", 72))).run();
  if ((result.meta?.changes ?? 0) === 0) {
    const existing = await bindings.DB.prepare(
      "SELECT task_id FROM agent_tasks WHERE tenant_id = ? AND subject_id = ? AND agent_id = ? AND idempotency_key = ?",
    ).bind(identity.tenantId, identity.subjectId, request.agent_id, idempotencyKey).first<{ task_id: string }>();
    if (!existing?.task_id) throw new DependencyUnavailableError("async-runtime.task", "Existing Agent task could not be resolved");
    return { taskId: existing.task_id };
  }
  try {
    await bindings.AGENT_TASKS.send({ taskId });
  } catch (error) {
    await bindings.DB.prepare("UPDATE agent_tasks SET state = 'enqueue_failed', updated_at = ? WHERE task_id = ?")
      .bind(new Date().toISOString(), taskId).run();
    throw new DependencyUnavailableError("async-runtime.queue", "Agent task could not be enqueued", { cause: error });
  }
  return { taskId };
}

export async function claimCallbackReceipt(source: string, callbackId: string, rawPayload: string): Promise<"accepted" | "duplicate"> {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(source) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(callbackId)) {
    throw new DependencyUnavailableError("async-runtime.callback", "Callback identity is invalid", { retryable: false });
  }
  const db = getRuntimeBindings()?.DB;
  if (!db) throw new DependencyUnavailableError("async-runtime.db", "The callback receipt store is unavailable");
  const payloadHash = await sha256(rawPayload);
  const existing = await db.prepare("SELECT payload_hash FROM callback_receipts WHERE source = ? AND callback_id = ?")
    .bind(source, callbackId).first<{ payload_hash: string }>();
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new DependencyUnavailableError("async-runtime.callback", "Callback id was reused with a different payload", { retryable: false });
    }
    return "duplicate";
  }
  const now = new Date().toISOString();
  const result = await db.prepare(
    "INSERT INTO callback_receipts (source, callback_id, payload_hash, received_at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(source, callback_id) DO NOTHING",
  ).bind(source, callbackId, payloadHash, now, expiresAt(retentionHours("JDZ_CALLBACK_RETENTION_HOURS", 72))).run();
  return (result.meta?.changes ?? 0) > 0 ? "accepted" : "duplicate";
}

interface TaskRow {
  task_id: string;
  tenant_id: string;
  subject_id: string;
  roles_json: string;
  agent_id: string;
  request_json: string;
  state: string;
  result_json?: string | null;
  error_code?: string | null;
}

export async function getAgentTask(taskId: string, identity: RequestIdentity): Promise<{ taskId: string; state: string; result?: unknown; errorCode?: string } | null> {
  const db = getRuntimeBindings()?.DB;
  if (!db) throw new DependencyUnavailableError("async-runtime.db", "The Agent task store is unavailable");
  const row = await db.prepare("SELECT task_id, state, result_json, error_code FROM agent_tasks WHERE task_id = ? AND tenant_id = ? AND subject_id = ?")
    .bind(taskId, identity.tenantId, identity.subjectId).first<Pick<TaskRow, "task_id" | "state" | "result_json" | "error_code">>();
  if (!row) return null;
  return {
    taskId: row.task_id,
    state: row.state,
    result: row.result_json ? JSON.parse(row.result_json) : undefined,
    errorCode: row.error_code ?? undefined,
  };
}

export async function processQueuedAgentTask(taskId: string): Promise<void> {
  const db = getRuntimeBindings()?.DB;
  if (!db) throw new DependencyUnavailableError("async-runtime.db", "The Agent task store is unavailable");
  const row = await db.prepare("SELECT task_id, tenant_id, subject_id, roles_json, agent_id, request_json, state, result_json, error_code FROM agent_tasks WHERE task_id = ?")
    .bind(taskId).first<TaskRow>();
  if (!row || row.state === "completed") return;
  const definition = getRuntimeAgentDefinition(row.agent_id);
  if (!definition) throw new DependencyUnavailableError("async-runtime.registry", "Queued Agent is not registered", { retryable: false });
  let roles: string[];
  let unknownRequest: unknown;
  try {
    roles = JSON.parse(row.roles_json);
    unknownRequest = JSON.parse(row.request_json);
  } catch (error) {
    throw new DependencyUnavailableError("async-runtime.task", "Queued Agent task is invalid", { cause: error, retryable: false });
  }
  const parsed = definition.requestSchema.safeParse(unknownRequest);
  if (!parsed.success || !Array.isArray(roles) || roles.some((role) => typeof role !== "string")) {
    throw new DependencyUnavailableError("async-runtime.task", "Queued Agent task violates its contract", { retryable: false });
  }
  const identity: RequestIdentity = { source: "trusted-gateway", tenantId: row.tenant_id, subjectId: row.subject_id, roles };
  const traceId = `TRC-${crypto.randomUUID().toUpperCase()}`;
  const startedAt = Date.now();
  const execution = createAgentExecutionContext(traceId, definition.timeoutPolicy.totalTimeoutMs);
  await db.prepare("UPDATE agent_tasks SET state = 'processing', updated_at = ?, error_code = NULL WHERE task_id = ?")
    .bind(new Date().toISOString(), taskId).run();
  try {
    const response = definition.responseSchema.parse(await runWithAgentExecutionContext(execution, () => definition.invoke(parsed.data, traceId, identity)));
    assertSafeAgentOutput(response);
    const event = {
      traceId,
      requestId: response.request_id,
      agentId: definition.id,
      status: response.status,
      durationMs: Date.now() - startedAt,
      versions: definition.versions,
      dependencies: execution.dependencySpans,
      internalTrace: response.trace,
    } as const;
    recordAgentRun(event);
    await persistAgentRun(event, identity);
    const clientResponse = toClientAgentResponse(response, false);
    await db.prepare("UPDATE agent_tasks SET state = 'completed', result_json = ?, updated_at = ?, error_code = NULL WHERE task_id = ?")
      .bind(JSON.stringify(clientResponse), new Date().toISOString(), taskId).run();
  } catch (error) {
    const errorCode = error instanceof DependencyUnavailableError ? "DEPENDENCY_UNAVAILABLE" : "WORKFLOW_FAILED";
    await db.prepare("UPDATE agent_tasks SET state = 'failed', updated_at = ?, error_code = ? WHERE task_id = ?")
      .bind(new Date().toISOString(), errorCode, taskId).run();
    throw error;
  }
}
