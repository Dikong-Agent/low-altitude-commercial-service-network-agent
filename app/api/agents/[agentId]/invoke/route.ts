import { getAgentDefinition } from "../../../../lib/agent-registry";
import {
  AGENT_INTERFACE_VERSION,
  Ag002InvokeRequestSchema,
  Ag012InvokeRequestSchema,
  AgentInvokeRequestSchema,
  AgentInvokeResponseSchema,
  type AgentId,
  type AgentInvokeResponse,
} from "../../../../lib/contracts";
import { invokeAg001 } from "../../../../lib/agents/ag001/workflow";
import { invokeAg002 } from "../../../../lib/agents/ag002/workflow";
import { invokeAg003 } from "../../../../lib/agents/ag003/workflow";
import { invokeAg012 } from "../../../../lib/agents/ag012/workflow";
import { recordAgentRun } from "../../../../lib/observability";
import { DependencyUnavailableError } from "../../../../lib/reliability";

const MAX_REQUEST_BYTES = 20_000;

const previewOutputs: Record<Exclude<AgentId, "AG-001" | "AG-002" | "AG-003" | "AG-012">, Omit<AgentInvokeResponse["output"], "summary">> = {
  "AG-025": { title: "智能客服能力预览", points: ["计划识别业务意图并选择服务路径。", "计划连接知识问答、业务工具和转人工流程。", "正式实现需接入 FAQ、业务工具及人工服务机制。"], evidence: ["预览流程定义", "待接入客服工具"] },
};

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

  if (agent.id === "AG-001" || agent.id === "AG-002" || agent.id === "AG-003" || agent.id === "AG-012") {
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
      } else {
        response = await invokeAg001(parsed.data, traceId);
      }
      recordAgentRun({ traceId, requestId: response.request_id, agentId: agent.id, status: response.status, durationMs: Date.now() - startedAt });
      return Response.json(response, { headers: responseHeaders(traceId, "langgraph-demo") });
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

  const preview = previewOutputs[agent.id];
  const response = AgentInvokeResponseSchema.parse({
    request_id: `PREVIEW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    trace_id: traceId,
    agent_id: agent.id,
    status: "preview",
    environment: "demo",
    output: {
      ...preview,
      summary: `“${parsed.data.input}”仅用于展示该 Agent 的目标交互形态；当前尚未执行真实工作流。`,
    },
    trace: agent.trace.map((name, index) => ({ name, detail: agent.traceNotes[index] })),
  });
  recordAgentRun({ traceId, requestId: response.request_id, agentId: agent.id, status: response.status, durationMs: Date.now() - startedAt });
  return Response.json(response, { headers: responseHeaders(traceId) });
}
