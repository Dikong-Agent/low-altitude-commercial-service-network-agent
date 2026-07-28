import { handleAgentInvocation } from "../app/lib/agent-runtime-handler";
import { listRuntimeAgentDefinitions } from "../app/lib/agent-runtime-registry";
import { claimCallbackReceipt, getAgentTask, processQueuedAgentTask } from "../app/lib/async-runtime";
import { assertDurableStateAvailable } from "../app/lib/durable-state";
import { RequestIdentityError, resolveRequestIdentity } from "../app/lib/request-identity";
import { DependencyUnavailableError } from "../app/lib/reliability";
import { runWithRuntimeBindings, type RuntimeBindings } from "../app/lib/runtime-bindings";

type Env = RuntimeBindings;
interface QueueMessage { body: { taskId?: string }; ack(): void; retry(): void }
interface QueueBatch { messages: QueueMessage[] }

function json(payload: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

async function ready(): Promise<Response> {
  try {
    await assertDurableStateAvailable();
    const missingProviders = listRuntimeAgentDefinitions().filter((definition) => process.env[definition.id.replace("-", "") + "_PROVIDER"] !== "production");
    if (process.env.AGENT_RUNTIME_MODE !== "production" || missingProviders.length) return json({ status: "not_ready" }, 503);
    return json({ status: "ready" });
  } catch {
    return json({ status: "not_ready" }, 503);
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
      if (request.method === "GET" && url.pathname === "/health/live") return json({ status: "live" });
      if (request.method === "GET" && url.pathname === "/health/ready") return ready();
      if (request.method === "GET" && url.pathname === "/v1/agents") {
        const auth = await authenticatedIdentity(request, "");
        if ("response" in auth) return auth.response;
        return json({ items: listRuntimeAgentDefinitions().map(({ id, executionMode, timeoutPolicy, versions }) => ({ id, execution_mode: executionMode, timeout_policy: timeoutPolicy, versions })) });
      }
      const invocation = url.pathname.match(/^\/v1\/agents\/(AG-\d{3})\/invoke$/);
      if (request.method === "POST" && invocation) return handleAgentInvocation(request, invocation[1]);

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
          return result ? json(result) : json({ code: "TASK_NOT_FOUND", message: "Agent task not found" }, 404);
        } catch {
          return json({ code: "TASK_STORE_UNAVAILABLE", message: "Agent task status is unavailable" }, 503);
        }
      }
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
};

export default runtime;
