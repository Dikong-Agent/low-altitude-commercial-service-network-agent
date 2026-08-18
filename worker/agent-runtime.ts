import { handleAgentInvocation } from "../app/lib/agent-runtime-handler";
import { listRuntimeAgentDefinitions } from "../app/lib/agent-runtime-registry";
import { claimCallbackReceipt, getAgentTask, processQueuedAgentTask } from "../app/lib/async-runtime";
import { assertDurableStateAvailable, cleanupExpiredRuntimeState } from "../app/lib/durable-state";
import { assertProductionAuthConfiguration, RequestIdentityError, resolveRequestIdentity } from "../app/lib/request-identity";
import { DependencyUnavailableError } from "../app/lib/reliability";
import { getRuntimeBindings, runWithRuntimeBindings, type RuntimeBindings } from "../app/lib/runtime-bindings";
import { assertProductionAdapterConfiguration } from "../app/lib/production-http";
import { AGENT_INTERFACE_VERSION } from "../app/lib/contracts";
import { R0_FOUNDATION_VERSION } from "../app/lib/r0/contracts";
import { r0OpenApiDocument } from "../app/lib/r0/openapi";
import {
  handleAgentTaskCancellation,
  handleAgentTaskCreation,
  handleHumanReviewCallback,
  handleHumanReviewRead,
  handleHumanReviewSubmission,
} from "../app/lib/r0/runtime-handlers";

type Env = RuntimeBindings;
interface QueueMessage { body: { taskId?: string }; ack(): void; retry(): void }
interface QueueBatch { messages: QueueMessage[] }

function json(payload: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(payload, { status, headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...headers,
  } });
}

async function ready(): Promise<Response> {
  try {
    const bindings = getRuntimeBindings();
    if (!bindings?.DB || !bindings.AGENT_TASKS) return json({ status: "not_ready" }, 503);
    await assertDurableStateAvailable();
    const missingProviders = listRuntimeAgentDefinitions().filter((definition) => process.env[definition.id.replace("-", "") + "_PROVIDER"] !== "production");
    if (process.env.AGENT_RUNTIME_MODE !== "production" || missingProviders.length) return json({ status: "not_ready" }, 503);
    if (listRuntimeAgentDefinitions().some((definition) => definition.accessPolicy.requiredAnyRole.length === 0)) return json({ status: "not_ready" }, 503);
    assertProductionAuthConfiguration();
    assertProductionAdapterConfiguration();
    return json({ status: "ready", foundation_version: R0_FOUNDATION_VERSION, interface_version: AGENT_INTERFACE_VERSION,
      checks: { database: "ready", queue: "ready", providers: "ready", authentication: "ready", adapters: "ready" } });
  } catch {
    return json({ status: "not_ready", foundation_version: R0_FOUNDATION_VERSION, interface_version: AGENT_INTERFACE_VERSION }, 503);
  }
}

async function authenticatedIdentity(
  request: Request,
  rawBody: string,
): Promise<{ identity: Awaited<ReturnType<typeof resolveRequestIdentity>> } | { response: Response }> {
  try {
    const identity = await resolveRequestIdentity(request, rawBody);
    if (identity.source !== "trusted-gateway") throw new RequestIdentityError("AUTHENTICATION_REQUIRED", 401, "Trusted gateway authentication is required");
    return { identity } as const;
  } catch (error) {
    if (error instanceof RequestIdentityError) return { response: json({ code: error.code, message: error.message }, error.status) } as const;
    return { response: json({ code: "AUTH_CONFIGURATION_ERROR", message: "Authentication is unavailable" }, 503) } as const;
  }
}

