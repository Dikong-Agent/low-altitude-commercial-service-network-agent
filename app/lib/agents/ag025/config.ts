import { capabilityCoverageForAgent } from "../../capability-coverage";

export const AG025_CONFIG = {
  workflowVersion: "1.1.0",
  ruleVersion: "AG-025 多意图客服路由规则 v1.1",
  maxKnowledgeMatches: 4,
  reliability: {
    aiPlatform: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    customerData: { timeoutMs: 2_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  },
  capabilityCoverage: capabilityCoverageForAgent("AG-025"),
} as const;
