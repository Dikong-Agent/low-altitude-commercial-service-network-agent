import { DependencyUnavailableError } from "../../reliability";
import { DemoAIPlatformAdapter, MockBusinessDataAdapter, type AIPlatformPort, type BusinessDataPort } from "./adapters";
import type { RequestIdentity } from "../../request-identity";
import { createAg003ProductionAdapters } from "../../production-adapters";

export interface Ag003Dependencies {
  aiPlatform: AIPlatformPort;
  businessData: BusinessDataPort;
  providerName: string;
  engine: "langgraph-demo" | "langgraph-adapter";
  environment: "demo" | "production";
}

type Ag003ProviderFactory = (identity?: RequestIdentity) => Ag003Dependencies;
const providerFactories = new Map<string, Ag003ProviderFactory>([["demo", () => ({
  aiPlatform: new DemoAIPlatformAdapter(), businessData: new MockBusinessDataAdapter(), providerName: "demo", engine: "langgraph-demo", environment: "demo",
})], ["production", (identity) => ({
  ...createAg003ProductionAdapters(identity), providerName: "production-http", engine: "langgraph-adapter", environment: "production",
})]]);
let providerRevision = 0;

export function registerAg003Provider(name: string, factory: Ag003ProviderFactory): void {
  providerFactories.set(name, factory);
  providerRevision += 1;
}

export function getAg003ProviderRevision(): number {
  return providerRevision;
}

export function resolveAg003Dependencies(providerName = process.env.AG003_PROVIDER ?? "demo", identity?: RequestIdentity): Ag003Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) throw new DependencyUnavailableError("ag003.provider", `Unknown AG-003 provider: ${providerName}`);
  return factory(identity);
}
