import { DemoAIPlatformAdapter, MockDocumentDataAdapter, type AIPlatformPort, type DocumentDataPort } from "./adapters";
import { DependencyUnavailableError } from "../../reliability";
import type { RequestIdentity } from "../../request-identity";
import { createAg002ProductionAdapters } from "../../production-adapters";

export interface Ag002Dependencies {
  aiPlatform: AIPlatformPort;
  documentData: DocumentDataPort;
  providerName: string;
  engine: "langgraph-demo" | "langgraph-adapter";
  environment: "demo" | "production";
}

type Ag002ProviderFactory = (identity?: RequestIdentity) => Ag002Dependencies;

const providerFactories = new Map<string, Ag002ProviderFactory>([
  ["demo", () => ({
    aiPlatform: new DemoAIPlatformAdapter(),
    documentData: new MockDocumentDataAdapter(),
    providerName: "demo",
    engine: "langgraph-demo",
    environment: "demo",
  })],
  ["production", (identity) => ({
    ...createAg002ProductionAdapters(identity), providerName: "production-http", engine: "langgraph-adapter", environment: "production",
  })],
]);
let providerRevision = 0;

export function registerAg002Provider(name: string, factory: Ag002ProviderFactory): void {
  providerFactories.set(name, factory);
  providerRevision += 1;
}

export function getAg002ProviderRevision(): number {
  return providerRevision;
}

export function resolveAg002Dependencies(providerName = process.env.AG002_PROVIDER ?? "demo", identity?: RequestIdentity): Ag002Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) {
    throw new DependencyUnavailableError("ag002.provider", `Unknown AG-002 provider: ${providerName}`);
  }
  return factory(identity);
}
