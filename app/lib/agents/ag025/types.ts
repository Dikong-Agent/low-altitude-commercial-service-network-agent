import { z } from "zod/v4";
import { CustomerServiceDomainSchema, CustomerServiceIssueSchema, CustomerServiceRouteSchema } from "../../contracts";

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
}

export interface CustomerOrderSnapshot {
  id: string;
  status: "awaiting_payment" | "processing" | "shipped" | "delivered" | "after_sales";
  statusLabel: string;
  productName: string;
  updatedAt: string;
  logisticsSummary: string;
  nextStep: string;
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
});

export const CustomerServiceKnowledgeEntrySchema = z.object({
  id: z.string(), title: z.string(), domain: CustomerServiceDomainSchema, issueType: CustomerServiceIssueSchema,
  answer: z.string(), keywords: z.array(z.string()), sourceRef: z.string(), updatedAt: z.string(),
});

export const CustomerOrderSnapshotSchema = z.object({
  id: z.string(), status: z.enum(["awaiting_payment", "processing", "shipped", "delivered", "after_sales"]),
  statusLabel: z.string(), productName: z.string(), updatedAt: z.string(), logisticsSummary: z.string(), nextStep: z.string(), sourceRef: z.string(),
});

export const CustomerProductSnapshotSchema = z.object({
  id: z.string(), name: z.string(), category: z.string(), suitableFor: z.array(z.string()),
  purchaseConditions: z.array(z.string()), sourceRef: z.string(),
});

export const CustomerServiceGuideSchema = z.object({
  id: z.string(), serviceType: z.string(), summary: z.string(), nextStep: z.string(), sourceRef: z.string(),
});
