import { capabilityCoverageForAgent } from "../../capability-coverage";

export const AG003_CONFIG = {
  ruleVersion: "AG003-RECOMMENDATION-RULES-v1.0",
  maxCandidates: 4,
  reliability: {
    aiPlatform: { timeoutMs: 2_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 20_000 },
    businessData: { timeoutMs: 2_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 20_000 },
  },
  capabilityCoverage: capabilityCoverageForAgent("AG-003"),
} as const;
