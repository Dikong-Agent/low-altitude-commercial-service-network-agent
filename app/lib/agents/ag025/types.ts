import { z } from "zod/v4";
import { CustomerServiceDomainSchema, CustomerServiceIssueSchema, CustomerServiceRouteSchema, CustomerServiceSpecialistAgentSchema } from "../../contracts";

export interface CustomerServiceIntent {
  domains: Array<z.infer<typeof CustomerServiceDomainSchema>>;
  issueTypes: Array<z.infer<typeof CustomerServiceIssueSchema>>;
  route: z.infer<typeof CustomerServiceRouteSchema>;
  confidence: number;
  orderIds: string[];
  productModels: string[];
  serviceTypes: string[];
  missingFields: string[];
  needsClarification: boolean;
  clarificationMessage: string | null;
  explicitHumanRequest: boolean;
  highRiskBoundary: boolean;
  priorContextUsed: boolean;
  conflicts: string[];
  specialistAgentId: z.infer<typeof CustomerServiceSpecialistAgentSchema> | null;
  specialistReason: string | null;
  complaintElements: CustomerComplaintElements | null;
}

export interface CustomerComplaintElements {
  topic: string | null;
  relatedObject: string | null;
  occurredAt: string | null;
  coreRequest: string | null;
}

export interface CustomerAccessScope {
  source: "demo" | "trusted-server";
  tenantId: string | null;
  subjectId: string | null;
  roles: string[];
}

export interface CustomerConversationTurn {
  userInput: string;
  assistantSummary: string;
  status: "completed" | "needs_review" | "needs_clarification" | "preview";
}

export interface CustomerConversationState {
  sessionId: string;
  confirmedOrderIds: string[];
  confirmedProductModels: string[];
  confirmedServiceTypes: string[];
  recentTurns: CustomerConversationTurn[];
}

export interface CustomerServiceKnowledgeEntry {
  id: string;
  title: string;
  domain: z.infer<typeof CustomerServiceDomainSchema>;
  issueType: z.infer<typeof CustomerServiceIssueSchema>;
  answer: string;
  keywords: string[];
  sourceRef: string;
  updatedAt: string;
  checklistItems?: string[];
}

export interface CustomerOrderSnapshot {
  id: string;
  status: "awaiting_payment" | "processing" | "shipped" | "delivered" | "after_sales";
  statusLabel: string;
  productName: string;
  updatedAt: string;
  logisticsSummary: string;
  nextStep: string;
  promisedBy: string | null;
  anomalyReason: string | null;
  sourceRef: string;
}

export interface CustomerProductSnapshot {
  id: string;
  name: string;
  category: string;
  suitableFor: string[];
  purchaseConditions: string[];
  sourceRef: string;
}

export interface CustomerServiceGuide {
  id: string;
  serviceType: string;
  summary: string;
  nextStep: string;
  sourceRef: string;
}

export const CustomerServiceIntentSchema = z.object({
  domains: z.array(CustomerServiceDomainSchema),
  issueTypes: z.array(CustomerServiceIssueSchema),
  route: CustomerServiceRouteSchema,
  confidence: z.number().min(0).max(1),
  orderIds: z.array(z.string()),
  productModels: z.array(z.string()),
  serviceTypes: z.array(z.string()),
  missingFields: z.array(z.string()),
  needsClarification: z.boolean(),
  clarificationMessage: z.string().nullable(),
  explicitHumanRequest: z.boolean(),
  highRiskBoundary: z.boolean(),
  priorContextUsed: z.boolean(),
  conflicts: z.array(z.string()),
  specialistAgentId: CustomerServiceSpecialistAgentSchema.nullable(),
  specialistReason: z.string().nullable(),
  complaintElements: z.object({
    topic: z.string().nullable(),
    relatedObject: z.string().nullable(),
    occurredAt: z.string().nullable(),
    coreRequest: z.string().nullable(),
  }).nullable(),
});

export const CustomerAccessScopeSchema = z.object({
  source: z.enum(["demo", "trusted-server"]),
  tenantId: z.string().nullable(),
  subjectId: z.string().nullable(),
  roles: z.array(z.string()),
});

export const CustomerConversationStateSchema = z.object({
  sessionId: z.string(),
  confirmedOrderIds: z.array(z.string()),
  confirmedProductModels: z.array(z.string()),
  confirmedServiceTypes: z.array(z.string()),
  recentTurns: z.array(z.object({
    userInput: z.string(),
    assistantSummary: z.string(),
    status: z.enum(["completed", "needs_review", "needs_clarification", "preview"]),
  })),
});

export const CustomerServiceKnowledgeEntrySchema = z.object({
  id: z.string(), title: z.string(), domain: CustomerServiceDomainSchema, issueType: CustomerServiceIssueSchema,
  answer: z.string(), keywords: z.array(z.string()), sourceRef: z.string(), updatedAt: z.string(),
  checklistItems: z.array(z.string()).optional(),
});

export const CustomerOrderSnapshotSchema = z.object({
  id: z.string(), status: z.enum(["awaiting_payment", "processing", "shipped", "delivered", "after_sales"]),
  statusLabel: z.string(), productName: z.string(), updatedAt: z.string(), logisticsSummary: z.string(), nextStep: z.string(),
  promisedBy: z.string().nullable(), anomalyReason: z.string().nullable(), sourceRef: z.string(),
});

export const CustomerProductSnapshotSchema = z.object({
  id: z.string(), name: z.string(), category: z.string(), suitableFor: z.array(z.string()),
  purchaseConditions: z.array(z.string()), sourceRef: z.string(),
});

export const CustomerServiceGuideSchema = z.object({
  id: z.string(), serviceType: z.string(), summary: z.string(), nextStep: z.string(), sourceRef: z.string(),
});
