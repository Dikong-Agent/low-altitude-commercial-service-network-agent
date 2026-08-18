import { z } from "zod/v4";
import type { AgentId } from "../contracts.ts";
import { assertExecutableCommand, type AgentAccessContext, type PortCallOptions, type ToolExecutionCommand, type ToolExecutionResult } from "../runtime-ports.ts";
import { currentAgentTraceId, DependencyUnavailableError } from "../reliability.ts";
import { ProviderResponseEnvelopeSchema, R0_FOUNDATION_VERSION } from "./contracts.ts";
import type { AIPlatformPort, BusinessActionPort, BusinessDataPort, KnowledgeSearchPort, PlatformCall } from "./platform-ports.ts";

type UpstreamKind = "ai-platform" | "knowledge-search" | "business-data" | "business-action";
const MAX_RESPONSE_BYTES = 2_000_000;

function configPrefix(kind: UpstreamKind): string {
  return ({ "ai-platform": "JDZ_AI_PLATFORM", "knowledge-search": "JDZ_KNOWLEDGE_SEARCH", "business-data": "JDZ_BUSINESS_DATA", "business-action": "JDZ_BUSINESS_ACTION" })[kind];
}

function requiredConfig(kind: UpstreamKind): { baseUrl: URL; token: string } {
  const prefix = configPrefix(kind);
  const rawUrl = process.env[`${prefix}_BASE_URL`]?.trim();
  const token = process.env[`${prefix}_AUTH_TOKEN`]?.trim();
  if (!rawUrl || !token || token.length < 16) throw new DependencyUnavailableError(`r0.${kind}.config`, `${kind} provider is not configured`, { retryable: false });
  let baseUrl: URL;
  try { baseUrl = new URL(rawUrl); } catch (error) { throw new DependencyUnavailableError(`r0.${kind}.config`, `${kind} base URL is invalid`, { cause: error, retryable: false }); }
  if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) throw new DependencyUnavailableError(`r0.${kind}.config`, `${kind} base URL must use HTTPS`, { retryable: false });
  return { baseUrl, token };
}

class HttpPortClient {
  private readonly kind: UpstreamKind;
  constructor(kind: UpstreamKind) { this.kind = kind; }
  async call<TResult>(call: PlatformCall, schema: z.ZodType<TResult>, access: AgentAccessContext, options?: PortCallOptions): Promise<TResult> {
    const { baseUrl, token } = requiredConfig(this.kind);
    const url = new URL(`/v1/agent-ports/${call.agentId.toLowerCase()}/${this.kind}/${encodeURIComponent(call.operation)}`, baseUrl);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST", signal: options?.signal, cache: "no-store",
        headers: {
          "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json",
          "X-JDZ-Foundation-Version": R0_FOUNDATION_VERSION, "X-JDZ-Tenant-Id": access.tenantId,
          "X-JDZ-Subject-Id": access.subjectId, "X-JDZ-Roles": [...access.roles].sort().join(","), "X-JDZ-Purpose": access.purpose,
          ...(currentAgentTraceId() ? { "X-Trace-Id": currentAgentTraceId()! } : {}),
        },
        body: JSON.stringify({ contract_version: R0_FOUNDATION_VERSION, trace_id: currentAgentTraceId() ?? "unscoped", tenant_id: access.tenantId, subject_id: access.subjectId, agent_id: call.agentId, operation: call.operation, data: call.payload }),
      });
    } catch (error) { throw new DependencyUnavailableError(`r0.${this.kind}`, `${this.kind} request failed`, { cause: error }); }
    if (!response.ok) throw new DependencyUnavailableError(`r0.${this.kind}`, `${this.kind} returned HTTP ${response.status}`, { retryable: response.status === 408 || response.status === 429 || response.status >= 500 });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new DependencyUnavailableError(`r0.${this.kind}`, `${this.kind} response is too large`);
    let unknown: unknown;
    try {
      const text = await response.text(); if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) throw new Error("response too large"); unknown = JSON.parse(text);
    } catch (error) { throw new DependencyUnavailableError(`r0.${this.kind}`, `${this.kind} returned invalid JSON`, { cause: error }); }
    const envelope = ProviderResponseEnvelopeSchema.safeParse(unknown);
    if (!envelope.success || envelope.data.meta.tenant_id !== access.tenantId) throw new DependencyUnavailableError(`r0.${this.kind}`, `${this.kind} response envelope is invalid`);
    if (this.kind !== "ai-platform" && envelope.data.meta.source_ids.length === 0) throw new DependencyUnavailableError(`r0.${this.kind}`, `${this.kind} response is missing source provenance`);
    if (envelope.data.meta.classification === "restricted" && !access.roles.includes("restricted-data-reader")) throw new DependencyUnavailableError(`r0.${this.kind}`, "Current identity cannot access restricted upstream data", { retryable: false });
    const parsed = schema.safeParse(envelope.data.data);
    if (!parsed.success) throw new DependencyUnavailableError(`r0.${this.kind}`, `${this.kind} response violates the port schema`, { cause: parsed.error, retryable: false });
    return parsed.data;
  }
}

export class HttpAIPlatformPort implements AIPlatformPort {
  readonly portKind = "ai-platform" as const; private readonly client = new HttpPortClient(this.portKind);
  invoke<TResult>(call: PlatformCall, schema: z.ZodType<TResult>, access: AgentAccessContext, options?: PortCallOptions) { return this.client.call(call, schema, access, options); }
}
export class HttpKnowledgeSearchPort implements KnowledgeSearchPort {
  readonly portKind = "knowledge-search" as const; private readonly client = new HttpPortClient(this.portKind);
  search<TResult>(call: PlatformCall<{ query: string; filters?: Record<string, unknown>; topK?: number }>, schema: z.ZodType<TResult>, access: AgentAccessContext, options?: PortCallOptions) { return this.client.call(call, schema, access, options); }
}
export class HttpBusinessDataPort implements BusinessDataPort {
  readonly portKind = "business-data" as const; private readonly client = new HttpPortClient(this.portKind);
  query<TResult>(call: PlatformCall, schema: z.ZodType<TResult>, access: AgentAccessContext, options?: PortCallOptions) { return this.client.call(call, schema, access, options); }
}
export class HttpBusinessActionPort implements BusinessActionPort {
  readonly portKind = "business-action" as const; private readonly client = new HttpPortClient(this.portKind);
  execute<TPayload, TResult>(agentId: AgentId, command: ToolExecutionCommand<TPayload>, access: AgentAccessContext, options?: PortCallOptions): Promise<ToolExecutionResult<TResult>> {
    assertExecutableCommand(command);
    const resultSchema = z.object({ status: z.enum(["suggested", "executed", "rejected"]), result: z.unknown().optional(), reason: z.string().optional() });
    return this.client.call({ agentId, operation: command.tool, payload: command }, resultSchema, access, options) as Promise<ToolExecutionResult<TResult>>;
  }
}
