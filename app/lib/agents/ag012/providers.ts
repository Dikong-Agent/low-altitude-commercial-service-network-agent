import { DependencyUnavailableError } from "../../reliability";
import { DemoAIPlatformAdapter, MockPolicyDataAdapter, type AIPlatformPort, type PolicyDataPort } from "./adapters";

export interface Ag012Dependencies {
  aiPlatform: AIPlatformPort;
  policyData: PolicyDataPort;
  providerName: string;
}

type Ag012ProviderFactory = () => Ag012Dependencies;

const providerFactories = new Map<string, Ag012ProviderFactory>([
  ["demo", () => ({ aiPlatform: new DemoAIPlatformAdapter(), policyData: new MockPolicyDataAdapter(), providerName: "demo" })],
]);
let providerRevision = 0;

export function registerAg012Provider(name: string, factory: Ag012ProviderFactory): void {
  providerFactories.set(name, factory);
  providerRevision += 1;
}

export function getAg012ProviderRevision(): number {
  return providerRevision;
}

export function resolveAg012Dependencies(providerName = process.env.AG012_PROVIDER ?? "demo"): Ag012Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) throw new DependencyUnavailableError("ag012.provider", `Unknown AG-012 provider: ${providerName}`);
  return factory();
}
