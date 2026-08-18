import type { z } from "zod/v4";
import type { AgentId, AgentInvokeRequest, AgentInvokeResponse } from "../contracts.ts";
import type { RequestIdentity } from "../request-identity.ts";
import { accessContextFromIdentity } from "../runtime-ports.ts";
import type { R0FoundationPorts } from "../r0/platform-ports.ts";

export interface AgentModuleVersions { capability: string; workflow: string; prompt: string; rule: string; model: string }
export interface AgentModuleDefinition<TRequest extends AgentInvokeRequest = AgentInvokeRequest> {
  id: AgentId;
  requestSchema: z.ZodType<TRequest>;
  responseSchema: z.ZodType<AgentInvokeResponse>;
  accessPolicy: { productionRequiresTrustedIdentity: boolean; requiredAnyRole: readonly string[] };
  timeoutPolicy: { totalTimeoutMs: number; maxSynchronousMs: number };
  executionMode: "synchronous" | "async-capable";
  versions: AgentModuleVersions;
  invoke(request: TRequest, traceId: string, identity: RequestIdentity): Promise<AgentInvokeResponse>;
}

/** R0 Agent module boundary, independent from HTTP, persistence and deployment frameworks. */
export function defineAgentModule<TRequest extends AgentInvokeRequest>(definition: AgentModuleDefinition<TRequest>): AgentModuleDefinition<TRequest> {
  if (definition.timeoutPolicy.maxSynchronousMs > definition.timeoutPolicy.totalTimeoutMs) throw new Error(`${definition.id}: maxSynchronousMs must not exceed totalTimeoutMs`);
  for (const [key, version] of Object.entries(definition.versions)) if (!version.trim()) throw new Error(`${definition.id}: ${key} version is required`);
  if (!definition.accessPolicy.requiredAnyRole.length) throw new Error(`${definition.id}: at least one production role is required`);
  return Object.freeze(definition);
}

export function agentProviderEnvironmentKey(agentId: AgentId): string { return `${agentId.replace("-", "")}_PROVIDER`; }

export interface LegacyBackedAgentModuleOptions<TRequest extends AgentInvokeRequest> {
  definition: Omit<AgentModuleDefinition<TRequest>, "invoke">;
  ports: R0FoundationPorts;
  invokeLegacy(request: TRequest, traceId: string, identity: RequestIdentity): Promise<AgentInvokeResponse>;
  reviewReason(response: AgentInvokeResponse): string;
}

/**
 * R0 migration bridge for the six retained engineering examples.
 * It keeps the proven business workflow while enforcing the R0 module contract
 * and turning every `needs_review` response into a real review item.
 */
export function defineLegacyBackedAgentModule<TRequest extends AgentInvokeRequest>(options: LegacyBackedAgentModuleOptions<TRequest>): AgentModuleDefinition<TRequest> {
  return defineAgentModule({
    ...options.definition,
    async invoke(request, traceId, identity) {
      const response = options.definition.responseSchema.parse(await options.invokeLegacy(request, traceId, identity));
      if (response.status !== "needs_review") return response;
      const review = await options.ports.review.submit({
        agent_id: response.agent_id,
        trace_id: response.trace_id,
        reason: options.reviewReason(response),
        evidence: response.output.evidence.slice(0, 50),
        proposed_action: "由具备相应业务权限的人员核验依据、补充信息并确认后续处理。",
      }, accessContextFromIdentity(identity));
      return options.definition.responseSchema.parse({
        ...response,
        output: {
          ...response.output,
          review_request: {
            review_id: review.review_id,
            status: review.status,
            reason: review.reason,
            expires_at: review.expires_at,
          },
        },
      });
    },
  });
}
