import { z } from "zod/v4";
import type { AgentInvokeRequest, RecommendationMode } from "../../contracts";
import type { DemoProduct, HardConstraint } from "../ag001/types";

export interface ScenarioSolution {
  id: string;
  name: string;
  category: string;
  scenario: string;
  summary: string;
  productIds: string[];
  priceYuan: number;
  enduranceMinutes: number;
  windResistanceMps: number;
  payloadKg: number;
  tags: string[];
  suitableConditions: string[];
  limitations: string[];
  source: string;
  updatedAt: string;
}

export interface RecommendationIntent {
  mode: RecommendationMode;
  useCases: string[];
  budgetYuan: number | null;
  focusTags: string[];
  queryTerms: string[];
  correctedTerms: Array<{ from: string; to: string }>;
  experienceLevel: "beginner" | "professional" | "unspecified";
  hardConstraints: HardConstraint[];
  needsClarification: boolean;
  clarificationMessage: string | null;
  adapterMessage: string | null;
}

export interface RecommendationEvaluation {
  id: string;
  name: string;
  candidateType: "scenario_solution" | "product";
  category: string;
  score: number;
  eligible: boolean;
  priceYuan: number;
  matchedTags: string[];
  limitations: string[];
  reason: string;
  source: string;
}

export const ScenarioSolutionSchema = z.object({
  id: z.string(), name: z.string(), category: z.string(), scenario: z.string(), summary: z.string(),
  productIds: z.array(z.string()), priceYuan: z.number(), enduranceMinutes: z.number(), windResistanceMps: z.number(),
  payloadKg: z.number(), tags: z.array(z.string()), suitableConditions: z.array(z.string()), limitations: z.array(z.string()),
  source: z.string(), updatedAt: z.string(),
});

export const RecommendationIntentSchema = z.object({
  mode: z.enum(["scenario_solution", "product_search", "image_search", "c2c_recommendation"]),
  useCases: z.array(z.string()), budgetYuan: z.number().nullable(), focusTags: z.array(z.string()), queryTerms: z.array(z.string()),
  correctedTerms: z.array(z.object({ from: z.string(), to: z.string() })),
  experienceLevel: z.enum(["beginner", "professional", "unspecified"]),
  hardConstraints: z.array(z.object({
    dimension: z.enum(["priceYuan", "enduranceMinutes", "payloadKg", "windResistanceMps", "deliveryDays", "warrantyMonths"]),
    operator: z.enum(["gte", "lte"]), value: z.number(), label: z.string(),
  })),
  needsClarification: z.boolean(), clarificationMessage: z.string().nullable(), adapterMessage: z.string().nullable(),
});

export const RecommendationEvaluationSchema = z.object({
  id: z.string(), name: z.string(), candidateType: z.enum(["scenario_solution", "product"]), category: z.string(),
  score: z.number(), eligible: z.boolean(), priceYuan: z.number(), matchedTags: z.array(z.string()),
  limitations: z.array(z.string()), reason: z.string(), source: z.string(),
});

export interface Ag003Catalog {
  products: DemoProduct[];
  solutions: ScenarioSolution[];
}

export interface Ag003State {
  request: AgentInvokeRequest;
  traceId: string;
  intent?: RecommendationIntent;
  catalog?: Ag003Catalog;
  evaluations?: RecommendationEvaluation[];
  response?: import("../../contracts").AgentInvokeResponse;
  trace?: Array<{ name: string; detail: string }>;
}
