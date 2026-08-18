import type { AgentInvokeRequest } from "../../contracts";
import { z } from "zod/v4";

export type NumericDimension =
  | "priceYuan"
  | "enduranceMinutes"
  | "payloadKg"
  | "windResistanceMps"
  | "maxOperatingAltitudeM"
  | "deliveryDays"
  | "warrantyMonths";

export type RequestedFeatureKey = "ingressProtection" | "capability";

export interface ProductSourceRecord {
  id: string;
  title: string;
  version: string;
  updatedAt: string;
  content: string;
}

export interface DemoProduct {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  description: string;
  scenarios: string[];
  priceYuan: number;
  enduranceMinutes: number;
  payloadKg: number;
  windResistanceMps: number;
  maxOperatingAltitudeM: number | null;
  ingressProtection: string;
  operatingTemperature: string;
  deliveryDays: number;
  warrantyMonths: number;
  trainingIncluded: boolean;
  capabilities: string[];
  useLimitations: string[];
  sourceRecords: ProductSourceRecord[];
  source: string;
  updatedAt: string;
}

export interface HardConstraint {
  dimension: NumericDimension;
  operator: "gte" | "lte";
  value: number;
  label: string;
}

export interface RequestedFeature {
  key: RequestedFeatureKey;
  operator: "eq" | "gte" | "contains";
  value: string;
  label: string;
}

export interface ComparisonIntent {
  requestedProductIds: string[];
  useCases: string[];
  budgetYuan: number | null;
  focusDimensions: NumericDimension[];
  hardConstraints: HardConstraint[];
  requestedFeatures: RequestedFeature[];
  unverifiedConditions: string[];
  inputConflicts: string[];
  decisionRequested: boolean;
  needsClarification: boolean;
  clarificationMessage: string | null;
}

export interface ProductEvaluation {
  product: DemoProduct;
  score: number;
  eligible: boolean;
  constraintFailures: string[];
  advantages: string[];
  limitations: string[];
  scenarioFit: string;
  constraintChecks: Array<{
    label: string;
    passed: boolean;
    actual: string;
    determination: "passed" | "failed" | "needs_review";
    evidenceStatus: "verified" | "master_only" | "conflict" | "missing";
  }>;
  capabilityProfile: {
    performance: string[];
    costAndService: string[];
    applicableScenarios: string[];
    usageLimits: string[];
    evidenceRefs: string[];
  };
  scoreBreakdown: {
    hardConstraintPassed: number;
    hardConstraintTotal: number;
    scenarioScore: number;
    preferenceScore: number;
    total: number;
    explanation: string[];
  };
}

export interface Ag001State {
  request: AgentInvokeRequest;
  traceId: string;
  intent?: ComparisonIntent;
  candidates?: DemoProduct[];
  evaluations?: ProductEvaluation[];
  comparisonTable?: import("../../contracts").ComparisonTableRow[];
  conflicts?: string[];
  missingData?: string[];
  response?: import("../../contracts").AgentInvokeResponse;
  trace?: Array<{ name: string; detail: string }>;
}

export const NumericDimensionSchema = z.enum([
  "priceYuan", "enduranceMinutes", "payloadKg", "windResistanceMps", "maxOperatingAltitudeM", "deliveryDays", "warrantyMonths",
]);

export const DemoProductSchema = z.object({
  id: z.string(), name: z.string(), aliases: z.array(z.string()), category: z.string(), description: z.string(),
  scenarios: z.array(z.string()), priceYuan: z.number(), enduranceMinutes: z.number(), payloadKg: z.number(),
  windResistanceMps: z.number(), ingressProtection: z.string(), operatingTemperature: z.string(),
  maxOperatingAltitudeM: z.number().nullable(),
  deliveryDays: z.number(), warrantyMonths: z.number(), trainingIncluded: z.boolean(),
  capabilities: z.array(z.string()).default([]),
  useLimitations: z.array(z.string()).default([]),
  sourceRecords: z.array(z.object({ id: z.string(), title: z.string(), version: z.string(), updatedAt: z.string(), content: z.string() })).default([]),
  source: z.string(), updatedAt: z.string(),
});

export const HardConstraintSchema = z.object({
  dimension: NumericDimensionSchema,
  operator: z.enum(["gte", "lte"]),
  value: z.number(),
  label: z.string(),
});

export const RequestedFeatureSchema = z.object({
  key: z.enum(["ingressProtection", "capability"]),
  operator: z.enum(["eq", "gte", "contains"]),
  value: z.string(),
  label: z.string(),
});

export const ComparisonIntentSchema = z.object({
  requestedProductIds: z.array(z.string()),
  useCases: z.array(z.string()),
  budgetYuan: z.number().nullable(),
  focusDimensions: z.array(NumericDimensionSchema),
  hardConstraints: z.array(HardConstraintSchema),
  requestedFeatures: z.array(RequestedFeatureSchema).default([]),
  unverifiedConditions: z.array(z.string()).default([]),
  inputConflicts: z.array(z.string()).default([]),
  decisionRequested: z.boolean().default(false),
  needsClarification: z.boolean(),
  clarificationMessage: z.string().nullable(),
});

export const ProductEvaluationSchema = z.object({
  product: DemoProductSchema,
  score: z.number(),
  eligible: z.boolean(),
  constraintFailures: z.array(z.string()),
  advantages: z.array(z.string()),
  limitations: z.array(z.string()),
  scenarioFit: z.string(),
  constraintChecks: z.array(z.object({
    label: z.string(), passed: z.boolean(), actual: z.string(),
    determination: z.enum(["passed", "failed", "needs_review"]),
    evidenceStatus: z.enum(["verified", "master_only", "conflict", "missing"]),
  })),
  capabilityProfile: z.object({
    performance: z.array(z.string()), costAndService: z.array(z.string()),
    applicableScenarios: z.array(z.string()), usageLimits: z.array(z.string()), evidenceRefs: z.array(z.string()),
  }),
  scoreBreakdown: z.object({
    hardConstraintPassed: z.number().int().nonnegative(), hardConstraintTotal: z.number().int().nonnegative(),
    scenarioScore: z.number().nonnegative(), preferenceScore: z.number().nonnegative(), total: z.number().min(0).max(100),
    explanation: z.array(z.string()),
  }),
});
