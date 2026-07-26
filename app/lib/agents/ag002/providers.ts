import { DemoAIPlatformAdapter, MockDocumentDataAdapter, type AIPlatformPort, type DocumentDataPort } from "./adapters";
import { DependencyUnavailableError } from "../../reliability";

export interface Ag002Dependencies {
  aiPlatform: AIPlatformPort;
  documentData: DocumentDataPort;
  providerName: string;
}

type Ag002ProviderFactory = () => Ag002Dependencies;

const providerFactories = new Map<string, Ag002ProviderFactory>([
  ["demo", () => ({
    aiPlatform: new DemoAIPlatformAdapter(),
    documentData: new MockDocumentDataAdapter(),
    providerName: "demo",
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

export function resolveAg002Dependencies(providerName = process.env.AG002_PROVIDER ?? "demo"): Ag002Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) {
    throw new DependencyUnavailableError("ag002.provider", `Unknown AG-002 provider: ${providerName}`);
  }
  return factory();
}
