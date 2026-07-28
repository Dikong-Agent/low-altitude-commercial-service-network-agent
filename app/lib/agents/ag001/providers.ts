import { DemoAIPlatformAdapter, MockBusinessDataAdapter, type AIPlatformPort, type BusinessDataPort } from "./adapters";
import { DependencyUnavailableError } from "../../reliability";
import type { RequestIdentity } from "../../request-identity";
import { createAg001ProductionAdapters } from "../../production-adapters";

export interface Ag001Dependencies {
  aiPlatform: AIPlatformPort;
  businessData: BusinessDataPort;
  providerName: string;
  engine: "langgraph-demo" | "langgraph-adapter";
  environment: "demo" | "production";
}

type Ag001ProviderFactory = (identity?: RequestIdentity) => Ag001Dependencies;

const providerFactories = new Map<string, Ag001ProviderFactory>([
  ["demo", () => ({
    aiPlatform: new DemoAIPlatformAdapter(),
    businessData: new MockBusinessDataAdapter(),
    providerName: "demo",
    engine: "langgraph-demo",
    environment: "demo",
  })],
  ["production", (identity) => ({
    ...createAg001ProductionAdapters(identity),
    providerName: "production-http",
    engine: "langgraph-adapter",
    environment: "production",
  })],
]);
let providerRevision = 0;

export function registerAg001Provider(name: string, factory: Ag001ProviderFactory): void {
  providerFactories.set(name, factory);
  providerRevision += 1;
}

export function getAg001ProviderRevision(): number {
  return providerRevision;
}

export function resolveAg001Dependencies(providerName = process.env.AG001_PROVIDER ?? "demo", identity?: RequestIdentity): Ag001Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) throw new DependencyUnavailableError("ag001.provider", `Unknown AG-001 provider: ${providerName}`);
  return factory(identity);
}
