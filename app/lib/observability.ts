import type { AgentId, AgentInvokeResponse } from "./contracts.ts";
import type { AgentVersionSet } from "./agent-runtime-registry.ts";
import type { DependencySpan } from "./reliability.ts";

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

export interface RecordedAgentRun extends Omit<AgentRunEvent, "internalTrace"> { recordedAt: string }

const MAX_RECENT_RUNS = 200;
const recentRuns: RecordedAgentRun[] = [];

export function recordAgentRun(event: AgentRunEvent): void {
  const safeEvent: Partial<AgentRunEvent> = { ...event };
  delete safeEvent.internalTrace;
  const recordedAt = new Date().toISOString();
  recentRuns.unshift({ ...(safeEvent as Omit<AgentRunEvent, "internalTrace">), recordedAt });
  if (recentRuns.length > MAX_RECENT_RUNS) recentRuns.length = MAX_RECENT_RUNS;
  console.info(JSON.stringify({ event: "agent_run", timestamp: recordedAt, ...safeEvent }));
}

export function getAgentRuntimeSnapshot() {
  const durations = recentRuns.map((item) => item.durationMs).sort((left, right) => left - right);
  const p95Index = durations.length ? Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1) : 0;
  return {
    runs: recentRuns.map((item) => ({ ...item, dependencies: item.dependencies?.map((dependency) => ({ ...dependency })) })),
    metrics: {
      total: recentRuns.length,
      succeeded: recentRuns.filter((item) => item.status !== "failed").length,
      failed: recentRuns.filter((item) => item.status === "failed").length,
      needsReview: recentRuns.filter((item) => item.status === "needs_review").length,
      averageDurationMs: recentRuns.length ? Math.round(recentRuns.reduce((sum, item) => sum + item.durationMs, 0) / recentRuns.length) : 0,
      p95DurationMs: durations[p95Index] ?? 0,
    },
  };
}

export function resetAgentRuntimeSnapshotForTests(): void { recentRuns.length = 0; }

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
