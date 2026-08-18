import type { z } from "zod/v4";
import type { AgentId } from "../contracts";
import type { AgentAccessContext, PortCallOptions, ToolExecutionCommand, ToolExecutionResult } from "../runtime-ports";
import type { HumanReviewCallback, HumanReviewSubmission, HumanReviewView } from "./contracts";

export interface PlatformCall<TPayload = unknown> { agentId: AgentId; operation: string; payload: TPayload }

export interface AIPlatformPort {
  readonly portKind: "ai-platform";
  invoke<TResult>(call: PlatformCall, schema: z.ZodType<TResult>, access: AgentAccessContext, options?: PortCallOptions): Promise<TResult>;
}
export interface KnowledgeSearchPort {
  readonly portKind: "knowledge-search";
  search<TResult>(call: PlatformCall<{ query: string; filters?: Record<string, unknown>; topK?: number }>, schema: z.ZodType<TResult>, access: AgentAccessContext, options?: PortCallOptions): Promise<TResult>;
}
export interface BusinessDataPort {
  readonly portKind: "business-data";
  query<TResult>(call: PlatformCall, schema: z.ZodType<TResult>, access: AgentAccessContext, options?: PortCallOptions): Promise<TResult>;
}
export interface BusinessActionPort {
  readonly portKind: "business-action";
  execute<TPayload, TResult>(agentId: AgentId, command: ToolExecutionCommand<TPayload>, access: AgentAccessContext, options?: PortCallOptions): Promise<ToolExecutionResult<TResult>>;
}
export interface HumanReviewPort {
  readonly portKind: "human-review";
  submit(request: HumanReviewSubmission, access: AgentAccessContext): Promise<HumanReviewView>;
  get(reviewId: string, access: AgentAccessContext): Promise<HumanReviewView | null>;
  resolve(reviewId: string, decision: HumanReviewCallback, access: AgentAccessContext): Promise<HumanReviewView>;
}
export interface TaskQueuePort { readonly portKind: "task-queue"; enqueue(message: { taskId: string }): Promise<void> }
export interface AuditStorePort<TEvent = unknown> { readonly portKind: "audit-store"; record(event: TEvent, access: AgentAccessContext): Promise<void> }
export interface R0FoundationPorts {
  ai: AIPlatformPort; knowledge: KnowledgeSearchPort; data: BusinessDataPort; action: BusinessActionPort;
  review: HumanReviewPort; tasks: TaskQueuePort; audit: AuditStorePort;
}
