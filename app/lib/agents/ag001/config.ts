import type { NumericDimension } from "./types";

export const AG001_CONFIG = {
  workflowVersion: "1.2.0",
  ruleVersion: "AG-001 场景比较规则 v1.2",
  maxCandidates: 3,
  reliability: {
    aiPlatform: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    businessData: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  },
  scoring: {
    base: 20,
    focusWeight: 60,
    scenarioAll: 20,
    scenarioPartial: 10,
    scenarioNone: 0,
    noScenario: 10,
    ineligibleCap: 49,
  },
  defaultFocus: {
    园区巡检: ["enduranceMinutes", "deliveryDays", "windResistanceMps", "priceYuan"],
    山区巡检: ["windResistanceMps", "payloadKg", "enduranceMinutes"],
    电力巡检: ["windResistanceMps", "enduranceMinutes", "payloadKg"],
    应急保障: ["payloadKg", "windResistanceMps", "deliveryDays"],
    物资投送: ["payloadKg", "windResistanceMps", "enduranceMinutes"],
    测绘: ["enduranceMinutes", "priceYuan", "deliveryDays"],
    轻量航拍: ["priceYuan", "enduranceMinutes", "deliveryDays"],
  } satisfies Record<string, NumericDimension[]>,
} as const;
