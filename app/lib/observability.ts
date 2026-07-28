import type { AgentId, AgentInvokeResponse } from "./contracts";
import type { AgentVersionSet } from "./agent-runtime-registry";
import type { DependencySpan } from "./reliability";

export interface AgentRunEvent {
  traceId: string;
  requestId?: string;
  agentId: AgentId;
  status: AgentInvokeResponse["status"] | "failed";
  durationMs: number;
  errorCode?: string;
  versions?: AgentVersionSet;
  dependencies?: readonly DependencySpan[];
  internalTrace?: readonly { name: string; detail: string }[];
  tokenUsage?: { input: number; output: number };
  modelCostMicros?: number;
}

export function recordAgentRun(event: AgentRunEvent): void {
  const safeEvent: Partial<AgentRunEvent> = { ...event };
  delete safeEvent.internalTrace;
  console.info(JSON.stringify({ event: "agent_run", timestamp: new Date().toISOString(), ...safeEvent }));
}

export function toClientAgentResponse(response: AgentInvokeResponse, exposeInternalTrace: boolean): AgentInvokeResponse {
  const processingSteps = (response.trace ?? []).map((step) => ({
    name: step.name,
    status: response.status === "needs_review" ? "needs_review" as const : "completed" as const,
  }));
  return {
    ...response,
    processing_steps: processingSteps,
    ...(exposeInternalTrace ? { trace: response.trace } : { trace: undefined }),
  };
}
