import type { AgentId, AgentInvokeResponse } from "./contracts";

export interface AgentRunEvent {
  traceId: string;
  requestId?: string;
  agentId: AgentId;
  status: AgentInvokeResponse["status"] | "failed";
  durationMs: number;
  errorCode?: string;
}

export function recordAgentRun(event: AgentRunEvent): void {
  console.info(JSON.stringify({ event: "agent_run", timestamp: new Date().toISOString(), ...event }));
}
