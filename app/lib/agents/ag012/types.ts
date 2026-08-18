import { z } from "zod/v4";
import { RagAugmentationSchema, type RagAugmentation } from "../../rag/contracts.ts";
import { PolicyModeSchema, PolicyTopicSchema, type PolicyMode, type PolicyTopic } from "../../contracts";

export interface PolicyIntent {
  mode: PolicyMode;
  documentTypes: Array<"policy" | "standard" | "airworthiness_notice">;
  topics: PolicyTopic[];
  queryTerms: string[];
  jurisdictions: string[];
  subjectTypes: string[];
  scenarios: string[];
  requestedDocumentIds: string[];
  requestedLocators: string[];
  realWorldJurisdiction: boolean;
  asOfDate: string;
  needsClarification: boolean;
  clarificationMessage: string | null;
}

export interface PolicySourceSection {
  id: string;
  heading: string;
  locator: string;
  text: string;
  plainLanguage: string;
  topics: PolicyTopic[];
  keywords: string[];
  appliesTo: string[];
  scenarios: string[];
  referencedLocators?: string[];
}

export interface PolicyVersionChange {
  id: string;
  topic: string;
  changeType: "added" | "removed" | "modified" | "moved";
  oldSectionId: string;
  newSectionId: string;
  explanation: string;
  businessImpact: string;
}

export interface DemoPolicyDocument {
  id: string;
  title: string;
  documentNumber: string;
  issuer: string;
  documentType: "policy" | "standard" | "airworthiness_notice";
  jurisdiction: string;
  version: string;
  publishedAt: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  versionChainId: string;
  replacesId: string | null;
  aliases: string[];
  sourceType: string;
  sourceUrl: string | null;
  sections: PolicySourceSection[];
  versionChanges: PolicyVersionChange[];
}

export interface RankedPolicyEvidence {
  document: DemoPolicyDocument;
  section: PolicySourceSection;
  relevance: number;
  matchReasons: string[];
  rag?: RagAugmentation;
}

export const PolicyIntentSchema = z.object({
  mode: PolicyModeSchema,
  documentTypes: z.array(z.enum(["policy", "standard", "airworthiness_notice"])),
  topics: z.array(PolicyTopicSchema),
  queryTerms: z.array(z.string()),
  jurisdictions: z.array(z.string()),
  subjectTypes: z.array(z.string()),
  scenarios: z.array(z.string()),
  requestedDocumentIds: z.array(z.string()),
  requestedLocators: z.array(z.string()).default([]),
  realWorldJurisdiction: z.boolean().default(false),
  asOfDate: z.iso.date(),
  needsClarification: z.boolean(),
  clarificationMessage: z.string().nullable(),
});

export const PolicySourceSectionSchema = z.object({
  id: z.string(), heading: z.string(), locator: z.string(), text: z.string(), plainLanguage: z.string(),
  topics: z.array(PolicyTopicSchema), keywords: z.array(z.string()), appliesTo: z.array(z.string()), scenarios: z.array(z.string()),
  referencedLocators: z.array(z.string()).default([]),
});

export const PolicyVersionChangeSchema = z.object({
  id: z.string(), topic: z.string(), changeType: z.enum(["added", "removed", "modified", "moved"]),
  oldSectionId: z.string(), newSectionId: z.string(), explanation: z.string(), businessImpact: z.string(),
});

export const DemoPolicyDocumentSchema = z.object({
  id: z.string(), title: z.string(), documentNumber: z.string(), issuer: z.string(),
  documentType: z.enum(["policy", "standard", "airworthiness_notice"]), jurisdiction: z.string(), version: z.string(),
  publishedAt: z.string(), effectiveFrom: z.string(), effectiveTo: z.string().nullable(), versionChainId: z.string(),
  replacesId: z.string().nullable(), aliases: z.array(z.string()), sourceType: z.string(), sourceUrl: z.string().nullable(),
  sections: z.array(PolicySourceSectionSchema), versionChanges: z.array(PolicyVersionChangeSchema),
});

export const RankedPolicyEvidenceSchema = z.object({
  document: DemoPolicyDocumentSchema,
  section: PolicySourceSectionSchema,
  relevance: z.number().min(0).max(1),
  matchReasons: z.array(z.string()),
  rag: RagAugmentationSchema.optional(),
});
