import type { AgentInvokeRequest } from "../../contracts";
import { z } from "zod/v4";

export type NumericDimension =
  | "priceYuan"
  | "enduranceMinutes"
  | "payloadKg"
  | "windResistanceMps"
  | "deliveryDays"
  | "warrantyMonths";

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
  ingressProtection: string;
  operatingTemperature: string;
  deliveryDays: number;
  warrantyMonths: number;
  trainingIncluded: boolean;
  source: string;
  updatedAt: string;
}

export interface HardConstraint {
  dimension: NumericDimension;
  operator: "gte" | "lte";
  value: number;
  label: string;
}

export interface ComparisonIntent {
  requestedProductIds: string[];
  useCases: string[];
  budgetYuan: number | null;
  focusDimensions: NumericDimension[];
  hardConstraints: HardConstraint[];
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
  "priceYuan", "enduranceMinutes", "payloadKg", "windResistanceMps", "deliveryDays", "warrantyMonths",
]);

export const DemoProductSchema = z.object({
  id: z.string(), name: z.string(), aliases: z.array(z.string()), category: z.string(), description: z.string(),
  scenarios: z.array(z.string()), priceYuan: z.number(), enduranceMinutes: z.number(), payloadKg: z.number(),
  windResistanceMps: z.number(), ingressProtection: z.string(), operatingTemperature: z.string(),
  deliveryDays: z.number(), warrantyMonths: z.number(), trainingIncluded: z.boolean(), source: z.string(), updatedAt: z.string(),
});

export const HardConstraintSchema = z.object({
  dimension: NumericDimensionSchema,
  operator: z.enum(["gte", "lte"]),
  value: z.number(),
  label: z.string(),
});

export const ComparisonIntentSchema = z.object({
  requestedProductIds: z.array(z.string()),
  useCases: z.array(z.string()),
  budgetYuan: z.number().nullable(),
  focusDimensions: z.array(NumericDimensionSchema),
  hardConstraints: z.array(HardConstraintSchema),
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
});
