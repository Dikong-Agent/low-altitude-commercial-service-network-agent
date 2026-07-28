import { capabilityCoverageForAgent } from "../../capability-coverage";

export const AG002_CONFIG = {
  workflowVersion: "1.2.0",
  ruleVersion: "AG-002 说明书解读规则 v1.2",
  defaultManualId: "DEMO-MANUAL-X8",
  maxSections: 5,
  maxSteps: 8,
  reliability: {
    aiPlatform: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    documentData: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  },
  capabilityCoverage: capabilityCoverageForAgent("AG-002"),
} as const;
