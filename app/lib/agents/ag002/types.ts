import { z } from "zod/v4";
import { ManualTopicSchema, type ManualTopic } from "../../contracts";
import { RagAugmentationSchema, type RagAugmentation } from "../../rag/contracts.ts";

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

export interface ManualDocumentSource {
  id: string;
  title: string;
  productName: string;
  version: string;
  updatedAt: string;
  aliases: string[];
  sourceType: string;
  artifact:
    | { kind: "inline-demo"; mimeType: "application/vnd.jdz.manual+json"; content: string }
    | { kind: "remote-document"; mimeType: string; uri: string; checksum: string | null };
}

export interface ParsedManual {
  id: string;
  title: string;
  productName: string;
  version: string;
  updatedAt: string;
  aliases: string[];
  sourceType: string;
  structure: { chapters: number; tables: number; figures: number; scannedPages: number };
  sections: ManualSourceSection[];
  recognitionMode: "demo-preparsed" | "ocr-layout" | "multimodal-layout";
}

export interface RankedManualSection {
  section: ManualSourceSection;
  relevance: number;
  matchReasons: string[];
  rag?: RagAugmentation;
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

const ManualStructureSchema = z.object({
  chapters: z.number().int().nonnegative(), tables: z.number().int().nonnegative(),
  figures: z.number().int().nonnegative(), scannedPages: z.number().int().nonnegative(),
});

export const DemoManualContentSchema = z.object({
  structure: ManualStructureSchema,
  sections: z.array(ManualSourceSectionSchema),
});

export const DemoManualAssetSchema = z.object({
  id: z.string(), title: z.string(), productName: z.string(), version: z.string(), updatedAt: z.string(), aliases: z.array(z.string()),
  structure: ManualStructureSchema,
  sections: z.array(ManualSourceSectionSchema),
});

export const ManualDocumentSourceSchema = z.object({
  id: z.string(), title: z.string(), productName: z.string(), version: z.string(), updatedAt: z.string(), aliases: z.array(z.string()),
  sourceType: z.string(),
  artifact: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("inline-demo"), mimeType: z.literal("application/vnd.jdz.manual+json"), content: z.string() }),
    z.object({ kind: z.literal("remote-document"), mimeType: z.string(), uri: z.string(), checksum: z.string().nullable() }),
  ]),
});

export const ParsedManualSchema = z.object({
  id: z.string(), title: z.string(), productName: z.string(), version: z.string(), updatedAt: z.string(), aliases: z.array(z.string()),
  sourceType: z.string(), structure: ManualStructureSchema, sections: z.array(ManualSourceSectionSchema),
  recognitionMode: z.enum(["demo-preparsed", "ocr-layout", "multimodal-layout"]),
});

export const RankedManualSectionSchema = z.object({
  section: ManualSourceSectionSchema,
  relevance: z.number().min(0).max(1),
  matchReasons: z.array(z.string()),
  rag: RagAugmentationSchema.optional(),
});
