import { z } from "zod/v4";
import {
  CREATE_AGENT_CONVERSATIONS_EXPIRY_INDEX_SQL,
  CREATE_AGENT_CONVERSATIONS_SQL,
  CREATE_AGENT_RUNS_EXPIRY_INDEX_SQL,
  CREATE_AGENT_RUNS_LOOKUP_INDEX_SQL,
  CREATE_AGENT_RUNS_SQL,
  CREATE_AGENT_RUN_EVENTS_SQL,
  CREATE_AGENT_RUN_EVENTS_EXPIRY_INDEX_SQL,
  CREATE_API_USAGE_BUCKETS_SQL,
  CREATE_API_USAGE_EXPIRY_INDEX_SQL,
  CREATE_IDEMPOTENCY_RECORDS_SQL,
  CREATE_IDEMPOTENCY_EXPIRY_INDEX_SQL,
  CREATE_DEPENDENCY_CIRCUITS_SQL,
  CREATE_CALLBACK_RECEIPTS_SQL,
  CREATE_CALLBACK_RECEIPTS_EXPIRY_INDEX_SQL,
  CREATE_AGENT_TASKS_SQL,
  CREATE_AGENT_TASKS_EXPIRY_INDEX_SQL,
  CREATE_AUTH_NONCE_RECORDS_SQL,
  CREATE_AUTH_NONCE_EXPIRY_INDEX_SQL,
  CREATE_AGENT_REVIEW_REQUESTS_SQL,
  CREATE_AGENT_REVIEW_REQUESTS_OWNER_INDEX_SQL,
  CREATE_AGENT_REVIEW_REQUESTS_EXPIRY_INDEX_SQL,
} from "../../db/schema";
import type { CustomerConversationPort } from "./agents/ag025/adapters";
import {
  CustomerConversationStateSchema,
  type CustomerAccessScope,
  type CustomerConversationState,
  type CustomerConversationTurn,
} from "./agents/ag025/types";
import type { AgentRunEvent } from "./observability";
import { DependencyUnavailableError } from "./reliability";
import type { RequestIdentity } from "./request-identity";
import { getRuntimeBindings, type D1Database } from "./runtime-bindings";

const ConversationRowSchema = z.object({ state_json: z.string(), revision: z.number().int(), expires_at: z.string() });
const MAX_PERSISTED_TURNS = 20;
const MAX_WRITE_ATTEMPTS = 3;
const initialized = new WeakMap<object, Promise<void>>();

function retentionDays(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new DependencyUnavailableError("durable-state.config", `${name} is invalid`);
  }
  return value;
}