const runtime = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return runWithRuntimeBindings(env, async () => {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health/live") return json({ status: "live", foundation_version: R0_FOUNDATION_VERSION, interface_version: AGENT_INTERFACE_VERSION });
      if (request.method === "GET" && url.pathname === "/health/ready") return ready();
      if (request.method === "GET" && url.pathname === "/openapi.json") return json(r0OpenApiDocument(url.origin));
      if (request.method === "GET" && url.pathname === "/v1/agents") {
        const auth = await authenticatedIdentity(request, "");
        if ("response" in auth) return auth.response;
        return json({ foundation_version: R0_FOUNDATION_VERSION, interface_version: AGENT_INTERFACE_VERSION, items: listRuntimeAgentDefinitions().map(({ id, executionMode, timeoutPolicy, versions }) => ({ id, execution_mode: executionMode, timeout_policy: timeoutPolicy, versions })) });
      }
      const invocation = url.pathname.match(/^\/v1\/agents\/(AG-\d{3})\/invoke$/);
      if (request.method === "POST" && invocation) return handleAgentInvocation(request, invocation[1]);

      const taskCreation = url.pathname.match(/^\/v1\/agents\/(AG-\d{3})\/tasks$/);
      if (request.method === "POST" && taskCreation) return handleAgentTaskCreation(request, taskCreation[1]);

      const callback = url.pathname.match(/^\/v1\/callbacks\/([a-z0-9._-]+)$/i);
      if (request.method === "POST" && callback) {
        const rawBody = await request.text();
        const auth = await authenticatedIdentity(request, rawBody);
        if ("response" in auth) return auth.response;
        const callbackId = request.headers.get("x-jdz-callback-id")?.trim();
        if (!callbackId) return json({ code: "CALLBACK_ID_REQUIRED", message: "x-jdz-callback-id is required" }, 400);
        try {
          const outcome = await claimCallbackReceipt(callback[1], callbackId, rawBody);
          return json({ status: outcome }, outcome === "accepted" ? 202 : 200);
        } catch (error) {
          const conflict = error instanceof DependencyUnavailableError && !error.retryable;
          return json({ code: conflict ? "CALLBACK_CONFLICT" : "CALLBACK_UNAVAILABLE", message: conflict ? error.message : "Callback processing is unavailable" }, conflict ? 409 : 503);
        }
      }

      const task = url.pathname.match(/^\/v1\/tasks\/(TSK-[A-Z0-9-]+)$/);
      if (request.method === "GET" && task) {
        const auth = await authenticatedIdentity(request, "");
        if ("response" in auth) return auth.response;
        try {
          const result = await getAgentTask(task[1], auth.identity);
          return result ? json({ task_id: result.taskId, state: result.state, result: result.result, error_code: result.errorCode }) : json({ code: "TASK_NOT_FOUND", message: "Agent task not found" }, 404);
        } catch {
          return json({ code: "TASK_STORE_UNAVAILABLE", message: "Agent task status is unavailable" }, 503);
        }
      }
      const taskCancellation = url.pathname.match(/^\/v1\/tasks\/(TSK-[A-Z0-9-]+)\/cancel$/);
      if (request.method === "POST" && taskCancellation) return handleAgentTaskCancellation(request, taskCancellation[1]);

      if (request.method === "POST" && url.pathname === "/v1/reviews") return handleHumanReviewSubmission(request);
      const review = url.pathname.match(/^\/v1\/reviews\/(RVW-[A-Z0-9-]+)$/);
      if (request.method === "GET" && review) return handleHumanReviewRead(request, review[1]);
      const reviewCallback = url.pathname.match(/^\/v1\/reviews\/(RVW-[A-Z0-9-]+)\/callback$/);
      if (request.method === "POST" && reviewCallback) return handleHumanReviewCallback(request, reviewCallback[1]);
      return json({ code: "ROUTE_NOT_FOUND", message: "Runtime route not found" }, 404);
    });
  },

  async queue(batch: QueueBatch, env: Env): Promise<void> {
    await runWithRuntimeBindings(env, async () => {
      await Promise.all(batch.messages.map(async (message) => {
        if (!message.body?.taskId) {
          message.ack();
          return;
        }
        try {
          await processQueuedAgentTask(message.body.taskId);
          message.ack();
        } catch (error) {
          if (error instanceof DependencyUnavailableError && !error.retryable) message.ack();
          else message.retry();
        }
      }));
    });
  },

  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await runWithRuntimeBindings(env, () => cleanupExpiredRuntimeState());
  },
};

export default runtime;
