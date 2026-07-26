import { z } from "zod/v4";

export const AGENT_INTERFACE_VERSION = "v1.6";
export const MAX_AGENT_INPUT_LENGTH = 2_000;
export const MAX_AGENT_CONTEXT_BYTES = 12_000;

export const AgentIdSchema = z.enum(["AG-001", "AG-002", "AG-003", "AG-012", "AG-025"]);
export type AgentId = z.infer<typeof AgentIdSchema>;

export type AgentAvailability = "runnable" | "preview";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  shortName: string;
  symbol: string;
  tone: "cyan" | "blue" | "violet" | "amber" | "green";
  availability: AgentAvailability;
  description: string;
  capabilities: string[];
  welcome: string;
  demoHint: string;
  prompts: string[];
  workflow: string;
  trace: string[];
  traceNotes: string[];
}

const AgentContextSchema = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_AGENT_CONTEXT_BYTES) {
      context.addIssue({ code: "custom", message: `context must not exceed ${MAX_AGENT_CONTEXT_BYTES} bytes` });
    }
  } catch {
    context.addIssue({ code: "custom", message: "context must be JSON serializable" });
  }
});

export const AgentInvokeRequestSchema = z.object({
  agent_id: AgentIdSchema,
  input: z.string().trim().min(1).max(MAX_AGENT_INPUT_LENGTH),
  session_id: z.string().trim().min(8).max(128).optional(),
  context: AgentContextSchema.optional(),
}).strict();
export type AgentInvokeRequest = z.infer<typeof AgentInvokeRequestSchema>;

export const Ag002ContextSchema = z.object({
  document_id: z.string().trim().min(1).max(128).optional(),
}).passthrough();

export const Ag002InvokeRequestSchema = AgentInvokeRequestSchema.extend({
  agent_id: z.literal("AG-002"),
  context: Ag002ContextSchema.optional(),
});
export type Ag002InvokeRequest = z.infer<typeof Ag002InvokeRequestSchema>;

export const Ag012ContextSchema = z.object({
  as_of_date: z.iso.date().optional(),
  document_ids: z.array(z.string().trim().min(1).max(128)).max(20).optional(),
}).passthrough();

export const Ag012InvokeRequestSchema = AgentInvokeRequestSchema.extend({
  agent_id: z.literal("AG-012"),
  context: Ag012ContextSchema.optional(),
});
export type Ag012InvokeRequest = z.infer<typeof Ag012InvokeRequestSchema>;

export const Ag025ContextSchema = z.object({
  order_id: z.string().trim().min(1).max(64).optional(),
  product_id: z.string().trim().min(1).max(64).optional(),
  user_role: z.enum(["buyer", "seller", "operator", "visitor"]).optional(),
}).passthrough();

export const Ag025InvokeRequestSchema = AgentInvokeRequestSchema.extend({
  agent_id: z.literal("AG-025"),
  context: Ag025ContextSchema.optional(),
});
export type Ag025InvokeRequest = z.infer<typeof Ag025InvokeRequestSchema>;

export const ComparisonIntentViewSchema = z.object({
  product_names: z.array(z.string()),
  use_case: z.string().nullable(),
  use_cases: z.array(z.string()),
  budget_yuan: z.number().nonnegative().nullable(),
  focus_dimensions: z.array(z.string()),
  hard_constraints: z.array(z.string()),
});
export type ComparisonIntentView = z.infer<typeof ComparisonIntentViewSchema>;

export const ComparisonTableRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.string(),
  values: z.array(z.object({
    product_id: z.string(),
    display: z.string(),
    raw: z.union([z.number(), z.string(), z.boolean(), z.null()]),
  })),
  best_product_ids: z.array(z.string()),
});
export type ComparisonTableRow = z.infer<typeof ComparisonTableRowSchema>;

