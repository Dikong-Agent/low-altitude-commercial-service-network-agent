import type { AgentInvokeRequest, AgentInvokeResponse } from "./contracts";

const AGENT_API_BASE = process.env.NEXT_PUBLIC_AGENT_API_BASE || "/api";
export const BUSINESS_DATA_API_BASE = process.env.NEXT_PUBLIC_DATA_API_BASE || "/api/data";

export async function invokeAgent(request: AgentInvokeRequest): Promise<AgentInvokeResponse> {
  const response = await fetch(`${AGENT_API_BASE}/agents/${request.agent_id}/invoke`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Agent interface failed: ${response.status}`);
  return response.json() as Promise<AgentInvokeResponse>;
}

export async function queryBusinessData(resource: string, query: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  const response = await fetch(`${BUSINESS_DATA_API_BASE}/${resource}?${params.toString()}`);
  if (!response.ok) throw new Error(`Business data interface failed: ${response.status}`);
  return response.json();
}
