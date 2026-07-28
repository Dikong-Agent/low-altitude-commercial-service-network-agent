import { capabilityCoverageForAgent } from "../../capability-coverage";

export const AG012_CONFIG = {
  workflowVersion: "1.2.0",
  ruleVersion: "AG-012 政策标准解读规则 v1.2",
  maxEvidence: 10,
  reliability: {
    aiPlatform: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    policyData: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  },
  capabilityCoverage: capabilityCoverageForAgent("AG-012"),
} as const;