export const ComparedProductViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  score: z.number().min(0).max(100),
  eligible: z.boolean(),
  advantages: z.array(z.string()),
  limitations: z.array(z.string()),
  scenario_fit: z.string(),
});
export type ComparedProductView = z.infer<typeof ComparedProductViewSchema>;

export const AgentComparisonOutputSchema = z.object({
  engine: z.literal("langgraph-demo"),
  intent: ComparisonIntentViewSchema,
  products: z.array(ComparedProductViewSchema),
  table: z.array(ComparisonTableRowSchema),
  recommendation: z.object({
    primary_product_id: z.string().nullable(),
    primary_product_name: z.string().nullable(),
    reason: z.string(),
    alternative_product_ids: z.array(z.string()),
  }),
  conflicts: z.array(z.string()),
  missing_data: z.array(z.string()),
  data_notice: z.string(),
  rule_version: z.string(),
});
export type AgentComparisonOutput = z.infer<typeof AgentComparisonOutputSchema>;

export const ManualTopicSchema = z.enum(["overview", "operation", "safety", "troubleshooting", "terminology", "compliance"]);
export type ManualTopic = z.infer<typeof ManualTopicSchema>;

export const ManualCitationSchema = z.object({
  section_id: z.string(),
  section_title: z.string(),
  location: z.string(),
  excerpt: z.string(),
  relevance: z.number().min(0).max(1),
});
export type ManualCitation = z.infer<typeof ManualCitationSchema>;

export const ManualStepSchema = z.object({
  order: z.number().int().positive(),
  title: z.string(),
  instruction: z.string(),
  condition: z.string().nullable(),
  safety_note: z.string().nullable(),
  source_ref: z.string(),
});
export type ManualStep = z.infer<typeof ManualStepSchema>;

export const ManualRiskMarkerSchema = z.object({
  level: z.enum(["warning", "prohibited", "compliance"]),
  label: z.string(),
  detail: z.string(),
  source_ref: z.string(),
});
export type ManualRiskMarker = z.infer<typeof ManualRiskMarkerSchema>;

export const ManualGlossaryItemSchema = z.object({
  term: z.string(),
  plain_explanation: z.string(),
  source_ref: z.string(),
});
export type ManualGlossaryItem = z.infer<typeof ManualGlossaryItemSchema>;

export const AgentManualOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  document: z.object({
    id: z.string(),
    title: z.string(),
    product_name: z.string(),
    version: z.string(),
    updated_at: z.string(),
    source_type: z.string(),
  }),
  intent: z.object({
    topics: z.array(ManualTopicSchema),
    scenarios: z.array(z.string()),
    terms: z.array(z.string()),
  }),
  answer: z.string(),
  steps: z.array(ManualStepSchema),
  risk_markers: z.array(ManualRiskMarkerSchema),
  glossary: z.array(ManualGlossaryItemSchema),
  citations: z.array(ManualCitationSchema),
  document_structure: z.object({
    chapters: z.number().int().nonnegative(),
    tables: z.number().int().nonnegative(),
    figures: z.number().int().nonnegative(),
    scanned_pages: z.number().int().nonnegative(),
    recognition_mode: z.enum(["demo-preparsed", "ocr-layout", "multimodal-layout"]),
  }),
  capability_coverage: z.array(z.object({
    requirement_id: z.string(),
    capability: z.string(),
    status: z.enum(["mock-demonstrated", "adapter-ready"]),
  })),
  data_notice: z.string(),
  rule_version: z.string(),
});
export type AgentManualOutput = z.infer<typeof AgentManualOutputSchema>;

export const RecommendationModeSchema = z.enum(["scenario_solution", "product_search", "image_search", "c2c_recommendation"]);
export type RecommendationMode = z.infer<typeof RecommendationModeSchema>;

export const RecommendationCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  candidate_type: z.enum(["scenario_solution", "product"]),
  category: z.string(),
  score: z.number().min(0).max(100),
  eligible: z.boolean(),
  price_yuan: z.number().nonnegative(),
  matched_tags: z.array(z.string()),
  limitations: z.array(z.string()),
  request_match: z.boolean(),
  suitable_conditions: z.array(z.string()),
  condition_assessment: z.string(),
  reason: z.string(),
  source: z.string(),
});
export type RecommendationCandidate = z.infer<typeof RecommendationCandidateSchema>;

