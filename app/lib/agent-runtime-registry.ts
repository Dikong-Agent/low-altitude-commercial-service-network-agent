import type { z } from "zod/v4";
import {
  Ag002InvokeRequestSchema,
  Ag012InvokeRequestSchema,
  Ag025InvokeRequestSchema,
  AgentInvokeRequestSchema,
  AgentInvokeResponseSchema,
  type AgentId,
  type AgentInvokeRequest,
  type AgentInvokeResponse,
} from "./contracts";
import { invokeAg001 } from "./agents/ag001/workflow";
import { invokeAg002 } from "./agents/ag002/workflow";
import { invokeAg003 } from "./agents/ag003/workflow";
import { invokeAg012 } from "./agents/ag012/workflow";
import { invokeAg025 } from "./agents/ag025/workflow";
import { customerAccessScopeFromIdentity } from "./agents/ag025/providers";
import { AG001_CONFIG } from "./agents/ag001/config";
import { AG002_CONFIG } from "./agents/ag002/config";
import { AG003_CONFIG } from "./agents/ag003/config";
import { AG012_CONFIG } from "./agents/ag012/config";
import { AG025_CONFIG } from "./agents/ag025/config";
import type { RequestIdentity } from "./request-identity";

export interface AgentAccessPolicy {
  productionRequiresTrustedIdentity: boolean;
  requiredAnyRole: readonly string[];
}

export interface AgentTimeoutPolicy {
  totalTimeoutMs: number;
  maxSynchronousMs: number;
}

export interface AgentVersionSet {
  capability: string;
  workflow: string;
  prompt: string;
  rule: string;
  model: string;
}

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

const commonAccessPolicy: AgentAccessPolicy = {
  productionRequiresTrustedIdentity: true,
  requiredAnyRole: [],
};

const commonTimeoutPolicy: AgentTimeoutPolicy = { totalTimeoutMs: 25_000, maxSynchronousMs: 15_000 };
const ag001RequestSchema = AgentInvokeRequestSchema.extend({ agent_id: AgentInvokeRequestSchema.shape.agent_id.extract(["AG-001"]) });
const ag003RequestSchema = AgentInvokeRequestSchema.extend({ agent_id: AgentInvokeRequestSchema.shape.agent_id.extract(["AG-003"]) });

const definitions: RuntimeAgentDefinition[] = [
  {
    id: "AG-001",
    requestSchema: ag001RequestSchema,
    responseSchema: AgentInvokeResponseSchema,
    accessPolicy: commonAccessPolicy,
    timeoutPolicy: commonTimeoutPolicy,
    executionMode: "synchronous",
    versions: { capability: "AG-001@1.2", workflow: AG001_CONFIG.workflowVersion, prompt: "structured-intent@1", rule: AG001_CONFIG.ruleVersion, model: "upstream-managed" },
    invoke: (request, traceId, identity) => invokeAg001(request, traceId, identity),
  },
  {
    id: "AG-002",
    requestSchema: Ag002InvokeRequestSchema,
    responseSchema: AgentInvokeResponseSchema,
    accessPolicy: commonAccessPolicy,
    timeoutPolicy: { totalTimeoutMs: 40_000, maxSynchronousMs: 15_000 },
    executionMode: "async-capable",
    versions: { capability: "AG-002@1.1", workflow: AG002_CONFIG.workflowVersion, prompt: "manual-grounding@1", rule: AG002_CONFIG.ruleVersion, model: "upstream-managed" },
    invoke: (request, traceId, identity) => invokeAg002(request, traceId, identity),
  },
  {
    id: "AG-003",
    requestSchema: ag003RequestSchema,
    responseSchema: AgentInvokeResponseSchema,
    accessPolicy: commonAccessPolicy,
    timeoutPolicy: commonTimeoutPolicy,
    executionMode: "synchronous",
    versions: { capability: "AG-003@1.0", workflow: "1.0.0", prompt: "recommendation-intent@1", rule: AG003_CONFIG.ruleVersion, model: "upstream-managed" },
    invoke: (request, traceId, identity) => invokeAg003(request, traceId, identity),
  },
  {
    id: "AG-012",
    requestSchema: Ag012InvokeRequestSchema,
    responseSchema: AgentInvokeResponseSchema,
    accessPolicy: commonAccessPolicy,
    timeoutPolicy: { totalTimeoutMs: 35_000, maxSynchronousMs: 15_000 },
    executionMode: "async-capable",
    versions: { capability: "AG-012@1.1", workflow: AG012_CONFIG.workflowVersion, prompt: "policy-grounding@1", rule: AG012_CONFIG.ruleVersion, model: "upstream-managed" },
    invoke: (request, traceId, identity) => invokeAg012(Ag012InvokeRequestSchema.parse(request), traceId, identity),
  },
  {
    id: "AG-025",
    requestSchema: Ag025InvokeRequestSchema,
    responseSchema: AgentInvokeResponseSchema,
    accessPolicy: commonAccessPolicy,
    timeoutPolicy: commonTimeoutPolicy,
    executionMode: "synchronous",
    versions: { capability: "AG-025@1.0", workflow: AG025_CONFIG.workflowVersion, prompt: "customer-routing@1", rule: AG025_CONFIG.ruleVersion, model: "upstream-managed" },
    invoke: (request, traceId, identity) => invokeAg025(Ag025InvokeRequestSchema.parse(request), traceId, customerAccessScopeFromIdentity(identity), identity),
  },
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
  if (required.length && !required.some((role) => identity.roles.includes(role))) {
    throw new AgentAccessDeniedError();
  }
}

export class AgentAccessDeniedError extends Error {
  constructor() {
    super("The current identity is not allowed to invoke this Agent");
    this.name = "AgentAccessDeniedError";
  }
}
