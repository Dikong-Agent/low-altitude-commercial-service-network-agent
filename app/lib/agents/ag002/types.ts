import { z } from "zod/v4";
import { ManualTopicSchema, type ManualTopic } from "../../contracts";

export interface ManualIntent {
  manualId: string;
  topics: ManualTopic[];
  scenarios: string[];
  terms: string[];
  needsClarification: boolean;
  clarificationMessage: string | null;
}

export interface ManualSourceStep {
  title: string;
  instruction: string;
  condition: string | null;
  safetyNote: string | null;
}

export interface ManualSourceRisk {
  level: "warning" | "prohibited" | "compliance";
  label: string;
  detail: string;
}

export interface ManualSourceGlossaryItem {
  term: string;
  aliases: string[];
  plainExplanation: string;
}

export interface ManualSourceSection {
  id: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  topics: ManualTopic[];
  scenarios: string[];
  text: string;
  plainLanguage: string;
  imageCaptions: string[];
  steps: ManualSourceStep[];
  risks: ManualSourceRisk[];
  glossary: ManualSourceGlossaryItem[];
}

export interface DemoManualAsset {
  id: string;
  title: string;
  productName: string;
  version: string;
  updatedAt: string;
  aliases: string[];
  structure: { chapters: number; tables: number; figures: number; scannedPages: number };
  sections: ManualSourceSection[];
}

export interface ParsedManual extends DemoManualAsset {
  recognitionMode: "demo-preparsed";
}

export interface RankedManualSection {
  section: ManualSourceSection;
  relevance: number;
}

export const ManualIntentSchema = z.object({
  manualId: z.string(),
  topics: z.array(ManualTopicSchema),
  scenarios: z.array(z.string()),
  terms: z.array(z.string()),
  needsClarification: z.boolean(),
  clarificationMessage: z.string().nullable(),
});

const ManualSourceStepSchema = z.object({
  title: z.string(), instruction: z.string(), condition: z.string().nullable(), safetyNote: z.string().nullable(),
});

const ManualSourceRiskSchema = z.object({
  level: z.enum(["warning", "prohibited", "compliance"]), label: z.string(), detail: z.string(),
});

const ManualSourceGlossaryItemSchema = z.object({
  term: z.string(), aliases: z.array(z.string()), plainExplanation: z.string(),
});

export const ManualSourceSectionSchema = z.object({
  id: z.string(), title: z.string(), pageStart: z.number().int().positive(), pageEnd: z.number().int().positive(),
  topics: z.array(ManualTopicSchema), scenarios: z.array(z.string()), text: z.string(), plainLanguage: z.string(),
  imageCaptions: z.array(z.string()), steps: z.array(ManualSourceStepSchema), risks: z.array(ManualSourceRiskSchema),
  glossary: z.array(ManualSourceGlossaryItemSchema),
});

export const DemoManualAssetSchema = z.object({
  id: z.string(), title: z.string(), productName: z.string(), version: z.string(), updatedAt: z.string(), aliases: z.array(z.string()),
  structure: z.object({ chapters: z.number().int(), tables: z.number().int(), figures: z.number().int(), scannedPages: z.number().int() }),
  sections: z.array(ManualSourceSectionSchema),
});

export const ParsedManualSchema = DemoManualAssetSchema.extend({ recognitionMode: z.literal("demo-preparsed") });

export const RankedManualSectionSchema = z.object({ section: ManualSourceSectionSchema, relevance: z.number().min(0).max(1) });