export const AgentRecommendationOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  mode: RecommendationModeSchema,
  intent: z.object({
    use_cases: z.array(z.string()),
    budget_yuan: z.number().nonnegative().nullable(),
    focus_tags: z.array(z.string()),
    ignored_focus_tags: z.array(z.string()),
    excluded_focus_tags: z.array(z.string()),
    inferred_categories: z.array(z.string()),
    query_terms: z.array(z.string()),
    requested_product_ids: z.array(z.string()),
    corrected_terms: z.array(z.object({ from: z.string(), to: z.string() })),
    experience_level: z.enum(["beginner", "professional", "unspecified"]),
    hard_constraints: z.array(z.string()),
  }),
  solution_candidates: z.array(RecommendationCandidateSchema),
  product_candidates: z.array(RecommendationCandidateSchema),
  recommendation: z.object({
    primary_id: z.string().nullable(),
    primary_name: z.string().nullable(),
    primary_type: z.enum(["scenario_solution", "product"]).nullable(),
    reason: z.string(),
    alternative_ids: z.array(z.string()),
  }),
  gaps: z.array(z.string()),
  missing_data: z.array(z.string()),
  capability_coverage: z.array(z.object({
    requirement_id: z.string(),
    capability: z.string(),
    status: z.enum(["mock-demonstrated", "adapter-ready"]),
  })),
  data_notice: z.string(),
  rule_version: z.string(),
});
export type AgentRecommendationOutput = z.infer<typeof AgentRecommendationOutputSchema>;

export const PolicyModeSchema = z.enum(["policy_summary", "policy_qa", "version_compare", "applicability", "business_impact", "airworthiness"]);
export type PolicyMode = z.infer<typeof PolicyModeSchema>;

export const PolicyTopicSchema = z.enum([
  "scope", "filing", "operation", "operation_safety", "record_retention", "logistics",
  "applicability", "timeliness", "version_status", "business_impact", "airworthiness",
]);
export type PolicyTopic = z.infer<typeof PolicyTopicSchema>;

export const PolicyCitationSchema = z.object({
  document_id: z.string(),
  document_title: z.string(),
  document_number: z.string(),
  version: z.string(),
  locator: z.string(),
  excerpt: z.string(),
  relevance: z.number().min(0).max(1),
  effective_status: z.enum(["effective", "upcoming", "expired"]),
});
export type PolicyCitation = z.infer<typeof PolicyCitationSchema>;

export const AgentPolicyOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  mode: PolicyModeSchema,
  intent: z.object({
    document_types: z.array(z.enum(["policy", "standard", "airworthiness_notice"])),
    topics: z.array(PolicyTopicSchema),
    query_terms: z.array(z.string()),
    jurisdictions: z.array(z.string()),
    subject_types: z.array(z.string()),
    scenarios: z.array(z.string()),
    requested_document_ids: z.array(z.string()),
    as_of_date: z.iso.date(),
  }),
  current_version: z.object({
    document_id: z.string(), title: z.string(), version: z.string(), effective_status: z.enum(["effective", "upcoming", "expired"]),
    as_of_date: z.string(), explanation: z.string(),
  }).nullable(),
  documents: z.array(z.object({
    id: z.string(), title: z.string(), document_number: z.string(), issuer: z.string(), document_type: z.enum(["policy", "standard", "airworthiness_notice"]),
    jurisdiction: z.string(), version: z.string(), published_at: z.string(), effective_from: z.string(), effective_to: z.string().nullable(),
    effective_status: z.enum(["effective", "upcoming", "expired"]), replaces_id: z.string().nullable(), source_type: z.string(),
  })),
  answer: z.string(),
  key_points: z.array(z.string()),
  changes: z.array(z.object({
    id: z.string(), topic: z.string(), change_type: z.enum(["added", "removed", "modified", "moved"]),
    explanation: z.string(), business_impact: z.string(), old_source_ref: z.string(), new_source_ref: z.string(),
  })),
  applicability: z.array(z.object({
    condition: z.string(), assessment: z.enum(["matched", "not_matched", "unknown"]), explanation: z.string(), source_ref: z.string(),
  })),
  citations: z.array(PolicyCitationSchema),
  review_items: z.array(z.string()),
  capability_coverage: z.array(z.object({
    requirement_id: z.string(), capability: z.string(), status: z.enum(["mock-demonstrated", "adapter-ready"]),
  })),
  data_notice: z.string(),
  rule_version: z.string(),
});
export type AgentPolicyOutput = z.infer<typeof AgentPolicyOutputSchema>;

