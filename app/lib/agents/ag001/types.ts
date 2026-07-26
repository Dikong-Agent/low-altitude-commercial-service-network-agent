import type { AgentInvokeRequest } from "../../contracts";

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
  useCase: string | null;
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
  intent?: ComparisonIntent;
  candidates?: DemoProduct[];
  evaluations?: ProductEvaluation[];
  comparisonTable?: import("../../contracts").ComparisonTableRow[];
  conflicts?: string[];
  missingData?: string[];
  response?: import("../../contracts").AgentInvokeResponse;
  trace?: Array<{ name: string; detail: string }>;
}

