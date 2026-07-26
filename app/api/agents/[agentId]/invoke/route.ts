import { getAgentDefinition } from "../../../../lib/agent-registry";
import {
  AGENT_INTERFACE_VERSION,
  Ag002InvokeRequestSchema,
  Ag012InvokeRequestSchema,
  Ag025InvokeRequestSchema,
  AgentInvokeRequestSchema,
  type AgentInvokeResponse,
} from "../../../../lib/contracts";
import { invokeAg001 } from "../../../../lib/agents/ag001/workflow";
import { invokeAg002 } from "../../../../lib/agents/ag002/workflow";
import { invokeAg003 } from "../../../../lib/agents/ag003/workflow";
import { invokeAg012 } from "../../../../lib/agents/ag012/workflow";
import { invokeAg025 } from "../../../../lib/agents/ag025/workflow";
import { recordAgentRun } from "../../../../lib/observability";
import { DependencyUnavailableError } from "../../../../lib/reliability";

const MAX_REQUEST_BYTES = 20_000;

function responseHeaders(traceId: string, engine?: string) {
  return {
    "Cache-Control": "no-store",
    "X-Agent-Interface-Version": AGENT_INTERFACE_VERSION,
    "X-Trace-Id": traceId,
    ...(engine ? { "X-Agent-Engine": engine } : {}),
  };
}

function errorResponse(status: number, code: string, message: string, traceId: string) {
  return Response.json({ code, message, trace_id: traceId }, { status, headers: responseHeaders(traceId) });
}

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  const startedAt = Date.now();
  const traceId = `TRC-${crypto.randomUUID().toUpperCase()}`;
  const { agentId } = await context.params;
  const agent = getAgentDefinition(agentId);
  if (!agent) return errorResponse(404, "AGENT_NOT_FOUND", "Agent not found", traceId);

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(400, "INVALID_REQUEST_BODY", "Request body could not be read", traceId);
  }
  if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", `Request body must not exceed ${MAX_REQUEST_BYTES} bytes`, traceId);
  }

  let unknownBody: unknown;
  try {
    unknownBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "INVALID_JSON", "Invalid JSON body", traceId);
  }

  const parsed = AgentInvokeRequestSchema.safeParse(unknownBody);
  if (!parsed.success) {
    return errorResponse(400, "INVALID_AGENT_REQUEST", parsed.error.issues[0]?.message ?? "Invalid Agent request", traceId);
  }
  if (parsed.data.agent_id !== agent.id) {
    return errorResponse(400, "AGENT_ID_MISMATCH", "agent_id does not match route", traceId);
  }

  if (agent.id === "AG-001" || agent.id === "AG-002" || agent.id === "AG-003" || agent.id === "AG-012" || agent.id === "AG-025") {
    try {
      let response: AgentInvokeResponse;
      if (agent.id === "AG-002") {
        const ag002Request = Ag002InvokeRequestSchema.safeParse(parsed.data);
        if (!ag002Request.success) {
          return errorResponse(400, "INVALID_AGENT_REQUEST", ag002Request.error.issues[0]?.message ?? "Invalid AG-002 request", traceId);
        }
        response = await invokeAg002(ag002Request.data, traceId);
      } else if (agent.id === "AG-003") {
        response = await invokeAg003(parsed.data, traceId);
      } else if (agent.id === "AG-012") {
        const ag012Request = Ag012InvokeRequestSchema.safeParse(parsed.data);
        if (!ag012Request.success) {
          return errorResponse(400, "INVALID_AGENT_REQUEST", ag012Request.error.issues[0]?.message ?? "Invalid AG-012 request", traceId);
        }
        response = await invokeAg012(ag012Request.data, traceId);
      } else if (agent.id === "AG-025") {
        const ag025Request = Ag025InvokeRequestSchema.safeParse(parsed.data);
        if (!ag025Request.success) {
          return errorResponse(400, "INVALID_AGENT_REQUEST", ag025Request.error.issues[0]?.message ?? "Invalid AG-025 request", traceId);
        }
        response = await invokeAg025(ag025Request.data, traceId);
      } else {
        response = await invokeAg001(parsed.data, traceId);
      }
      recordAgentRun({ traceId, requestId: response.request_id, agentId: agent.id, status: response.status, durationMs: Date.now() - startedAt });
      const engine = response.output.policy?.engine ?? response.output.customer_service?.engine ?? "langgraph-demo";
      return Response.json(response, { headers: responseHeaders(traceId, engine) });
    } catch (error) {
      const dependencyFailure = error instanceof DependencyUnavailableError;
      recordAgentRun({
        traceId,
        agentId: agent.id,
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCode: dependencyFailure ? "DEPENDENCY_UNAVAILABLE" : "WORKFLOW_FAILED",
      });
      console.error(`${agent.id} workflow failed`, { traceId, error });
      return errorResponse(
        dependencyFailure ? 503 : 500,
        dependencyFailure ? "DEPENDENCY_UNAVAILABLE" : "AGENT_WORKFLOW_FAILED",
        dependencyFailure ? "A required Agent dependency is temporarily unavailable" : `${agent.id} workflow failed safely`,
        traceId,
      );
    }
  }

  return errorResponse(409, "AGENT_NOT_RUNNABLE", "Agent is not runnable", traceId);
}
