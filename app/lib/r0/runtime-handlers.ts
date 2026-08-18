import { AGENT_INTERFACE_VERSION } from "../contracts";
import { assertDurableStateAvailable } from "../durable-state";
import { getHumanReview, HumanReviewError, resolveHumanReview, submitHumanReview } from "../human-review";
import { assertAgentAccess, AgentAccessDeniedError, getRuntimeAgentDefinition } from "../agent-runtime-registry";
import { enqueueAgentTask } from "../async-runtime";
import { cancelAgentTask, TaskCancellationError } from "../task-control";
import { RequestIdentityError, resolveRequestIdentity, type RequestIdentity } from "../request-identity";
import { DependencyUnavailableError } from "../reliability";
import { HumanReviewCallbackSchema, HumanReviewSubmissionSchema, R0_FOUNDATION_VERSION } from "./contracts";

const MAX_R0_BODY_BYTES = 20_000;

function headers(traceId?: string): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "X-Agent-Interface-Version": AGENT_INTERFACE_VERSION,
    "X-JDZ-Foundation-Version": R0_FOUNDATION_VERSION,
    ...(traceId ? { "X-Trace-Id": traceId } : {}),
  };
}

export function r0Json(payload: unknown, status = 200, traceId?: string): Response {
  return Response.json(payload, { status, headers: headers(traceId) });
}

async function readBody(request: Request): Promise<string> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_R0_BODY_BYTES) throw new R0HandlerError(413, "REQUEST_TOO_LARGE", `Request body must not exceed ${MAX_R0_BODY_BYTES} bytes`);
  return raw;
}

async function trustedIdentity(request: Request, rawBody: string): Promise<RequestIdentity> {
  const identity = await resolveRequestIdentity(request, rawBody);
  if (identity.source !== "trusted-gateway") throw new R0HandlerError(401, "AUTHENTICATION_REQUIRED", "Trusted gateway authentication is required");
  return identity;
}

class R0HandlerError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "R0HandlerError"; }
}

function errorResponse(error: unknown, traceId?: string): Response {
  if (error instanceof R0HandlerError) return r0Json({ code: error.code, message: error.message, trace_id: traceId }, error.status, traceId);
  if (error instanceof RequestIdentityError) return r0Json({ code: error.code, message: error.message, trace_id: traceId }, error.status, traceId);
  if (error instanceof AgentAccessDeniedError) return r0Json({ code: "AGENT_ACCESS_DENIED", message: error.message, trace_id: traceId }, 403, traceId);
  if (error instanceof TaskCancellationError) return r0Json({ code: error.code, message: error.message, state: error.state, trace_id: traceId }, 409, traceId);
  if (error instanceof HumanReviewError) {
    const status = error.code === "REVIEW_NOT_FOUND" ? 404 : 409;
    return r0Json({ code: error.code, message: error.message, trace_id: traceId }, status, traceId);
  }
  if (error instanceof DependencyUnavailableError) return r0Json({ code: "DEPENDENCY_UNAVAILABLE", message: error.message, trace_id: traceId }, 503, traceId);
  console.error("R0 runtime handler failed", { traceId, error });
  return r0Json({ code: "R0_RUNTIME_FAILED", message: "The R0 Agent runtime request failed safely", trace_id: traceId }, 500, traceId);
}

