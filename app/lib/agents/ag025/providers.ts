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

export interface Ag025Dependencies {
  aiPlatform: AIPlatformPort;
  customerData: CustomerServiceDataPort;
  conversationData: CustomerConversationPort;
  providerName: string;
  engine: "langgraph-demo" | "langgraph-adapter";
  environment: "demo" | "production";
}

type Ag025ProviderFactory = (identity?: RequestIdentity) => Ag025Dependencies;

const providerFactories = new Map<string, Ag025ProviderFactory>([
  ["demo", () => ({
    aiPlatform: new DemoAIPlatformAdapter(),
    customerData: new MockCustomerServiceDataAdapter(),
    conversationData: new DemoCustomerConversationAdapter(),
    providerName: "demo",
    engine: "langgraph-demo",
    environment: "demo",
  })],
  ["production", (identity) => ({
    ...createAg025ProductionAdapters(identity),
    conversationData: new D1CustomerConversationAdapter(),
    providerName: "production-http", engine: "langgraph-adapter", environment: "production",
  })],
]);
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
