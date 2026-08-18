import type { NumericDimension } from "./types";
import { capabilityCoverageForAgent } from "../../capability-coverage";

export const AG001_CONFIG = {
  workflowVersion: "1.4.0",
  ruleVersion: "AG-001 约束驱动选型与证据质量规则 v1.4",
  maxCandidates: 3,
  reliability: {
    aiPlatform: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    businessData: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  },
  capabilityCoverage: capabilityCoverageForAgent("AG-001"),
  scoring: {
    base: 10,
    focusWeight: 45,
    scenarioAll: 40,
    scenarioPartial: 15,
    scenarioNone: 0,
    noScenario: 20,
    ineligibleCap: 49,
  },
  defaultFocus: {
    园区巡检: ["enduranceMinutes", "deliveryDays", "windResistanceMps", "priceYuan"],
    山区巡检: ["windResistanceMps", "payloadKg", "maxOperatingAltitudeM", "enduranceMinutes"],
    电力巡检: ["windResistanceMps", "enduranceMinutes", "payloadKg"],
    应急保障: ["payloadKg", "windResistanceMps", "deliveryDays"],
    物资投送: ["payloadKg", "windResistanceMps", "enduranceMinutes"],
    测绘: ["enduranceMinutes", "priceYuan", "deliveryDays"],
    轻量航拍: ["priceYuan", "enduranceMinutes", "deliveryDays"],
  } satisfies Record<string, NumericDimension[]>,
} as const;
