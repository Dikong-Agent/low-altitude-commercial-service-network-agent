import { DependencyUnavailableError } from "../../reliability";
import { DemoAIPlatformAdapter, MockCustomerServiceDataAdapter, type AIPlatformPort, type CustomerServiceDataPort } from "./adapters";

export interface Ag025Dependencies {
  aiPlatform: AIPlatformPort;
  customerData: CustomerServiceDataPort;
  providerName: string;
  engine: "langgraph-demo" | "langgraph-adapter";
  environment: "demo" | "production";
}

type Ag025ProviderFactory = () => Ag025Dependencies;

const providerFactories = new Map<string, Ag025ProviderFactory>([
  ["demo", () => ({
    aiPlatform: new DemoAIPlatformAdapter(),
    customerData: new MockCustomerServiceDataAdapter(),
    providerName: "demo",
    engine: "langgraph-demo",
    environment: "demo",
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

export function resolveAg025Dependencies(providerName = process.env.AG025_PROVIDER ?? "demo"): Ag025Dependencies {
  const factory = providerFactories.get(providerName);
  if (!factory) throw new DependencyUnavailableError("ag025.provider", `Unknown AG-025 provider: ${providerName}`);
  return factory();
}
