import { AGENT_INTERFACE_VERSION, type AgentInvokeResponse } from "./contracts";
import { getRuntimeAgentDefinition, AgentAccessDeniedError, assertAgentAccess } from "./agent-runtime-registry";
import { recordAgentRun, toClientAgentResponse } from "./observability";
import {
  AgentExecutionAbortedError,
  DependencyUnavailableError,
  createAgentExecutionContext,
  runWithAgentExecutionContext,
} from "./reliability";
import { RequestIdentityError, resolveRequestIdentity } from "./request-identity";
import { assertDurableStateAvailable, persistAgentRun } from "./durable-state";
import {
  ApiGuardError,
  beginProductionApiRequest,
  completeProductionApiRequest,
  releaseProductionApiRequest,
  type IdempotencyReservation,
} from "./api-guard";
import { AISafetyError, assertSafeAgentOutput } from "./ai-safety";
import { AsyncTaskConflictError, enqueueAgentTask } from "./async-runtime";
import { AgentPolicyError } from "./agent-policy-errors";

const MAX_REQUEST_BYTES = 20_000;

export function runtimeResponseHeaders(traceId: string, engine?: string) {
  return {
    "Cache-Control": "no-store",
    "X-Agent-Interface-Version": AGENT_INTERFACE_VERSION,
    "X-Trace-Id": traceId,
    ...(engine ? { "X-Agent-Engine": engine } : {}),
  };
}

export function runtimeErrorResponse(status: number, code: string, message: string, traceId: string, extraHeaders?: Record<string, string>) {
  return Response.json({ code, message, trace_id: traceId }, { status, headers: { ...runtimeResponseHeaders(traceId), ...extraHeaders } });
}

function responseEngine(response: AgentInvokeResponse): string {
  return response.output.policy?.engine
    ?? response.output.customer_service?.engine
    ?? response.output.comparison?.engine
    ?? response.output.manual?.engine
    ?? response.output.recommendation?.engine
    ?? response.output.quote_comparison?.engine
    ?? response.output.learning_recommendation?.engine
    ?? response.output.price_lookup?.engine
    ?? response.output.flight_service_match?.engine
    ?? response.output.data_analysis?.engine
    ?? response.output.user_features?.engine
    ?? response.output.news_recommendation?.engine
    ?? response.output.public_opinion?.engine
    ?? response.output.precision_recommendation?.engine
    ?? "langgraph-demo";
}

