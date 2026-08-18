import { DemoAIPlatformAdapter, InMemoryAnalysisConversationAdapter, MockAnalyticsDataAdapter, type AIPlatformPort, type AnalysisAccessScope, type AnalysisConversationPort, type AnalyticsDataPort } from "./adapters";
import { createAg027ProductionAdapters } from "../../production-adapters";
import type { RequestIdentity } from "../../request-identity";
import { DependencyUnavailableError } from "../../reliability";
export interface Ag027Dependencies { aiPlatform: AIPlatformPort; analyticsData: AnalyticsDataPort; conversationData: AnalysisConversationPort; accessScope: AnalysisAccessScope; providerName: string; engine: "langgraph-demo" | "langgraph-adapter"; environment: "demo" | "production"; }
const demoConversations = new InMemoryAnalysisConversationAdapter();
export function resolveAg027Dependencies(name = process.env.AG027_PROVIDER ?? "demo", identity?: RequestIdentity): Ag027Dependencies {
  const accessScope: AnalysisAccessScope = identity ?? { source: "demo", tenantId: "DEMO-TENANT", subjectId: "DEMO-VISITOR", roles: ["visitor"] };
  if (name === "demo") return { aiPlatform: new DemoAIPlatformAdapter(), analyticsData: new MockAnalyticsDataAdapter(), conversationData: demoConversations, accessScope, providerName: "demo", engine: "langgraph-demo", environment: "demo" };
  if (name === "production") return { ...createAg027ProductionAdapters(identity), accessScope, providerName: "production-http", engine: "langgraph-adapter", environment: "production" };
  throw new DependencyUnavailableError("ag027.provider", `Unknown AG-027 provider: ${name}`);
}
