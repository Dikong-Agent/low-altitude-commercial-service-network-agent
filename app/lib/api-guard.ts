import { z } from "zod/v4";
import { AgentInvokeResponseSchema, type AgentId, type AgentInvokeResponse } from "./contracts";
import { DependencyUnavailableError } from "./reliability";
import type { RequestIdentity } from "./request-identity";
import { getRuntimeBindings, type D1Database } from "./runtime-bindings";
import { assertSafeAgentInput } from "./ai-safety";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const UsageRowSchema = z.object({ request_count: z.number().int().nonnegative() });
const IdempotencyRowSchema = z.object({
  request_hash: z.string(),
  state: z.enum(["pending", "completed"]),
  response_json: z.string().nullable(),
  response_status: z.number().int().nullable(),
  expires_at: z.string(),
});

export class ApiGuardError extends Error {
  constructor(
    public readonly status: 400 | 409 | 429 | 503,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiGuardError";
  }
}

export interface IdempotencyReservation {
  identity: RequestIdentity;
  agentId: AgentId;
  key: string;
  requestHash: string;
}

export interface IdempotencyReplay {
  response: AgentInvokeResponse;
  status: number;
}

function db(): D1Database {
  const binding = getRuntimeBindings()?.DB;
  if (!binding) throw new DependencyUnavailableError("api-guard.db", "The DB binding is required");
  return binding;
}

function positiveInteger(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new ApiGuardError(503, "API_GUARD_CONFIGURATION_ERROR", `${name} is invalid`);
  }
  return value;
}

