import { DemoAIPlatformAdapter, MockBusinessDataAdapter, type AIPlatformPort, type BusinessDataPort } from "./adapters";

export interface Ag001Dependencies {
  aiPlatform: AIPlatformPort;
  businessData: BusinessDataPort;
  providerName: string;
}

type Ag001ProviderFactory = () => Ag001Dependencies;

const providerFactories = new Map<string, Ag001ProviderFactory>([
  ["demo", () => ({
    aiPlatform: new DemoAIPlatformAdapter(),
    businessData: new MockBusinessDataAdapter(),
    providerName: "demo",
  })],
]);

export function registerAg001Provider(name: string, factory: Ag001ProviderFactory): void {
  providerFactories.set(name, factory);
}

export function resolveAg001Dependencies(providerName = process.env.AG001_PROVIDER ?? "demo"): Ag001Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) throw new Error(`Unknown AG-001 provider: ${providerName}`);
  return factory();
}
