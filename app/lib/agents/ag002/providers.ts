import { DemoAIPlatformAdapter, MockDocumentDataAdapter, type AIPlatformPort, type DocumentDataPort } from "./adapters";

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

export function registerAg002Provider(name: string, factory: Ag002ProviderFactory): void {
  providerFactories.set(name, factory);
}

export function resolveAg002Dependencies(providerName = process.env.AG002_PROVIDER ?? "demo"): Ag002Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) throw new Error(`Unknown AG-002 provider: ${providerName}`);
  return factory();
}