function windowEnd(period: "minute" | "month", now = new Date()): Date {
  if (period === "minute") return new Date(Math.floor(now.getTime() / 60_000) * 60_000 + 60_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

async function incrementBucket(database: D1Database, key: string, endsAt: Date, limit: number): Promise<void> {
  const now = new Date().toISOString();
  const unknownRow = await database.prepare(
    "INSERT INTO api_usage_buckets (bucket_key, window_ends_at, request_count, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(bucket_key) DO UPDATE SET request_count = CASE WHEN window_ends_at <= excluded.updated_at THEN 1 ELSE request_count + 1 END, window_ends_at = CASE WHEN window_ends_at <= excluded.updated_at THEN excluded.window_ends_at ELSE window_ends_at END, updated_at = excluded.updated_at RETURNING request_count",
  ).bind(key, endsAt.toISOString(), now).first();
  const row = UsageRowSchema.safeParse(unknownRow);
  if (!row.success) throw new DependencyUnavailableError("api-guard.usage", "Usage counter update failed", { cause: row.error });
  if (row.data.request_count > limit) {
    const retryAfter = Math.max(1, Math.ceil((endsAt.getTime() - Date.now()) / 1_000));
    throw new ApiGuardError(429, "API_RATE_LIMITED", "The Agent request limit has been reached", retryAfter);
  }
}

async function hashRequest(rawBody: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateAbuseSignals(input: string): void {
  const maximumCharacters = positiveInteger("JDZ_MAX_AGENT_INPUT_CHARACTERS", 8000, 16000);
  if (input.length > maximumCharacters) throw new ApiGuardError(400, "AGENT_INPUT_TOO_LARGE", "Agent input is too large");
  if (/\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(input)) {
    throw new ApiGuardError(400, "AGENT_INPUT_INVALID", "Agent input contains unsupported control characters");
  }
  const urls = input.match(/https?:\/\//gi)?.length ?? 0;
  if (urls > positiveInteger("JDZ_MAX_URLS_PER_REQUEST", 8, 50)) {
    throw new ApiGuardError(400, "AGENT_INPUT_ABUSE_DETECTED", "Agent input contains too many external links");
  }
}

export async function beginProductionApiRequest(
  identity: RequestIdentity,
  agentId: AgentId,
  rawBody: string,
  input: string,
  idempotencyKey: string | null,
): Promise<{ reservation: IdempotencyReservation; replay?: IdempotencyReplay }> {
  if (identity.source !== "trusted-gateway") throw new ApiGuardError(503, "API_GUARD_IDENTITY_ERROR", "Trusted identity is required");
  validateAbuseSignals(input);
  const key = idempotencyKey?.trim() ?? "";
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ApiGuardError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required in production");
  }
  const database = db();
  const now = new Date();
  await incrementBucket(
    database,
    `minute:tenant:${identity.tenantId}`,
    windowEnd("minute", now),
    positiveInteger("JDZ_TENANT_REQUESTS_PER_MINUTE", 300, 100_000),
  );
  await incrementBucket(
    database,
    `minute:subject:${identity.tenantId}:${identity.subjectId}:${agentId}`,
    windowEnd("minute", now),
    positiveInteger("JDZ_SUBJECT_AGENT_REQUESTS_PER_MINUTE", 30, 10_000),
  );
  await incrementBucket(
    database,
    `month:tenant:${identity.tenantId}:${agentId}:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
    windowEnd("month", now),
    positiveInteger("JDZ_TENANT_AGENT_REQUESTS_PER_MONTH", 100_000, 100_000_000),
  );
  assertSafeAgentInput(input);

  const requestHash = await hashRequest(rawBody);
  const expiry = new Date(Date.now() + positiveInteger("JDZ_IDEMPOTENCY_RETENTION_HOURS", 24, 168) * 3_600_000).toISOString();
  const inserted = await database.prepare(
    "INSERT INTO idempotency_records (tenant_id, subject_id, agent_id, idempotency_key, request_hash, state, response_json, response_status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?) ON CONFLICT DO NOTHING",
  ).bind(identity.tenantId, identity.subjectId, agentId, key, requestHash, now.toISOString(), expiry).run();
  const reservation = { identity, agentId, key, requestHash };
  if ((inserted.meta?.changes ?? 0) > 0) return { reservation };

  const unknownRow = await database.prepare(
    "SELECT request_hash, state, response_json, response_status, expires_at FROM idempotency_records WHERE tenant_id = ? AND subject_id = ? AND agent_id = ? AND idempotency_key = ?",
  ).bind(identity.tenantId, identity.subjectId, agentId, key).first();
  const row = IdempotencyRowSchema.safeParse(unknownRow);
  if (!row.success || Date.parse(row.data.expires_at) <= Date.now()) {
    await database.prepare(
      "DELETE FROM idempotency_records WHERE tenant_id = ? AND subject_id = ? AND agent_id = ? AND idempotency_key = ?",
    ).bind(identity.tenantId, identity.subjectId, agentId, key).run();
    throw new ApiGuardError(409, "IDEMPOTENCY_KEY_RETRY", "The expired idempotency reservation was cleared; retry the request", 1);
  }
  if (row.data.request_hash !== requestHash) {
    throw new ApiGuardError(409, "IDEMPOTENCY_KEY_CONFLICT", "The Idempotency-Key was already used with a different request");
  }
  if (row.data.state === "pending" || !row.data.response_json || row.data.response_status === null) {
    throw new ApiGuardError(409, "REQUEST_ALREADY_IN_PROGRESS", "An identical Agent request is already in progress", 2);
  }
  let response: unknown;
  try {
    response = JSON.parse(row.data.response_json);
  } catch (error) {
    throw new DependencyUnavailableError("api-guard.idempotency", "Stored idempotent response is invalid JSON", { cause: error });
  }
  const parsedResponse = AgentInvokeResponseSchema.safeParse(response);
  if (!parsedResponse.success) {
    throw new DependencyUnavailableError("api-guard.idempotency", "Stored idempotent response violates the Agent contract", { cause: parsedResponse.error });
  }
  return { reservation, replay: { response: parsedResponse.data, status: row.data.response_status } };
}

export async function completeProductionApiRequest(
  reservation: IdempotencyReservation,
  response: AgentInvokeResponse,
  status = 200,
): Promise<void> {
  const result = await db().prepare(
    "UPDATE idempotency_records SET state = 'completed', response_json = ?, response_status = ? WHERE tenant_id = ? AND subject_id = ? AND agent_id = ? AND idempotency_key = ? AND request_hash = ? AND state = 'pending'",
  ).bind(
    JSON.stringify(response), status, reservation.identity.tenantId, reservation.identity.subjectId,
    reservation.agentId, reservation.key, reservation.requestHash,
  ).run();
  if ((result.meta?.changes ?? 0) !== 1) throw new DependencyUnavailableError("api-guard.idempotency", "Idempotent response could not be committed");
}

export async function releaseProductionApiRequest(reservation: IdempotencyReservation | undefined): Promise<void> {
  if (!reservation) return;
  await db().prepare(
    "DELETE FROM idempotency_records WHERE tenant_id = ? AND subject_id = ? AND agent_id = ? AND idempotency_key = ? AND request_hash = ? AND state = 'pending'",
  ).bind(
    reservation.identity.tenantId, reservation.identity.subjectId, reservation.agentId,
    reservation.key, reservation.requestHash,
  ).run();
}
