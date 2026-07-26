import { AgentInvokeResponseSchema, type AgentInvokeRequest, type AgentInvokeResponse } from "./contracts";

const AGENT_API_BASE = process.env.NEXT_PUBLIC_AGENT_API_BASE || "/api";
const CLIENT_TIMEOUT_MS = 15_000;

export class AgentGatewayError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = "AgentGatewayError";
  }
}

export async function invokeAgent(
  request: AgentInvokeRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<AgentInvokeResponse> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch(`${AGENT_API_BASE}/agents/${request.agent_id}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = payload && typeof payload === "object" ? payload as { code?: string; message?: string } : {};
      throw new AgentGatewayError(error.code ?? "AGENT_INTERFACE_FAILED", error.message ?? `Agent interface failed: ${response.status}`, response.status);
    }
    const parsed = AgentInvokeResponseSchema.safeParse(payload);
    if (!parsed.success) throw new AgentGatewayError("INVALID_AGENT_RESPONSE", "Agent interface returned an invalid response");
    return parsed.data;
  } catch (error) {
    if (error instanceof AgentGatewayError) throw error;
    if (controller.signal.aborted) throw new AgentGatewayError("AGENT_REQUEST_ABORTED", "Agent request was cancelled or timed out");
    throw new AgentGatewayError("AGENT_NETWORK_ERROR", "Agent interface is temporarily unreachable");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
