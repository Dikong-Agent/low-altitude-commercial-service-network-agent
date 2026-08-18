import { DependencyUnavailableError } from "./reliability.ts";
import type { RequestIdentity } from "./request-identity.ts";
import { getRuntimeBindings } from "./runtime-bindings.ts";

export class TaskCancellationError extends Error {
  readonly code: "TASK_NOT_CANCELLABLE";
  readonly state: string;
  constructor(state: string) {
    super(`Agent task cannot be cancelled while it is ${state}`);
    this.name = "TaskCancellationError";
    this.code = "TASK_NOT_CANCELLABLE";
    this.state = state;
  }
}

export async function cancelAgentTask(
  taskId: string,
  identity: RequestIdentity,
): Promise<{ taskId: string; state: "cancelled"; cancelledAt: string } | null> {
  if (identity.source !== "trusted-gateway") throw new DependencyUnavailableError("async-runtime.identity", "Trusted identity is required for task cancellation", { retryable: false });
  const db = getRuntimeBindings()?.DB;
  if (!db) throw new DependencyUnavailableError("async-runtime.db", "The Agent task store is unavailable");
  const current = await db.prepare("SELECT task_id, state FROM agent_tasks WHERE task_id = ? AND tenant_id = ? AND subject_id = ?")
    .bind(taskId, identity.tenantId, identity.subjectId).first<{ task_id: string; state: string }>();
  if (!current) return null;
  if (current.state === "cancelled") return { taskId, state: "cancelled", cancelledAt: new Date().toISOString() };
  if (!["queued", "enqueue_failed", "failed"].includes(current.state)) throw new TaskCancellationError(current.state);
  const cancelledAt = new Date().toISOString();
  const result = await db.prepare(
    "UPDATE agent_tasks SET state = 'cancelled', updated_at = ?, error_code = NULL WHERE task_id = ? AND tenant_id = ? AND subject_id = ? AND state IN ('queued', 'enqueue_failed', 'failed')",
  ).bind(cancelledAt, taskId, identity.tenantId, identity.subjectId).run();
  if ((result.meta?.changes ?? 0) === 0) throw new TaskCancellationError("concurrently updated");
  return { taskId, state: "cancelled", cancelledAt };
}

