import { capabilityCoverageForAgent } from "../../capability-coverage";

export const AG012_CONFIG = {
  workflowVersion: "1.4.0",
  ruleVersion: "AG-012 政策对象隔离、交叉引用核验与办理清单规则 v1.4",
  maxEvidence: 10,
  reliability: {
    aiPlatform: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    ragGeneration: { timeoutMs: 12_000, maxAttempts: 1, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    policyData: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  },
  capabilityCoverage: capabilityCoverageForAgent("AG-012"),
} as const;
