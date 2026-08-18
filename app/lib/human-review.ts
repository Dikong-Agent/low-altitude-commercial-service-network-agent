import { CREATE_AGENT_REVIEW_REQUESTS_EXPIRY_INDEX_SQL, CREATE_AGENT_REVIEW_REQUESTS_OWNER_INDEX_SQL, CREATE_AGENT_REVIEW_REQUESTS_SQL } from "../../db/schema.ts";
import type { RequestIdentity } from "./request-identity.ts";
import { DependencyUnavailableError } from "./reliability.ts";
import { getRuntimeBindings, type D1Database } from "./runtime-bindings.ts";
import {
  HumanReviewCallbackSchema,
  HumanReviewSubmissionSchema,
  HumanReviewViewSchema,
  type HumanReviewCallback,
  type HumanReviewSubmission,
  type HumanReviewView,
} from "./r0/contracts.ts";

const memoryReviews = new Map<string, { tenantId: string; subjectId: string; value: HumanReviewView }>();
const initialized = new WeakMap<object, Promise<void>>();

interface ReviewRow {
  review_id: string; agent_id: string; trace_id: string; status: string; reason: string; evidence_json: string;
  proposed_action: string | null; resolution_json: string | null; created_at: string; updated_at: string; expires_at: string;
}

export class HumanReviewError extends Error {
  readonly code: "REVIEW_NOT_FOUND" | "REVIEW_CONFLICT" | "REVIEW_EXPIRED";
  constructor(code: "REVIEW_NOT_FOUND" | "REVIEW_CONFLICT" | "REVIEW_EXPIRED", message: string) {
    super(message); this.name = "HumanReviewError";
    this.code = code;
  }
}

function assertTrusted(identity: RequestIdentity): void {
  if (identity.source !== "trusted-gateway") throw new DependencyUnavailableError("human-review.identity", "Trusted identity is required for human review", { retryable: false });
}

function isReviewer(identity: RequestIdentity): boolean { return identity.roles.some((role) => ["human-reviewer", "operator", "admin"].includes(role)); }

async function ensureSchema(db: D1Database): Promise<void> {
  let pending = initialized.get(db as object);
  if (!pending) {
    pending = db.batch([
      db.prepare(CREATE_AGENT_REVIEW_REQUESTS_SQL), db.prepare(CREATE_AGENT_REVIEW_REQUESTS_OWNER_INDEX_SQL),
      db.prepare(CREATE_AGENT_REVIEW_REQUESTS_EXPIRY_INDEX_SQL),
    ]).then(() => undefined);
    initialized.set(db as object, pending);
  }
  await pending;
}

function defaultExpiry(): string { return new Date(Date.now() + 7 * 86_400_000).toISOString(); }

function rowToView(row: ReviewRow): HumanReviewView {
  const status = Date.parse(row.expires_at) <= Date.now() && row.status === "pending" ? "expired" : row.status;
  const unknown = {
    review_id: row.review_id, agent_id: row.agent_id, trace_id: row.trace_id, status,
    reason: row.reason, evidence: JSON.parse(row.evidence_json), proposed_action: row.proposed_action ?? undefined,
    decision: row.resolution_json ? JSON.parse(row.resolution_json) : undefined,
    created_at: row.created_at, updated_at: row.updated_at, expires_at: row.expires_at,
  };
  return HumanReviewViewSchema.parse(unknown);
}