export const CustomerServiceDomainSchema = z.enum(["platform", "product_mall", "flight_service", "technical_service", "commercial_service", "unknown"]);
export const CustomerServiceIssueSchema = z.enum(["general_rule", "product", "order", "after_sales", "service", "complaint", "finance", "credit", "analytics", "violation", "unknown"]);
export const CustomerServiceRouteSchema = z.enum(["knowledge_answer", "business_data", "specialist_agent", "human_handoff", "clarification"]);

export const AgentCustomerServiceOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  intent: z.object({
    domains: z.array(CustomerServiceDomainSchema),
    issue_types: z.array(CustomerServiceIssueSchema),
    route: CustomerServiceRouteSchema,
    confidence: z.number().min(0).max(1),
    entities: z.object({
      order_ids: z.array(z.string()),
      product_models: z.array(z.string()),
      service_types: z.array(z.string()),
    }),
    missing_fields: z.array(z.string()),
  }),
  answer: z.string(),
  knowledge_matches: z.array(z.object({
    id: z.string(), title: z.string(), excerpt: z.string(), source_ref: z.string(), relevance: z.number().min(0).max(1),
  })),
  tool_results: z.array(z.object({
    tool: z.enum(["order_lookup", "product_lookup", "service_lookup"]),
    status: z.enum(["found", "not_found", "not_called"]),
    label: z.string(), value: z.string(), source_ref: z.string(),
  })),
  handoff: z.object({
    required: z.boolean(),
    target_team: z.string().nullable(),
    priority: z.enum(["normal", "high", "urgent"]),
    reason: z.string().nullable(),
    summary: z.string(),
    confirmed_information: z.array(z.string()),
    pending_items: z.array(z.string()),
    execution_status: z.literal("recommendation_only"),
  }),
  capability_coverage: z.array(z.object({
    requirement_id: z.string(), capability: z.string(), status: z.enum(["mock-demonstrated", "adapter-ready"]),
  })),
  data_notice: z.string(),
  rule_version: z.string(),
});
export type AgentCustomerServiceOutput = z.infer<typeof AgentCustomerServiceOutputSchema>;

export const AgentInvokeResponseSchema = z.object({
  request_id: z.string(),
  trace_id: z.string(),
  agent_id: AgentIdSchema,
  status: z.enum(["completed", "needs_review", "needs_clarification", "preview"]),
  environment: z.enum(["demo", "production"]),
  output: z.object({
    title: z.string(),
    summary: z.string(),
    points: z.array(z.string()),
    evidence: z.array(z.string()),
    comparison: AgentComparisonOutputSchema.optional(),
    manual: AgentManualOutputSchema.optional(),
    recommendation: AgentRecommendationOutputSchema.optional(),
    policy: AgentPolicyOutputSchema.optional(),
    customer_service: AgentCustomerServiceOutputSchema.optional(),
  }),
  trace: z.array(z.object({ name: z.string(), detail: z.string() })),
});
export type AgentInvokeResponse = z.infer<typeof AgentInvokeResponseSchema>;
