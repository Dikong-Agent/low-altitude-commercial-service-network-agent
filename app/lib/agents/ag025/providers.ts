import { DependencyUnavailableError } from "../../reliability";
import {
  DemoAIPlatformAdapter,
  DemoCustomerConversationAdapter,
  MockCustomerServiceDataAdapter,
  type AIPlatformPort,
  type CustomerConversationPort,
  type CustomerServiceDataPort,
} from "./adapters";
import type { CustomerAccessScope } from "./types";
import type { RequestIdentity } from "../../request-identity";
import { createAg025ProductionAdapters } from "../../production-adapters";
import { D1CustomerConversationAdapter } from "../../durable-state";
import { invokeAg001 } from "../ag001/workflow";
import { invokeAg012 } from "../ag012/workflow";
import { invokeAg027 } from "../ag027/workflow";
import type { AgentInvokeRequest, AgentInvokeResponse } from "../../contracts";

export interface SpecialistAgentPort {
  invoke(request: AgentInvokeRequest, traceId: string): Promise<AgentInvokeResponse>;
}

export interface Ag025Dependencies {
  aiPlatform: AIPlatformPort;
  customerData: CustomerServiceDataPort;
  conversationData: CustomerConversationPort;
  specialistAgent: SpecialistAgentPort;
  providerName: string;
  engine: "langgraph-demo" | "langgraph-adapter";
  environment: "demo" | "production";
}

type Ag025ProviderFactory = (identity?: RequestIdentity) => Ag025Dependencies;

const providerFactories = new Map<string, Ag025ProviderFactory>([
  ["demo", (identity) => ({
    aiPlatform: new DemoAIPlatformAdapter(),
    customerData: new MockCustomerServiceDataAdapter(),
    conversationData: new DemoCustomerConversationAdapter(),
    specialistAgent: { invoke: (request, traceId) => invokeSpecialist(request, traceId, identity) },
    providerName: "demo",
    engine: "langgraph-demo",
    environment: "demo",
  })],
  ["production", (identity) => ({
    ...createAg025ProductionAdapters(identity),
    conversationData: new D1CustomerConversationAdapter(),
    specialistAgent: { invoke: (request, traceId) => invokeSpecialist(request, traceId, identity) },
    providerName: "production-http", engine: "langgraph-adapter", environment: "production",
  })],
]);

function invokeSpecialist(request: AgentInvokeRequest, traceId: string, identity?: RequestIdentity): Promise<AgentInvokeResponse> {
  switch (request.agent_id) {
    case "AG-001": return invokeAg001({ ...request, agent_id: "AG-001" }, traceId, identity);
    case "AG-012": return invokeAg012({ ...request, agent_id: "AG-012" }, traceId, identity);
    case "AG-027": return invokeAg027(request, traceId, identity);
    default: throw new DependencyUnavailableError("ag025.specialist-agent", `Unsupported AG-025 specialist target: ${request.agent_id}`);
  }
}
let providerRevision = 0;

export function registerAg025Provider(name: string, factory: Ag025ProviderFactory): void {
  providerFactories.set(name, factory);
  providerRevision += 1;
}

export function getAg025ProviderRevision(): number {
  return providerRevision;
}

export function resolveAg025Dependencies(providerName = process.env.AG025_PROVIDER ?? "demo", identity?: RequestIdentity): Ag025Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) throw new DependencyUnavailableError("ag025.provider", `Unknown AG-025 provider: ${providerName}`);
  return factory(identity);
}

export function customerAccessScopeFromIdentity(identity: RequestIdentity): CustomerAccessScope {
  return {
    source: identity.source === "demo" ? "demo" : "trusted-server",
    tenantId: identity.tenantId,
    subjectId: identity.subjectId,
    roles: [...identity.roles],
  };
}