export async function submitHumanReview(input: HumanReviewSubmission, identity: RequestIdentity): Promise<HumanReviewView> {
  assertTrusted(identity);
  const parsed = HumanReviewSubmissionSchema.parse(input);
  const now = new Date().toISOString();
  const expiresAt = parsed.expires_at ?? defaultExpiry();
  if (Date.parse(expiresAt) <= Date.now()) throw new HumanReviewError("REVIEW_EXPIRED", "Review expiry must be in the future");
  const value = HumanReviewViewSchema.parse({
    review_id: `RVW-${crypto.randomUUID().toUpperCase()}`, agent_id: parsed.agent_id, trace_id: parsed.trace_id,
    status: "pending", reason: parsed.reason, evidence: parsed.evidence, proposed_action: parsed.proposed_action,
    created_at: now, updated_at: now, expires_at: expiresAt,
  });
  const db = getRuntimeBindings()?.DB;
  if (!db) {
    if (process.env.AGENT_RUNTIME_MODE === "production") throw new DependencyUnavailableError("human-review.db", "The human review store is unavailable");
    memoryReviews.set(value.review_id, { tenantId: identity.tenantId, subjectId: identity.subjectId, value });
    return value;
  }
  await ensureSchema(db);
  await db.prepare(
    "INSERT INTO agent_review_requests (review_id, tenant_id, subject_id, agent_id, trace_id, status, reason, evidence_json, proposed_action, resolution_json, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL, ?, ?, ?)",
  ).bind(value.review_id, identity.tenantId, identity.subjectId, value.agent_id, value.trace_id, value.reason, JSON.stringify(value.evidence), value.proposed_action ?? null, now, now, expiresAt).run();
  return value;
}

export async function getHumanReview(reviewId: string, identity: RequestIdentity): Promise<HumanReviewView | null> {
  assertTrusted(identity);
  const db = getRuntimeBindings()?.DB;
  if (!db) {
    const stored = memoryReviews.get(reviewId);
    if (!stored || stored.tenantId !== identity.tenantId || (!isReviewer(identity) && stored.subjectId !== identity.subjectId)) return null;
    return stored.value.status === "pending" && Date.parse(stored.value.expires_at) <= Date.now() ? { ...stored.value, status: "expired" } : stored.value;
  }
  await ensureSchema(db);
  const statement = isReviewer(identity)
    ? db.prepare("SELECT review_id, agent_id, trace_id, status, reason, evidence_json, proposed_action, resolution_json, created_at, updated_at, expires_at FROM agent_review_requests WHERE review_id = ? AND tenant_id = ?").bind(reviewId, identity.tenantId)
    : db.prepare("SELECT review_id, agent_id, trace_id, status, reason, evidence_json, proposed_action, resolution_json, created_at, updated_at, expires_at FROM agent_review_requests WHERE review_id = ? AND tenant_id = ? AND subject_id = ?").bind(reviewId, identity.tenantId, identity.subjectId);
  const row = await statement.first<ReviewRow>();
  return row ? rowToView(row) : null;
}

export async function resolveHumanReview(reviewId: string, input: HumanReviewCallback, identity: RequestIdentity): Promise<HumanReviewView> {
  assertTrusted(identity);
  if (!isReviewer(identity)) throw new HumanReviewError("REVIEW_CONFLICT", "A human-reviewer, operator or admin role is required to resolve a review");
  const decision = HumanReviewCallbackSchema.parse(input);
  const existing = await getHumanReview(reviewId, identity);
  if (!existing) throw new HumanReviewError("REVIEW_NOT_FOUND", "Human review item was not found");
  if (existing.status === "expired") throw new HumanReviewError("REVIEW_EXPIRED", "Human review item has expired");
  if (existing.status !== "pending" && existing.status !== "needs_more_information") {
    if (JSON.stringify(existing.decision) === JSON.stringify(decision)) return existing;
    throw new HumanReviewError("REVIEW_CONFLICT", "Human review item has already been resolved");
  }
  const updatedAt = new Date().toISOString();
  const next = HumanReviewViewSchema.parse({ ...existing, status: decision.decision, decision, updated_at: updatedAt });
  const db = getRuntimeBindings()?.DB;
  if (!db) {
    memoryReviews.set(reviewId, { tenantId: identity.tenantId, subjectId: identity.subjectId, value: next });
    return next;
  }
  await ensureSchema(db);
  const result = await db.prepare("UPDATE agent_review_requests SET status = ?, resolution_json = ?, updated_at = ? WHERE review_id = ? AND tenant_id = ? AND status IN ('pending', 'needs_more_information')")
    .bind(decision.decision, JSON.stringify(decision), updatedAt, reviewId, identity.tenantId).run();
  if ((result.meta?.changes ?? 0) === 0) throw new HumanReviewError("REVIEW_CONFLICT", "Human review item changed concurrently");
  return next;
}
