import type { RequestIdentity } from "./request-identity";

export type AIPlatformCapability = "understanding" | "generation" | "retrieval" | "reranking" | "ocr" | "multimodal";
export type DomainKind = "product" | "document" | "policy" | "customer-service" | "conversation" | "maintenance" | "flight-knowledge" | "flight-service" | "product-content" | "order-progress" | "insurance" | "writing-material" | "intelligence-content" | "contract" | "analytics" | "user-feature" | "content-recommendation" | "public-opinion" | "precision-recommendation";

/** Trusted context shared by every Agent port. It is created by the runtime, never by the browser. */
export interface AgentAccessContext {
  source: RequestIdentity["source"];
  tenantId: string;
  subjectId: string;
  roles: readonly string[];
  purpose: "agent-invocation";
}

export interface PortCallOptions {
  signal?: AbortSignal;
}

export interface CommonAIPlatformPort {
  readonly portKind: "ai-platform";
  readonly capabilities: readonly AIPlatformCapability[];
}

export interface CommonDomainDataPort {
  readonly portKind: "domain-data";
  readonly domain: DomainKind;
}

export type ToolExecutionMode = "suggest" | "execute";

export interface ToolExecutionCommand<TPayload = unknown> {
  tool: string;
  mode: ToolExecutionMode;
  payload: TPayload;
  idempotencyKey?: string;
  approvalToken?: string;
}

export interface ToolExecutionResult<TResult = unknown> {
  status: "suggested" | "executed" | "rejected";
  result?: TResult;
  reason?: string;
}

/**
 * Business actions are deliberately separate from read-only domain ports.
 * An execution request must carry both an approval token and an idempotency key.
 */
export interface ToolExecutionPort {
  readonly portKind: "tool-execution";
  execute<TPayload, TResult>(
    command: ToolExecutionCommand<TPayload>,
    access: AgentAccessContext,
    options?: PortCallOptions,
  ): Promise<ToolExecutionResult<TResult>>;
}

export function accessContextFromIdentity(identity: RequestIdentity): AgentAccessContext {
  return {
    source: identity.source,
    tenantId: identity.tenantId,
    subjectId: identity.subjectId,
    roles: [...identity.roles],
    purpose: "agent-invocation",
  };
}

export function assertExecutableCommand(command: ToolExecutionCommand): void {
  if (command.mode === "execute" && (!command.approvalToken || !command.idempotencyKey)) {
    throw new Error("Executing a business action requires approvalToken and idempotencyKey");
  }
}
