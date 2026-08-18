import { capabilityCoverageForAgent } from "../../capability-coverage";

export const AG025_CONFIG = {
  workflowVersion: "1.3.0",
  ruleVersion: "AG-025 客服接待、风险复核与人工接续规则 v1.3",
  maxKnowledgeMatches: 5,
  reliability: {
    aiPlatform: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    ragGeneration: { timeoutMs: 12_000, maxAttempts: 1, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    customerData: { timeoutMs: 2_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  },
  capabilityCoverage: capabilityCoverageForAgent("AG-025"),
} as const;
