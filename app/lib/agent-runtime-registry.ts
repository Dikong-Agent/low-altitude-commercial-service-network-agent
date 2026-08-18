import type { z } from "zod/v4";
import type { AgentModuleDefinition, AgentModuleVersions } from "./agent-sdk/index.ts";
import { ag001Module } from "./agents/ag001/module.ts";
import { ag012Module } from "./agents/ag012/module.ts";
import { ag025Module } from "./agents/ag025/module.ts";
import { ag027Module } from "./agents/ag027/module.ts";
import type { AgentId, AgentInvokeRequest, AgentInvokeResponse } from "./contracts.ts";
import { AgentInvokeResponseSchema } from "./contracts.ts";
import type { RequestIdentity } from "./request-identity.ts";

export interface AgentAccessPolicy {
  productionRequiresTrustedIdentity: boolean;
  requiredAnyRole: readonly string[];
}

export interface AgentTimeoutPolicy {
  totalTimeoutMs: number;
  maxSynchronousMs: number;
}

export type AgentVersionSet = AgentModuleVersions;

export interface RuntimeAgentDefinition {
  id: AgentId;
  requestSchema: z.ZodType<AgentInvokeRequest>;
  responseSchema: typeof AgentInvokeResponseSchema;
  accessPolicy: AgentAccessPolicy;
  timeoutPolicy: AgentTimeoutPolicy;
  executionMode: "synchronous" | "async-capable";
  versions: AgentVersionSet;
  invoke(request: AgentInvokeRequest, traceId: string, identity: RequestIdentity): Promise<AgentInvokeResponse>;
}

function toRuntimeDefinition<TRequest extends AgentInvokeRequest>(module: AgentModuleDefinition<TRequest>): RuntimeAgentDefinition {
  return {
    ...module,
    requestSchema: module.requestSchema as z.ZodType<AgentInvokeRequest>,
    responseSchema: AgentInvokeResponseSchema,
    invoke: (request, traceId, identity) => module.invoke(module.requestSchema.parse(request), traceId, identity),
  };
}

/**
 * Active engineering scope frozen on 2026-08-17.
 * The full 28-Agent requirement trace remains in project artifacts; only these
 * four engineering examples are deployable through the current Runtime.
 */
const definitions: RuntimeAgentDefinition[] = [
  toRuntimeDefinition(ag001Module),
  toRuntimeDefinition(ag012Module),
  toRuntimeDefinition(ag025Module),
  toRuntimeDefinition(ag027Module),
];

const byId = new Map(definitions.map((definition) => [definition.id, definition]));

export function getRuntimeAgentDefinition(id: string): RuntimeAgentDefinition | undefined {
  return byId.get(id as AgentId);
}

export function listRuntimeAgentDefinitions(): readonly RuntimeAgentDefinition[] {
  return definitions;
}

export function assertAgentAccess(definition: RuntimeAgentDefinition, identity: RequestIdentity): void {
  if (definition.accessPolicy.productionRequiresTrustedIdentity && identity.source !== "trusted-gateway") return;
  const required = definition.accessPolicy.requiredAnyRole;
  if (required.length && !required.some((role) => identity.roles.includes(role))) throw new AgentAccessDeniedError();
}

export class AgentAccessDeniedError extends Error {
  constructor() {
    super("The current identity is not allowed to invoke this Agent");
    this.name = "AgentAccessDeniedError";
  }
}
