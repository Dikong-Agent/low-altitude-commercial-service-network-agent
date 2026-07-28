import { z } from "zod/v4";
import type { RequestIdentity } from "./request-identity";
import { productionClients } from "./production-http";
import type { AIPlatformPort as Ag001AI, BusinessDataPort as Ag001Data } from "./agents/ag001/adapters";
import { ComparisonIntentSchema, DemoProductSchema } from "./agents/ag001/types";
import type { AIPlatformPort as Ag002AI, DocumentDataPort as Ag002Data } from "./agents/ag002/adapters";
import { ManualDocumentSourceSchema, ManualIntentSchema, ParsedManualSchema, RankedManualSectionSchema } from "./agents/ag002/types";
import type { AIPlatformPort as Ag003AI, BusinessDataPort as Ag003Data } from "./agents/ag003/adapters";
import { RecommendationIntentSchema, ScenarioSolutionSchema } from "./agents/ag003/types";
import type { AIPlatformPort as Ag012AI, PolicyDataPort as Ag012Data } from "./agents/ag012/adapters";
import { DemoPolicyDocumentSchema, PolicyIntentSchema, RankedPolicyEvidenceSchema } from "./agents/ag012/types";
import type { AIPlatformPort as Ag025AI, CustomerServiceDataPort } from "./agents/ag025/adapters";
import {
  CustomerOrderSnapshotSchema,
  CustomerProductSnapshotSchema,
  CustomerServiceGuideSchema,
  CustomerServiceIntentSchema,
  CustomerServiceKnowledgeEntrySchema,
} from "./agents/ag025/types";

export function createAg001ProductionAdapters(identity: RequestIdentity | undefined): { aiPlatform: Ag001AI; businessData: Ag001Data } {
  const { ai, data } = productionClients(identity);
  return {
    aiPlatform: {
      portKind: "ai-platform",
      capabilities: ["understanding"],
      understandComparisonRequest: (request, options) => ai.call("AG-001", "understand-comparison-request", { request }, ComparisonIntentSchema, options?.signal),
    },
    businessData: {
      portKind: "domain-data",
      domain: "product",
      listProducts: (options) => data.call("AG-001", "list-products", {}, z.array(DemoProductSchema), options?.signal),
      getProducts: (ids, options) => data.call("AG-001", "get-products", { ids }, z.array(DemoProductSchema), options?.signal),
    },
  };
}

export function createAg002ProductionAdapters(identity: RequestIdentity | undefined): { aiPlatform: Ag002AI; documentData: Ag002Data } {
  const { ai, data } = productionClients(identity);
  return {
    aiPlatform: {
      portKind: "ai-platform",
      capabilities: ["understanding", "retrieval", "ocr", "multimodal"],
      understandManualRequest: (request, options) => ai.call("AG-002", "understand-manual-request", { request }, ManualIntentSchema, options?.signal),
      parseManualDocument: (document, options) => ai.call("AG-002", "parse-manual-document", { document }, ParsedManualSchema, options?.signal),
      retrieveManualEvidence: (document, intent, query, options) => ai.call("AG-002", "retrieve-manual-evidence", { document, intent, query }, z.array(RankedManualSectionSchema), options?.signal),
    },
    documentData: {
      portKind: "domain-data",
      domain: "document",
      listDocuments: (options) => data.call("AG-002", "list-documents", {}, z.array(ManualDocumentSourceSchema), options?.signal),
      getDocument: (id, options) => data.call("AG-002", "get-document", { id }, ManualDocumentSourceSchema.nullable(), options?.signal),
    },
  };
}

export function createAg003ProductionAdapters(identity: RequestIdentity | undefined): { aiPlatform: Ag003AI; businessData: Ag003Data } {
  const { ai, data } = productionClients(identity);
  return {
    aiPlatform: {
      portKind: "ai-platform",
      capabilities: ["understanding"],
      understandRecommendationRequest: (request, options) => ai.call("AG-003", "understand-recommendation-request", { request }, RecommendationIntentSchema, options?.signal),
    },
    businessData: {
      portKind: "domain-data",
      domain: "product",
      listProducts: (options) => data.call("AG-003", "list-products", {}, z.array(DemoProductSchema), options?.signal),
      listScenarioSolutions: (options) => data.call("AG-003", "list-scenario-solutions", {}, z.array(ScenarioSolutionSchema), options?.signal),
    },
  };
}

export function createAg012ProductionAdapters(identity: RequestIdentity | undefined): { aiPlatform: Ag012AI; policyData: Ag012Data } {
  const { ai, data } = productionClients(identity);
  return {
    aiPlatform: {
      portKind: "ai-platform",
      capabilities: ["understanding", "retrieval", "reranking"],
      understandPolicyRequest: (request, options) => ai.call("AG-012", "understand-policy-request", { request }, PolicyIntentSchema, options?.signal),
      retrievePolicyEvidence: (documents, intent, query, options) => ai.call("AG-012", "retrieve-policy-evidence", { documents, intent, query }, z.array(RankedPolicyEvidenceSchema), options?.signal),
    },
    policyData: {
      portKind: "domain-data",
      domain: "policy",
      searchDocuments: (search, options) => data.call("AG-012", "search-documents", { search }, z.array(DemoPolicyDocumentSchema), options?.signal),
      getDocuments: (ids, options) => data.call("AG-012", "get-documents", { ids }, z.array(DemoPolicyDocumentSchema), options?.signal),
      getVersionChains: (chainIds, options) => data.call("AG-012", "get-version-chains", { chain_ids: chainIds }, z.array(DemoPolicyDocumentSchema), options?.signal),
    },
  };
}

export function createAg025ProductionAdapters(identity: RequestIdentity | undefined): {
  aiPlatform: Ag025AI;
  customerData: CustomerServiceDataPort;
} {
  const { ai, data } = productionClients(identity);
  return {
    aiPlatform: {
      portKind: "ai-platform",
      capabilities: ["understanding", "retrieval", "reranking", "generation"],
      understandCustomerRequest: (request, conversation, options) => ai.call("AG-025", "understand-customer-request", { request, conversation }, CustomerServiceIntentSchema, options?.signal),
      rankCustomerKnowledge: (entries, intent, query, options) => ai.call("AG-025", "rank-customer-knowledge", { entries, intent, query }, z.array(z.object({ entry: CustomerServiceKnowledgeEntrySchema, relevance: z.number().min(0).max(1) })), options?.signal),
    },
    customerData: {
      portKind: "domain-data",
      domain: "customer-service",
      searchKnowledge: (intent, query, limit, options) => data.call("AG-025", "search-knowledge", { intent, query, limit }, z.array(CustomerServiceKnowledgeEntrySchema), options?.signal),
      getOrders: (ids, accessScope, options) => data.call("AG-025", "get-orders", { ids, access_scope: accessScope }, z.array(CustomerOrderSnapshotSchema), options?.signal),
      findProducts: (models, accessScope, options) => data.call("AG-025", "find-products", { models, access_scope: accessScope }, z.array(CustomerProductSnapshotSchema), options?.signal),
      getServiceGuides: (serviceTypes, accessScope, options) => data.call("AG-025", "get-service-guides", { service_types: serviceTypes, access_scope: accessScope }, z.array(CustomerServiceGuideSchema), options?.signal),
    },
  };
}