export async function handleAgentInvocation(request: Request, agentId: string): Promise<Response> {
  const startedAt = Date.now();
  const traceId = `TRC-${crypto.randomUUID().toUpperCase()}`;
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return runtimeErrorResponse(400, "INVALID_REQUEST_BODY", "Request body could not be read", traceId);
  }
  if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BYTES) {
    return runtimeErrorResponse(413, "REQUEST_TOO_LARGE", `Request body must not exceed ${MAX_REQUEST_BYTES} bytes`, traceId);
  }

  let identity;
  try {
    identity = await resolveRequestIdentity(request, rawBody);
  } catch (error) {
    if (error instanceof RequestIdentityError) return runtimeErrorResponse(error.status, error.code, error.message, traceId);
    return runtimeErrorResponse(503, "AUTH_CONFIGURATION_ERROR", "Agent runtime authentication is temporarily unavailable", traceId);
  }

  const definition = getRuntimeAgentDefinition(agentId);
  if (!definition) return runtimeErrorResponse(404, "AGENT_NOT_FOUND", "Agent not found", traceId);
  try {
    assertAgentAccess(definition, identity);
  } catch (error) {
    if (error instanceof AgentAccessDeniedError) return runtimeErrorResponse(403, "AGENT_ACCESS_DENIED", error.message, traceId);
    throw error;
  }

  let unknownBody: unknown;
  try {
    unknownBody = JSON.parse(rawBody);
  } catch {
    return runtimeErrorResponse(400, "INVALID_JSON", "Invalid JSON body", traceId);
  }
  const parsed = definition.requestSchema.safeParse(unknownBody);
  if (!parsed.success) {
    return runtimeErrorResponse(400, "INVALID_AGENT_REQUEST", parsed.error.issues[0]?.message ?? "Invalid Agent request", traceId);
  }
  if (parsed.data.agent_id !== definition.id) {
    return runtimeErrorResponse(400, "AGENT_ID_MISMATCH", "agent_id does not match route", traceId);
  }

  const production = identity.source === "trusted-gateway";
  const providerEnvironmentKey = definition.id.replace("-", "") + "_PROVIDER";
  if (production && process.env[providerEnvironmentKey] !== "production") {
    return runtimeErrorResponse(503, "PRODUCTION_PROVIDER_REQUIRED", "The Agent production provider is not configured", traceId);
  }
  if (production) {
    try {
      await assertDurableStateAvailable();
    } catch {
      return runtimeErrorResponse(503, "DURABLE_STATE_UNAVAILABLE", "The Agent durable state service is unavailable", traceId);
    }
  }

  let reservation: IdempotencyReservation | undefined;
  if (production) {
    try {
      const guard = await beginProductionApiRequest(identity, definition.id, rawBody, parsed.data.input, request.headers.get("idempotency-key"));
      reservation = guard.reservation;
      if (guard.replay) {
        const replay = toClientAgentResponse(guard.replay.response, false);
        return Response.json(replay, {
          status: guard.replay.status,
          headers: { ...runtimeResponseHeaders(replay.trace_id, responseEngine(replay)), "X-Idempotent-Replay": "true" },
        });
      }
    } catch (error) {
      if (error instanceof ApiGuardError) {
        return runtimeErrorResponse(error.status, error.code, error.message, traceId, error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined);
      }
      if (error instanceof AISafetyError) return runtimeErrorResponse(400, error.code, error.message, traceId);
      return runtimeErrorResponse(503, "API_GUARD_UNAVAILABLE", "The Agent API guard is unavailable", traceId);
    }
  }

  if (production && definition.executionMode === "async-capable" && /respond-async/i.test(request.headers.get("prefer") ?? "")) {
    const idempotencyKey = request.headers.get("idempotency-key")!;
    try {
      const task = await enqueueAgentTask(parsed.data, identity, idempotencyKey);
      await releaseProductionApiRequest(reservation);
      return Response.json({ task_id: task.taskId, agent_id: definition.id, status: "queued", trace_id: traceId }, {
        status: 202,
        headers: {
          ...runtimeResponseHeaders(traceId),
          "Preference-Applied": "respond-async",
          "Location": `/v1/tasks/${task.taskId}`,
          ...(task.replayed ? { "X-Idempotent-Replay": "true" } : {}),
        },
      });
    } catch (error) {
      await releaseProductionApiRequest(reservation).catch(() => undefined);
      if (error instanceof AsyncTaskConflictError) return runtimeErrorResponse(409, "IDEMPOTENCY_CONFLICT", error.message, traceId);
      const message = error instanceof DependencyUnavailableError ? error.message : "The Agent task could not be queued";
      return runtimeErrorResponse(503, "ASYNC_RUNTIME_UNAVAILABLE", message, traceId);
    }
  }

  const execution = createAgentExecutionContext(traceId, definition.timeoutPolicy.maxSynchronousMs, request.signal);
  try {
    const internalResponse = await runWithAgentExecutionContext(execution, () => definition.invoke(parsed.data, traceId, identity));
    const response = definition.responseSchema.parse(internalResponse);
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
    try {
      await persistAgentRun(event, identity);
    } catch {
      await releaseProductionApiRequest(reservation).catch(() => undefined);
      return runtimeErrorResponse(503, "RUN_STATE_PERSISTENCE_FAILED", "The Agent run could not be committed", traceId);
    }
    const clientResponse = toClientAgentResponse(response, !production);
    try {
      if (reservation) await completeProductionApiRequest(reservation, clientResponse);
    } catch {
      await releaseProductionApiRequest(reservation).catch(() => undefined);
      return runtimeErrorResponse(503, "IDEMPOTENCY_COMMIT_FAILED", "The Agent response could not be committed", traceId);
    }
    return Response.json(clientResponse, { headers: runtimeResponseHeaders(traceId, responseEngine(clientResponse)) });
  } catch (error) {
    await releaseProductionApiRequest(reservation).catch(() => undefined);
    const cancelled = error instanceof AgentExecutionAbortedError;
    const timedOut = !cancelled && error instanceof DependencyUnavailableError && /time budget|timed out/i.test(`${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`);
    const dependencyFailure = error instanceof DependencyUnavailableError;
    const safetyFailure = error instanceof AISafetyError;
    const policyFailure = error instanceof AgentPolicyError;
    if (policyFailure) {
      recordAgentRun({ traceId, agentId: definition.id, status: "failed", durationMs: Date.now() - startedAt, errorCode: error.code, versions: definition.versions, dependencies: execution.dependencySpans });
      return runtimeErrorResponse(error.status, error.code, error.message, traceId);
    }
    const errorCode = cancelled ? "REQUEST_CANCELLED" : timedOut ? "AGENT_TIMEOUT" : dependencyFailure ? "DEPENDENCY_UNAVAILABLE" : safetyFailure ? error.code : "WORKFLOW_FAILED";
    const event = {
      traceId,
      agentId: definition.id,
      status: "failed" as const,
      durationMs: Date.now() - startedAt,
      errorCode,
      versions: definition.versions,
      dependencies: execution.dependencySpans,
    };
    recordAgentRun(event);
    try {
      await persistAgentRun(event, identity);
    } catch (persistenceError) {
      console.error("Failed Agent run could not be persisted", { traceId, persistenceError });
    }
    console.error("Agent workflow failed", { traceId, agentId: definition.id, errorCode });
    return runtimeErrorResponse(
      cancelled || timedOut ? 408 : dependencyFailure ? 503 : safetyFailure ? 502 : 500,
      errorCode,
      cancelled || timedOut
        ? "The Agent request was cancelled or exceeded its synchronous time budget"
        : dependencyFailure
          ? "A required Agent dependency is temporarily unavailable"
          : safetyFailure
            ? "The Agent response was blocked by the safety policy"
            : `${definition.id} workflow failed safely`,
      traceId,
    );
  }
}