export async function handleAgentTaskCreation(request: Request, agentId: string): Promise<Response> {
  const traceId = `TRC-${crypto.randomUUID().toUpperCase()}`;
  try {
    const rawBody = await readBody(request);
    const identity = await trustedIdentity(request, rawBody);
    const definition = getRuntimeAgentDefinition(agentId);
    if (!definition) throw new R0HandlerError(404, "AGENT_NOT_FOUND", "Agent not found");
    assertAgentAccess(definition, identity);
    if (definition.executionMode !== "async-capable") throw new R0HandlerError(409, "AGENT_ASYNC_NOT_SUPPORTED", "This Agent is not registered for asynchronous execution");
    let unknown: unknown;
    try { unknown = JSON.parse(rawBody); } catch { throw new R0HandlerError(400, "INVALID_JSON", "Invalid JSON body"); }
    const parsed = definition.requestSchema.safeParse(unknown);
    if (!parsed.success) throw new R0HandlerError(400, "INVALID_AGENT_REQUEST", parsed.error.issues[0]?.message ?? "Invalid Agent request");
    if (parsed.data.agent_id !== definition.id) throw new R0HandlerError(400, "AGENT_ID_MISMATCH", "agent_id does not match route");
    const providerKey = `${definition.id.replace("-", "")}_PROVIDER`;
    if (process.env[providerKey] !== "production") throw new R0HandlerError(503, "PRODUCTION_PROVIDER_REQUIRED", "The Agent production provider is not configured");
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new R0HandlerError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required");
    await assertDurableStateAvailable();
    const task = await enqueueAgentTask(parsed.data, identity, idempotencyKey);
    return r0Json({ task_id: task.taskId, agent_id: definition.id, status: "queued", trace_id: traceId, replayed: task.replayed }, 202, traceId);
  } catch (error) { return errorResponse(error, traceId); }
}

export async function handleAgentTaskCancellation(request: Request, taskId: string): Promise<Response> {
  const traceId = `TRC-${crypto.randomUUID().toUpperCase()}`;
  try {
    const rawBody = await readBody(request);
    if (rawBody.trim()) throw new R0HandlerError(400, "UNEXPECTED_REQUEST_BODY", "Task cancellation does not accept a request body");
    const identity = await trustedIdentity(request, rawBody);
    const result = await cancelAgentTask(taskId, identity);
    if (!result) throw new R0HandlerError(404, "TASK_NOT_FOUND", "Agent task not found");
    return r0Json({ task_id: result.taskId, status: result.state, cancelled_at: result.cancelledAt }, 200, traceId);
  } catch (error) { return errorResponse(error, traceId); }
}

export async function handleHumanReviewSubmission(request: Request): Promise<Response> {
  const traceId = `TRC-${crypto.randomUUID().toUpperCase()}`;
  try {
    const rawBody = await readBody(request);
    const identity = await trustedIdentity(request, rawBody);
    let unknown: unknown;
    try { unknown = JSON.parse(rawBody); } catch { throw new R0HandlerError(400, "INVALID_JSON", "Invalid JSON body"); }
    const parsed = HumanReviewSubmissionSchema.safeParse(unknown);
    if (!parsed.success) throw new R0HandlerError(400, "INVALID_REVIEW_REQUEST", parsed.error.issues[0]?.message ?? "Invalid review request");
    const definition = getRuntimeAgentDefinition(parsed.data.agent_id);
    if (!definition) throw new R0HandlerError(404, "AGENT_NOT_FOUND", "Agent not found");
    assertAgentAccess(definition, identity);
    return r0Json(await submitHumanReview(parsed.data, identity), 201, traceId);
  } catch (error) { return errorResponse(error, traceId); }
}

export async function handleHumanReviewRead(request: Request, reviewId: string): Promise<Response> {
  const traceId = `TRC-${crypto.randomUUID().toUpperCase()}`;
  try {
    const identity = await trustedIdentity(request, "");
    const review = await getHumanReview(reviewId, identity);
    if (!review) throw new R0HandlerError(404, "REVIEW_NOT_FOUND", "Human review item was not found");
    return r0Json(review, 200, traceId);
  } catch (error) { return errorResponse(error, traceId); }
}

export async function handleHumanReviewCallback(request: Request, reviewId: string): Promise<Response> {
  const traceId = `TRC-${crypto.randomUUID().toUpperCase()}`;
  try {
    const rawBody = await readBody(request);
    const identity = await trustedIdentity(request, rawBody);
    let unknown: unknown;
    try { unknown = JSON.parse(rawBody); } catch { throw new R0HandlerError(400, "INVALID_JSON", "Invalid JSON body"); }
    const parsed = HumanReviewCallbackSchema.safeParse(unknown);
    if (!parsed.success) throw new R0HandlerError(400, "INVALID_REVIEW_CALLBACK", parsed.error.issues[0]?.message ?? "Invalid review callback");
    return r0Json(await resolveHumanReview(reviewId, parsed.data, identity), 200, traceId);
  } catch (error) { return errorResponse(error, traceId); }
}