function expiresAt(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function database(): D1Database {
  const db = getRuntimeBindings()?.DB;
  if (!db) throw new DependencyUnavailableError("durable-state.db", "The DB binding is required in production");
  return db;
}

async function ensureSchema(db: D1Database): Promise<void> {
  const key = db as object;
  let pending = initialized.get(key);
  if (!pending) {
    pending = db.batch([
      db.prepare(CREATE_AGENT_CONVERSATIONS_SQL),
      db.prepare(CREATE_AGENT_CONVERSATIONS_EXPIRY_INDEX_SQL),
      db.prepare(CREATE_AGENT_RUNS_SQL),
      db.prepare(CREATE_AGENT_RUNS_LOOKUP_INDEX_SQL),
      db.prepare(CREATE_AGENT_RUNS_EXPIRY_INDEX_SQL),
      db.prepare(CREATE_AGENT_RUN_EVENTS_SQL),
      db.prepare(CREATE_AGENT_RUN_EVENTS_EXPIRY_INDEX_SQL),
      db.prepare(CREATE_API_USAGE_BUCKETS_SQL),
      db.prepare(CREATE_API_USAGE_EXPIRY_INDEX_SQL),
      db.prepare(CREATE_IDEMPOTENCY_RECORDS_SQL),
      db.prepare(CREATE_IDEMPOTENCY_EXPIRY_INDEX_SQL),
      db.prepare(CREATE_DEPENDENCY_CIRCUITS_SQL),
      db.prepare(CREATE_CALLBACK_RECEIPTS_SQL),
      db.prepare(CREATE_CALLBACK_RECEIPTS_EXPIRY_INDEX_SQL),
      db.prepare(CREATE_AGENT_TASKS_SQL),
      db.prepare(CREATE_AGENT_TASKS_EXPIRY_INDEX_SQL),
      db.prepare(CREATE_AUTH_NONCE_RECORDS_SQL),
      db.prepare(CREATE_AUTH_NONCE_EXPIRY_INDEX_SQL),
      db.prepare(CREATE_AGENT_REVIEW_REQUESTS_SQL),
      db.prepare(CREATE_AGENT_REVIEW_REQUESTS_OWNER_INDEX_SQL),
      db.prepare(CREATE_AGENT_REVIEW_REQUESTS_EXPIRY_INDEX_SQL),
    ]).then(() => undefined);
    initialized.set(key, pending);
  }
  try {
    await pending;
  } catch (error) {
    initialized.delete(key);
    throw new DependencyUnavailableError("durable-state.schema", "Durable state schema is unavailable", { cause: error });
  }
}

export async function assertDurableStateAvailable(): Promise<void> {
  const db = database();
  await ensureSchema(db);
  try {
    await db.prepare("SELECT capability_version, retry_count, internal_trace_json FROM agent_runs LIMIT 1").first();
    await db.prepare("SELECT roles_json, request_hash, attempt_count, result_json, error_code FROM agent_tasks LIMIT 1").first();
    await db.prepare("SELECT tenant_id, nonce, expires_at FROM auth_nonce_records LIMIT 1").first();
    await db.prepare("SELECT review_id, status, resolution_json FROM agent_review_requests LIMIT 1").first();
  } catch (error) {
    throw new DependencyUnavailableError("durable-state.migration", "Required Agent runtime migrations have not been applied", { cause: error, retryable: false });
  }
}

function trustedScope(scope: CustomerAccessScope): { tenantId: string; subjectId: string } {
  if (scope.source !== "trusted-server" || !scope.tenantId || !scope.subjectId) {
    throw new DependencyUnavailableError("durable-state.identity", "Trusted tenant and subject identity are required");
  }
  return { tenantId: scope.tenantId, subjectId: scope.subjectId };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function mergeConversation(
  sessionId: string,
  previous: CustomerConversationState | null,
  turn: CustomerConversationTurn,
  confirmed: Pick<CustomerConversationState, "confirmedOrderIds" | "confirmedProductModels" | "confirmedServiceTypes">,
): CustomerConversationState {
  return {
    sessionId,
    confirmedOrderIds: unique([...(previous?.confirmedOrderIds ?? []), ...confirmed.confirmedOrderIds]),
    confirmedProductModels: unique([...(previous?.confirmedProductModels ?? []), ...confirmed.confirmedProductModels]),
    confirmedServiceTypes: unique([...(previous?.confirmedServiceTypes ?? []), ...confirmed.confirmedServiceTypes]),
    recentTurns: [...(previous?.recentTurns ?? []), turn].slice(-MAX_PERSISTED_TURNS),
  };
}

async function readConversation(
  db: D1Database,
  tenantId: string,
  subjectId: string,
  sessionId: string,
): Promise<{ state: CustomerConversationState | null; revision: number }> {
  const unknownRow = await db.prepare(
    "SELECT state_json, revision, expires_at FROM agent_conversations WHERE tenant_id = ? AND subject_id = ? AND session_id = ?",
  ).bind(tenantId, subjectId, sessionId).first();
  if (!unknownRow) return { state: null, revision: 0 };
  const row = ConversationRowSchema.safeParse(unknownRow);
  if (!row.success) throw new DependencyUnavailableError("durable-state.conversation", "Stored conversation metadata is invalid", { cause: row.error });
  if (Date.parse(row.data.expires_at) <= Date.now()) {
    await db.prepare("DELETE FROM agent_conversations WHERE tenant_id = ? AND subject_id = ? AND session_id = ?")
      .bind(tenantId, subjectId, sessionId).run();
    return { state: null, revision: 0 };
  }
  let json: unknown;
  try {
    json = JSON.parse(row.data.state_json);
  } catch (error) {
    throw new DependencyUnavailableError("durable-state.conversation", "Stored conversation JSON is invalid", { cause: error });
  }
  const state = CustomerConversationStateSchema.safeParse(json);
  if (!state.success) throw new DependencyUnavailableError("durable-state.conversation", "Stored conversation violates its schema", { cause: state.error });
  return { state: state.data, revision: row.data.revision };
}

export class D1CustomerConversationAdapter implements CustomerConversationPort {
  async loadSession(sessionId: string, accessScope: CustomerAccessScope): Promise<CustomerConversationState | null> {
    const { tenantId, subjectId } = trustedScope(accessScope);
    const db = database();
    await ensureSchema(db);
    return (await readConversation(db, tenantId, subjectId, sessionId)).state;
  }

  async saveTurn(
    sessionId: string,
    accessScope: CustomerAccessScope,
    turn: CustomerConversationTurn,
    confirmed: Pick<CustomerConversationState, "confirmedOrderIds" | "confirmedProductModels" | "confirmedServiceTypes">,
  ): Promise<CustomerConversationState> {
    const { tenantId, subjectId } = trustedScope(accessScope);
    const db = database();
    await ensureSchema(db);
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const current = await readConversation(db, tenantId, subjectId, sessionId);
      const state = mergeConversation(sessionId, current.state, turn, confirmed);
      const now = new Date().toISOString();
      const expiry = expiresAt(retentionDays("JDZ_CONVERSATION_RETENTION_DAYS", 30));
      const statement = current.revision === 0
        ? db.prepare(
          "INSERT INTO agent_conversations (tenant_id, subject_id, session_id, state_json, revision, updated_at, expires_at) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING",
        ).bind(tenantId, subjectId, sessionId, JSON.stringify(state), now, expiry)
        : db.prepare(
          "UPDATE agent_conversations SET state_json = ?, revision = revision + 1, updated_at = ?, expires_at = ? WHERE tenant_id = ? AND subject_id = ? AND session_id = ? AND revision = ?",
        ).bind(JSON.stringify(state), now, expiry, tenantId, subjectId, sessionId, current.revision);
      const result = await statement.run();
      if ((result.meta?.changes ?? 0) > 0) return state;
    }
    throw new DependencyUnavailableError("durable-state.conversation", "Conversation update conflicted repeatedly");
  }
}

export async function persistAgentRun(event: AgentRunEvent, identity: RequestIdentity): Promise<void> {
  if (identity.source !== "trusted-gateway") return;
  const db = database();
  await ensureSchema(db);
  const now = new Date().toISOString();
  try {
    const expiry = expiresAt(retentionDays("JDZ_AGENT_RUN_RETENTION_DAYS", 180));
    const retries = event.dependencies?.reduce((sum, item) => sum + item.retries, 0) ?? 0;
    const statements = [db.prepare(
      "INSERT INTO agent_runs (trace_id, request_id, tenant_id, subject_id, agent_id, status, duration_ms, error_code, capability_version, workflow_version, prompt_version, rule_version, model_version, retry_count, token_input, token_output, model_cost_micros, internal_trace_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(trace_id) DO NOTHING",
    ).bind(
      event.traceId,
      event.requestId ?? null,
      identity.tenantId,
      identity.subjectId,
      event.agentId,
      event.status,
      event.durationMs,
      event.errorCode ?? null,
      event.versions?.capability ?? null,
      event.versions?.workflow ?? null,
      event.versions?.prompt ?? null,
      event.versions?.rule ?? null,
      event.versions?.model ?? null,
      retries,
      event.tokenUsage?.input ?? null,
      event.tokenUsage?.output ?? null,
      event.modelCostMicros ?? null,
      event.internalTrace ? JSON.stringify(event.internalTrace.map((step) => ({ name: step.name.slice(0, 120) }))) : null,
      now,
      expiry,
    )];
    for (const [index, dependency] of (event.dependencies ?? []).entries()) {
      statements.push(db.prepare(
        "INSERT INTO agent_run_events (trace_id, sequence, event_type, event_name, duration_ms, status, attempt_count, retry_count, error_code, created_at, expires_at) VALUES (?, ?, 'dependency', ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(trace_id, sequence) DO NOTHING",
      ).bind(event.traceId, index + 1, dependency.dependency, dependency.durationMs, dependency.status, dependency.attempts, dependency.retries, dependency.errorCode ?? null, now, expiry));
    }
    await db.batch(statements);
  } catch (error) {
    throw new DependencyUnavailableError("durable-state.agent-run", "Agent run record could not be persisted", { cause: error });
  }
}

export async function cleanupExpiredRuntimeState(now = new Date()): Promise<void> {
  const db = database();
  await ensureSchema(db);
  const timestamp = now.toISOString();
  const staleCircuitTimestamp = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  try {
    await db.batch([
      db.prepare("DELETE FROM agent_run_events WHERE expires_at <= ?").bind(timestamp),
      db.prepare("DELETE FROM agent_runs WHERE expires_at <= ?").bind(timestamp),
      db.prepare("DELETE FROM agent_conversations WHERE expires_at <= ?").bind(timestamp),
      db.prepare("DELETE FROM api_usage_buckets WHERE window_ends_at <= ?").bind(timestamp),
      db.prepare("DELETE FROM idempotency_records WHERE expires_at <= ?").bind(timestamp),
      db.prepare("DELETE FROM callback_receipts WHERE expires_at <= ?").bind(timestamp),
      db.prepare("DELETE FROM agent_tasks WHERE expires_at <= ?").bind(timestamp),
      db.prepare("DELETE FROM auth_nonce_records WHERE expires_at <= ?").bind(timestamp),
      db.prepare("DELETE FROM agent_review_requests WHERE expires_at <= ?").bind(timestamp),
      db.prepare("DELETE FROM dependency_circuits WHERE open_until_ms <= ? AND updated_at <= ?").bind(now.getTime(), staleCircuitTimestamp),
    ]);
  } catch (error) {
    throw new DependencyUnavailableError("durable-state.cleanup", "Expired Agent runtime state could not be cleaned up", { cause: error });
  }
}
