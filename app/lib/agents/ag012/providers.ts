import { DependencyUnavailableError } from "../../reliability";
import { DemoAIPlatformAdapter, MockPolicyDataAdapter, type AIPlatformPort, type PolicyDataPort } from "./adapters";
import type { RequestIdentity } from "../../request-identity";
import { createAg012ProductionAdapters } from "../../production-adapters";

export interface Ag012Dependencies {
  aiPlatform: AIPlatformPort;
  policyData: PolicyDataPort;
  providerName: string;
  engine: "langgraph-demo" | "langgraph-adapter";
  environment: "demo" | "production";
}

type Ag012ProviderFactory = (identity?: RequestIdentity) => Ag012Dependencies;

const providerFactories = new Map<string, Ag012ProviderFactory>([
  ["demo", () => ({
    aiPlatform: new DemoAIPlatformAdapter(),
    policyData: new MockPolicyDataAdapter(),
    providerName: "demo",
    engine: "langgraph-demo",
    environment: "demo",
  })],
  ["production", (identity) => ({
    ...createAg012ProductionAdapters(identity), providerName: "production-http", engine: "langgraph-adapter", environment: "production",
  })],
]);
let providerRevision = 0;

export function registerAg012Provider(name: string, factory: Ag012ProviderFactory): void {
  providerFactories.set(name, factory);
  providerRevision += 1;
}

export function getAg012ProviderRevision(): number {
  return providerRevision;
}

export function resolveAg012Dependencies(providerName = process.env.AG012_PROVIDER ?? "demo", identity?: RequestIdentity): Ag012Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) throw new DependencyUnavailableError("ag012.provider", `Unknown AG-012 provider: ${providerName}`);
  return factory(identity);
}
