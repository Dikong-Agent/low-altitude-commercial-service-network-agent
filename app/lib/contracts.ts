import { z } from "zod/v4";

export const AGENT_INTERFACE_VERSION = "v2.0";
export const MAX_AGENT_INPUT_LENGTH = 2_000;
export const MAX_AGENT_CONTEXT_BYTES = 12_000;

export const AgentIdSchema = z.enum(["AG-001", "AG-002", "AG-003", "AG-004", "AG-005", "AG-006", "AG-007", "AG-008", "AG-009", "AG-010", "AG-012", "AG-013", "AG-014", "AG-015", "AG-016", "AG-017", "AG-018", "AG-019", "AG-020", "AG-023", "AG-025", "AG-026", "AG-027", "AG-028"]);
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

export const CapabilityCoverageItemSchema = z.object({
  function_id: z.string().regex(/^F-\d{4}$/),
  source_requirement_id: z.string().regex(/^\d+$/),
  capability: z.string().min(1),
  status: z.enum(["mock-demonstrated", "adapter-ready"]),
});

export const Ag002ContextSchema = z.object({
  document_id: z.string().trim().min(1).max(128).optional(),
}).passthrough();

export const Ag002InvokeRequestSchema = AgentInvokeRequestSchema.extend({
  agent_id: z.literal("AG-002"),
  context: Ag002ContextSchema.optional(),
});
export type Ag002InvokeRequest = z.infer<typeof Ag002InvokeRequestSchema>;

export const Ag001InvokeRequestSchema = AgentInvokeRequestSchema.extend({
  agent_id: z.literal("AG-001"),
});
export type Ag001InvokeRequest = z.infer<typeof Ag001InvokeRequestSchema>;

export const Ag003InvokeRequestSchema = AgentInvokeRequestSchema.extend({
  agent_id: z.literal("AG-003"),
});
export type Ag003InvokeRequest = z.infer<typeof Ag003InvokeRequestSchema>;

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
  as_of_date: z.iso.date().optional(),
}).strict();

export const Ag025InvokeRequestSchema = AgentInvokeRequestSchema.extend({
  agent_id: z.literal("AG-025"),
  context: Ag025ContextSchema.optional(),
});
export type Ag025InvokeRequest = z.infer<typeof Ag025InvokeRequestSchema>;

export const Ag007ContextSchema = z.object({
  sku_id: z.string().trim().min(1).max(64).optional(),
  as_of: z.string().trim().min(1).max(40).optional(),
  target_tenant_id: z.string().trim().min(1).max(64).optional(),
}).passthrough();
export const Ag007InvokeRequestSchema = AgentInvokeRequestSchema.extend({ agent_id: z.literal("AG-007"), context: Ag007ContextSchema.optional() });

export const Ag023ContextSchema = z.object({
  task_id: z.string().trim().min(1).max(64).optional(), task_type: z.string().trim().min(1).max(64).optional(),
  geofence: z.string().trim().min(1).max(128).optional(), start_time: z.string().trim().min(1).max(40).optional(),
  end_time: z.string().trim().min(1).max(40).optional(), payload_weight: z.number().nonnegative().optional(),
}).passthrough();
export const Ag023InvokeRequestSchema = AgentInvokeRequestSchema.extend({ agent_id: z.literal("AG-023"), context: Ag023ContextSchema.optional() });

export const Ag027ContextSchema = z.object({
  metric_id: z.string().trim().min(1).max(64).optional(), role: z.string().trim().min(1).max(64).optional(),
  as_of: z.string().trim().min(1).max(40).optional(),
}).passthrough();
export const Ag027InvokeRequestSchema = AgentInvokeRequestSchema.extend({ agent_id: z.literal("AG-027"), context: Ag027ContextSchema.optional() });

export const Ag028ContextSchema = z.object({
  user_id_pseudonymous: z.string().trim().min(1).max(128).optional(), purpose: z.string().trim().min(1).max(64).optional(),
  as_of: z.string().trim().min(1).max(40).optional(),
}).passthrough();
export const Ag028InvokeRequestSchema = AgentInvokeRequestSchema.extend({ agent_id: z.literal("AG-028"), context: Ag028ContextSchema.optional() });

export const Ag016ContextSchema = z.object({
  user_id_pseudonymous: z.string().trim().min(1).max(128).optional(), current_intent: z.string().trim().min(1).max(256).optional(),
  as_of: z.string().trim().min(1).max(40).optional(), consent_scope: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  recent_exposure_ids: z.array(z.string().trim().min(1).max(128)).max(100).optional(), top_k: z.number().int().min(1).max(50).optional(),
}).passthrough();
export const Ag016InvokeRequestSchema = AgentInvokeRequestSchema.extend({ agent_id: z.literal("AG-016"), context: Ag016ContextSchema.optional() });

export const Ag017ContextSchema = z.object({
  topic: z.string().trim().min(1).max(256).optional(), window_start: z.string().trim().min(1).max(40).optional(),
  window_end: z.string().trim().min(1).max(40).optional(), material_id: z.string().trim().min(1).max(128).optional(),
}).passthrough();
export const Ag017InvokeRequestSchema = AgentInvokeRequestSchema.extend({ agent_id: z.literal("AG-017"), context: Ag017ContextSchema.optional() });

export const Ag026ContextSchema = z.object({
  user_id_pseudonymous: z.string().trim().min(1).max(128).optional(), scenario_id: z.string().trim().min(1).max(128).optional(),
  object_type: z.string().trim().min(1).max(64).optional(), consent_scope: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  budget_max: z.number().nonnegative().optional(), region_code: z.string().trim().min(1).max(32).optional(),
}).passthrough();
export const Ag026InvokeRequestSchema = AgentInvokeRequestSchema.extend({ agent_id: z.literal("AG-026"), context: Ag026ContextSchema.optional() });

export const ComparisonIntentViewSchema = z.object({
  product_names: z.array(z.string()),
  use_case: z.string().nullable(),
  use_cases: z.array(z.string()),
  budget_yuan: z.number().nonnegative().nullable(),
  focus_dimensions: z.array(z.string()),
  hard_constraints: z.array(z.string()),
  requested_features: z.array(z.string()).default([]),
  unverified_conditions: z.array(z.string()).default([]),
  decision_requested: z.boolean().default(false),
  comparison_mode: z.enum(["selection", "neutral_comparison"]).default("neutral_comparison"),
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
    source_refs: z.array(z.string()),
    quality_status: z.enum(["verified", "master_only", "conflict", "missing"]),
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
  constraint_checks: z.array(z.object({
    label: z.string(), passed: z.boolean(), actual: z.string(),
    determination: z.enum(["passed", "failed", "needs_review"]),
    evidence_status: z.enum(["verified", "master_only", "conflict", "missing"]),
  })).default([]),
  capability_profile: z.object({
    performance: z.array(z.string()),
    cost_and_service: z.array(z.string()),
    applicable_scenarios: z.array(z.string()),
    usage_limits: z.array(z.string()),
    evidence_refs: z.array(z.string()),
  }),
  score_breakdown: z.object({
    hard_constraint_passed: z.number().int().nonnegative(), hard_constraint_total: z.number().int().nonnegative(),
    scenario_score: z.number().nonnegative(), preference_score: z.number().nonnegative(), total: z.number().min(0).max(100),
    explanation: z.array(z.string()),
  }),
});
export type ComparedProductView = z.infer<typeof ComparedProductViewSchema>;

export const AgentComparisonOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  intent: ComparisonIntentViewSchema,
  products: z.array(ComparedProductViewSchema),
  table: z.array(ComparisonTableRowSchema),
  recommendation: z.object({
    primary_product_id: z.string().nullable(),
    primary_product_name: z.string().nullable(),
    reason: z.string(),
    alternative_product_ids: z.array(z.string()),
    alternative_reasons: z.array(z.object({
      product_id: z.string(), product_name: z.string(), why_not_primary: z.string(), when_preferred: z.string(),
    })),
  }),
  decision_assessment: z.object({
    status: z.enum(["recommended", "comparison_only", "quality_review", "no_eligible", "insufficient_evidence"]),
    confidence: z.enum(["high", "medium", "low", "not_applicable"]),
    reasons: z.array(z.string()),
    sensitivity_notes: z.array(z.string()),
  }),
  difference_analysis: z.array(z.object({
    key: z.string(), label: z.string(), summary: z.string(),
    decision_relevance: z.enum(["required", "priority", "reference"]),
    leading_product_ids: z.array(z.string()),
    quality_status: z.enum(["verified", "master_only", "conflict", "missing"]),
    source_refs: z.array(z.string()),
  })),
  conflicts: z.array(z.string()),
  missing_data: z.array(z.string()),
  parameter_quality: z.object({
    source_count: z.number().int().nonnegative(),
    normalized_conversions: z.array(z.object({ product_id: z.string(), product_name: z.string(), field: z.string(), raw: z.string(), normalized: z.string(), source_id: z.string() })),
    missing_items: z.array(z.object({ product_id: z.string(), product_name: z.string(), field: z.string(), detail: z.string() })),
    source_gap_items: z.array(z.object({ product_id: z.string(), product_name: z.string(), field: z.string(), detail: z.string() })),
    conflict_items: z.array(z.object({ product_id: z.string(), product_name: z.string(), field: z.string(), detail: z.string(), source_ids: z.array(z.string()) })),
  }),
  rag_runtime: z.lazy(() => AgentRagRuntimeSchema).optional(),
  capability_coverage: z.array(CapabilityCoverageItemSchema),
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

export const AgentRagRuntimeSchema = z.object({
  status: z.enum(["completed", "evidence_only", "insufficient_evidence", "validation_failed"]),
  index_version: z.string().nullable(), embedding_version: z.string().nullable(), rerank_provider: z.string().nullable(),
  model_provider: z.string().nullable(), citation_coverage: z.number().min(0).max(1).nullable(), grounding_support: z.number().min(0).max(1).nullable(), claim_count: z.number().int().nonnegative(),
  lexical_evidence_count: z.number().int().nonnegative(), vector_evidence_count: z.number().int().nonnegative(),
  claims: z.array(z.object({ text: z.string(), evidence_chunk_ids: z.array(z.string()) })),
  missing_information: z.array(z.string()), conflicts: z.array(z.string()), review_required: z.boolean(),
  degraded_stages: z.array(z.enum(["embedding", "rerank", "generation"])), timings_ms: z.record(z.string(), z.number().nonnegative()),
  model_usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative(), total_tokens: z.number().int().nonnegative() }).nullable(),
  evidence: z.array(z.object({
    chunk_id: z.string(), knowledge_id: z.string(), title: z.string(), document_version: z.string(), document_type: z.string(),
    source_uri: z.string(), source_organization: z.string(), source_nature: z.string(), confidentiality: z.string(),
    lifecycle_status: z.string(), effective_from: z.string().nullable(), effective_to: z.string().nullable(), section: z.string().nullable(),
    excerpt: z.string(), lexical_score: z.number().nullable(), vector_score: z.number().nullable(), rerank_score: z.number().nullable(), fused_score: z.number(),
  })),
  errors: z.array(z.string()),
});
export type AgentRagRuntime = z.infer<typeof AgentRagRuntimeSchema>;

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
  rag_runtime: AgentRagRuntimeSchema.optional(),
  document_structure: z.object({
    chapters: z.number().int().nonnegative(),
    tables: z.number().int().nonnegative(),
    figures: z.number().int().nonnegative(),
    scanned_pages: z.number().int().nonnegative(),
    recognition_mode: z.enum(["demo-preparsed", "ocr-layout", "multimodal-layout"]),
  }),
  capability_coverage: z.array(CapabilityCoverageItemSchema),
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
  rag_runtime: z.lazy(() => AgentRagRuntimeSchema).optional(),
  capability_coverage: z.array(CapabilityCoverageItemSchema),
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
  source_url: z.string().url().nullable(),
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
    requested_locators: z.array(z.string()).default([]),
    as_of_date: z.iso.date(),
  }),
  current_version: z.object({
    document_id: z.string(), title: z.string(), version: z.string(), effective_status: z.enum(["effective", "upcoming", "expired"]),
    as_of_date: z.string(), explanation: z.string(),
  }).nullable(),
  documents: z.array(z.object({
    id: z.string(), title: z.string(), document_number: z.string(), issuer: z.string(), document_type: z.enum(["policy", "standard", "airworthiness_notice"]),
    jurisdiction: z.string(), version: z.string(), published_at: z.string(), effective_from: z.string(), effective_to: z.string().nullable(),
    effective_status: z.enum(["effective", "upcoming", "expired"]), replaces_id: z.string().nullable(), source_type: z.string(), source_url: z.string().url().nullable(),
  })),
  answer: z.string(),
  key_points: z.array(z.string()),
  evidence_assessment: z.object({
    status: z.enum(["sufficient", "partial", "missing", "source_conflict"]),
    source_scope: z.string(),
    requested_locators: z.array(z.string()), covered_locators: z.array(z.string()), missing_locators: z.array(z.string()),
    conflicts: z.array(z.string()), explanation: z.string(),
    referenced_locators: z.array(z.string()).default([]), missing_referenced_locators: z.array(z.string()).default([]),
  }).default({ status: "partial", source_scope: "待核验", requested_locators: [], covered_locators: [], missing_locators: [], conflicts: [], referenced_locators: [], missing_referenced_locators: [], explanation: "依据状态待核验。" }),
  claim_evidence: z.array(z.object({ claim: z.string(), source_refs: z.array(z.string()).min(1) })).default([]),
  changes: z.array(z.object({
    id: z.string(), topic: z.string(), change_type: z.enum(["added", "removed", "modified", "moved"]),
    explanation: z.string(), business_impact: z.string(), old_source_ref: z.string(), new_source_ref: z.string(),
  })),
  applicability: z.array(z.object({
    condition: z.string(), assessment: z.enum(["matched", "not_matched", "unknown"]), explanation: z.string(), source_ref: z.string(),
  })),
  requirement_items: z.array(z.object({
    kind: z.enum(["registration", "airspace_restriction", "safety_responsibility", "application_timing", "application_materials", "filing", "record_retention", "operational_safety", "scope", "other"]),
    title: z.string(), requirement: z.string(), applies_to: z.array(z.string()), scenarios: z.array(z.string()),
    deadline: z.string().nullable(), source_ref: z.string(), effective_status: z.enum(["effective", "upcoming", "expired"]),
  })).default([]),
  verification_steps: z.array(z.object({
    order: z.number().int().positive(), action: z.string(), reason: z.string(), source_ref: z.string(), external_confirmation: z.boolean(),
  })).default([]),
  citations: z.array(PolicyCitationSchema),
  rag_runtime: AgentRagRuntimeSchema.optional(),
  review_items: z.array(z.string()),
  capability_coverage: z.array(CapabilityCoverageItemSchema),
  data_notice: z.string(),
  rule_version: z.string(),
});
export type AgentPolicyOutput = z.infer<typeof AgentPolicyOutputSchema>;

export const CustomerServiceDomainSchema = z.enum(["platform", "product_mall", "flight_service", "technical_service", "commercial_service", "unknown"]);
export const CustomerServiceIssueSchema = z.enum(["general_rule", "product", "order", "after_sales", "service", "complaint", "finance", "credit", "analytics", "violation", "unknown"]);
export const CustomerServiceRouteSchema = z.enum(["knowledge_answer", "business_data", "specialist_agent", "human_handoff", "clarification"]);
export const CustomerServiceSpecialistAgentSchema = z.enum(["AG-001", "AG-012", "AG-027"]);

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
    prior_context_used: z.boolean(),
    conflicts: z.array(z.string()),
    specialist_agent_id: CustomerServiceSpecialistAgentSchema.nullable(),
    specialist_reason: z.string().nullable(),
    complaint_elements: z.object({
      topic: z.string().nullable(),
      related_object: z.string().nullable(),
      occurred_at: z.string().nullable(),
      core_request: z.string().nullable(),
    }).nullable(),
  }),
  answer: z.string(),
  knowledge_matches: z.array(z.object({
    id: z.string(), title: z.string(), excerpt: z.string(), source_ref: z.string(), relevance: z.number().min(0).max(1),
  })),
  rag_runtime: AgentRagRuntimeSchema.optional(),
  tool_results: z.array(z.object({
    tool: z.enum(["order_lookup", "product_lookup", "service_lookup", "agent_collaboration"]),
    status: z.enum(["found", "not_found", "not_called"]),
    label: z.string(), value: z.string(), source_ref: z.string(),
  })),
  specialist_collaboration: z.object({
    agent_id: AgentIdSchema,
    status: z.enum(["preview", "completed", "needs_review", "needs_clarification"]),
    summary: z.string(),
    trace_id: z.string(),
  }).nullable(),
  evidence_assessment: z.object({
    status: z.enum(["sufficient", "partial", "missing"]),
    explanation: z.string(),
  }),
  answer_coverage: z.object({
    status: z.enum(["complete", "partial", "missing"]),
    requested_questions: z.array(z.string()),
    answered_questions: z.array(z.string()),
    unanswered_questions: z.array(z.string()),
    explanation: z.string(),
  }),
  order_assessment: z.object({
    order_id: z.string(),
    data_updated_at: z.string(),
    freshness: z.enum(["current", "stale", "unknown"]),
    staleness_days: z.number().int().nonnegative().nullable(),
    promised_deadline_available: z.boolean(),
    anomaly: z.enum(["none", "potential", "confirmed"]),
    explanation: z.string(),
  }).nullable(),
  service_guidance: z.object({
    category: z.enum(["complaint", "finance", "credit"]),
    stage: z.string(),
    summary: z.string(),
    checklist: z.array(z.object({
      item: z.string(),
      status: z.enum(["provided", "missing", "to_confirm"]),
      explanation: z.string(),
      source_ref: z.string(),
    })),
    scope_notice: z.string(),
  }).nullable(),
  risk_review: z.object({
    level: z.enum(["none", "low", "medium", "high", "urgent"]),
    signals: z.array(z.object({
      type: z.enum(["harassment", "insult", "threat", "fraud", "off_platform", "personal_data"]),
      label: z.string(),
      evidence_excerpt: z.string(),
      explanation: z.string(),
    })),
    repeated_signal: z.boolean(),
    review_required: z.boolean(),
    context_summary: z.string(),
    handling_recommendation: z.string(),
    determination: z.literal("risk_clue_only"),
    enforcement_execution: z.literal("not_performed"),
  }),
  resolution_assessment: z.object({
    status: z.enum(["resolved", "partially_resolved", "unresolved", "requires_human"]),
    user_feedback: z.enum(["not_provided", "positive", "negative", "unclear"]),
    unresolved_reason_codes: z.array(z.enum([
      "evidence_gap", "stale_business_data", "missing_business_data", "missing_user_information",
      "specialist_review", "user_requested_human", "complaint_handling", "risk_review", "professional_judgment",
    ])),
    explanation: z.string(),
  }),
  handoff: z.object({
    required: z.boolean(),
    target_team: z.string().nullable(),
    priority: z.enum(["normal", "high", "urgent"]),
    reason_code: z.enum(["none", "user_requested", "complaint", "risk_review", "professional_judgment", "evidence_gap"]),
    reason: z.string().nullable(),
    summary: z.string(),
    confirmed_information: z.array(z.string()),
    pending_items: z.array(z.string()),
    evidence_summary: z.array(z.string()),
    suggested_reply: z.string().nullable(),
    execution_status: z.literal("recommendation_only"),
  }),
  conversation: z.object({
    session_id: z.string().nullable(),
    turn_count: z.number().int().nonnegative(),
    prior_context_used: z.boolean(),
    user_problem_summary: z.string(),
    processing_trace_summary: z.string(),
  }),
  capability_coverage: z.array(CapabilityCoverageItemSchema),
  data_notice: z.string(),
  rule_version: z.string(),
});
export type AgentCustomerServiceOutput = z.infer<typeof AgentCustomerServiceOutputSchema>;

export const QuoteComparisonItemSchema = z.object({
  quote_id: z.string(), supplier_id: z.string(), supplier_name: z.string(), object_name: z.string(),
  comparable: z.boolean(), status: z.enum(["valid", "expired", "conflict"]), total_cost_yuan: z.number().nonnegative(),
  tax_included: z.boolean(), freight_yuan: z.number().nonnegative(), delivery_days: z.number().int().nonnegative(),
  warranty_months: z.number().int().nonnegative(), service_terms: z.array(z.string()), valid_until: z.string(),
  score: z.number().min(0).max(100), advantages: z.array(z.string()), concerns: z.array(z.string()),
  source: z.string(), updated_at: z.string(),
});

export const AgentQuoteComparisonOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  result: z.object({ recommended_quote_id: z.string().nullable(), recommendation: z.string() }),
  intent: z.object({ object_name: z.string().nullable(), quantity: z.number().int().positive(), delivery_region: z.string().nullable(), required_delivery_days: z.number().int().positive().nullable(), requested_quote_ids: z.array(z.string()) }),
  quotes: z.array(QuoteComparisonItemSchema),
  differences: z.array(z.string()), evidence: z.array(z.string()), confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()), review_required: z.boolean(), capability_coverage: z.array(CapabilityCoverageItemSchema),
  data_notice: z.string(), rule_version: z.string(),
});
export type AgentQuoteComparisonOutput = z.infer<typeof AgentQuoteComparisonOutputSchema>;

export const LearningRecommendationModeSchema = z.enum(["training_video", "offline_activity"]);
export const LearningRecommendationCandidateSchema = z.object({
  id: z.string(), name: z.string(), candidate_type: LearningRecommendationModeSchema, score: z.number().min(0).max(100),
  eligible: z.boolean(), topics: z.array(z.string()), level: z.enum(["beginner", "intermediate", "advanced", "all"]),
  format: z.string(), starts_at: z.string().nullable(), ends_at: z.string().nullable(), location: z.string().nullable(),
  reason: z.string(), limitations: z.array(z.string()), source: z.string(), updated_at: z.string(),
});

export const AgentLearningRecommendationOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]), mode: LearningRecommendationModeSchema,
  result: z.object({ primary_id: z.string().nullable(), primary_name: z.string().nullable(), recommendation: z.string(), registration_execution: z.literal("not_performed") }),
  intent: z.object({ topics: z.array(z.string()), target_level: z.enum(["beginner", "intermediate", "advanced", "unspecified"]), region: z.string().nullable(), available_from: z.string().nullable(), available_to: z.string().nullable(), feedback_signal: z.string().nullable() }),
  candidates: z.array(LearningRecommendationCandidateSchema), feedback_notes: z.array(z.string()), evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentLearningRecommendationOutput = z.infer<typeof AgentLearningRecommendationOutputSchema>;

export const AccessoryRecommendationCandidateSchema = z.object({
  id: z.string(), name: z.string(), category: z.string(), compatible_models: z.array(z.string()), connector: z.string(),
  price_yuan: z.number().nonnegative(), stock: z.number().int().nonnegative(), delivery_days: z.number().int().nonnegative(),
  valid_until: z.string(), eligible: z.boolean(), score: z.number().min(0).max(100), reasons: z.array(z.string()),
  risks: z.array(z.string()), source: z.string(), updated_at: z.string(),
});
export const AgentAccessoryRecommendationOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  result: z.object({ primary_accessory_id: z.string().nullable(), primary_accessory_name: z.string().nullable(), recommendation: z.string(), alternative_accessory_ids: z.array(z.string()), purchase_execution: z.literal("not_performed") }),
  intent: z.object({ aircraft_model: z.string().nullable(), scenario: z.string().nullable(), budget_yuan: z.number().nonnegative().nullable(), quantity: z.number().int().positive(), region: z.string().nullable(), software_version: z.string().nullable(), firmware_version: z.string().nullable(), requested_accessory_ids: z.array(z.string()) }),
  candidates: z.array(AccessoryRecommendationCandidateSchema), combination_conflicts: z.array(z.string()),
  installation_guidance: z.object({ requested: z.boolean(), steps: z.array(z.string()), cautions: z.array(z.string()), professional_review_required: z.literal(true), execution_status: z.literal("not_performed") }),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentAccessoryRecommendationOutput = z.infer<typeof AgentAccessoryRecommendationOutputSchema>;

export const AgentDeduplicationOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  result: z.object({ classification: z.enum(["unique", "possible_duplicate", "high_similarity", "insufficient_data"]), recommendation: z.string(), deletion_execution: z.literal("not_performed"), plagiarism_determination: z.literal("not_performed") }),
  intent: z.object({ content_type: z.enum(["news", "tender", "community"]), requested_reference_ids: z.array(z.string()) }),
  matches: z.array(z.object({ id: z.string(), title: z.string(), content_type: z.enum(["news", "tender", "community"]), similarity: z.number().min(0).max(1), signals: z.array(z.string()), subject: z.string(), region: z.string(), published_at: z.string(), status: z.enum(["published", "draft", "offline"]), source: z.string(), version: z.string() })),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentDeduplicationOutput = z.infer<typeof AgentDeduplicationOutputSchema>;

export const AgentMaintenanceAdviceOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  result: z.object({ maintenance_stage: z.enum(["routine", "due", "overdue", "urgent_review", "unknown"]), urgency: z.enum(["low", "medium", "high", "critical_review"]), recommendation: z.string(), maintenance_execution: z.literal("not_performed"), flight_safety_determination: z.literal("not_performed") }),
  intent: z.object({ aircraft_model: z.string().nullable(), environment: z.array(z.string()), component: z.string().nullable(), usage_hours: z.number().nonnegative().nullable(), days_since_maintenance: z.number().int().nonnegative().nullable(), symptoms: z.array(z.string()), service_requested: z.boolean() }),
  advice_items: z.array(z.object({ category: z.enum(["inspection", "maintenance", "consumable", "replacement", "safety", "service"]), title: z.string(), detail: z.string(), condition: z.string(), source_ref: z.string(), professional_review_required: z.boolean() })),
  service_matches: z.array(z.object({ id: z.string(), name: z.string(), region: z.string(), scope: z.array(z.string()), reason: z.string(), source: z.string(), updated_at: z.string() })),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentMaintenanceAdviceOutput = z.infer<typeof AgentMaintenanceAdviceOutputSchema>;

export const AgentFlightKnowledgeOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  result: z.object({ recommended_platform_id: z.string().nullable(), recommended_platform_name: z.string().nullable(), recommendation: z.string(), flight_authorization: z.literal("not_performed") }),
  intent: z.object({ region: z.string().nullable(), task_type: z.string().nullable(), query_date: z.string(), requested_platform_ids: z.array(z.string()), authorization_requested: z.boolean() }),
  sources: z.array(z.object({ id: z.string(), name: z.string(), authority: z.string(), region: z.string(), task_types: z.array(z.string()), url_hint: z.string(), updated_at: z.string(), valid_until: z.string(), status: z.enum(["current", "expired", "future"]), reason: z.string() })),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentFlightKnowledgeOutput = z.infer<typeof AgentFlightKnowledgeOutputSchema>;

export const AgentProductContentOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]), mode: z.enum(["copy_generation", "image_assessment"]),
  result: z.object({ product_id: z.string().nullable(), product_name: z.string().nullable(), recommendation: z.string(), publication_execution: z.literal("not_performed"), original_replacement: z.literal("not_performed") }),
  intent: z.object({ product_ids: z.array(z.string()), target_audience: z.string().nullable(), scenario: z.string().nullable(), image_ids: z.array(z.string()), requested_actions: z.array(z.string()) }),
  sections: z.array(z.object({ heading: z.string(), body: z.string(), fact_refs: z.array(z.string()) })),
  selling_points: z.array(z.object({ claim: z.string(), evidence: z.string(), limitation: z.string().nullable() })),
  fact_gaps: z.array(z.string()),
  image_assessment: z.object({ image_id: z.string().nullable(), issues: z.array(z.string()), suggestions: z.array(z.string()), consistency_assessment: z.enum(["consistent", "suspected_change", "insufficient_data", "not_compared"]), transformation_execution: z.literal("not_performed") }),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentProductContentOutput = z.infer<typeof AgentProductContentOutputSchema>;

export const AgentOrderProgressOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]),
  result: z.object({ order_id: z.string(), current_stage: z.string().nullable(), recommendation: z.string(), order_state_mutation: z.literal("not_performed"), refund_execution: z.literal("not_performed") }),
  intent: z.object({ order_ids: z.array(z.string()), refund_requested: z.boolean(), mutation_requested: z.boolean() }),
  timeline: z.array(z.object({ time: z.string(), stage: z.string(), detail: z.string(), completed: z.boolean() })),
  abnormal_nodes: z.array(z.string()), pending_actions: z.array(z.string()),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentOrderProgressOutput = z.infer<typeof AgentOrderProgressOutputSchema>;

export const AgentInsuranceAdviceOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]), mode: z.enum(["recommendation", "consultation"]),
  result: z.object({ primary_product_id: z.string().nullable(), primary_product_name: z.string().nullable(), recommendation: z.string(), underwriting_decision: z.literal("not_performed"), claim_determination: z.literal("not_performed"), purchase_execution: z.literal("not_performed") }),
  intent: z.object({ subject: z.string().nullable(), scenario: z.string().nullable(), topics: z.array(z.string()), product_ids: z.array(z.string()), claims_requested: z.boolean() }),
  candidates: z.array(z.object({ id: z.string(), name: z.string(), eligible: z.boolean(), score: z.number().min(0).max(100), reason: z.string(), coverage: z.array(z.string()), exclusions: z.array(z.string()), limit_yuan: z.number(), deductible: z.string(), premium_note: z.string(), source: z.string(), version: z.string() })),
  coverage_gaps: z.array(z.string()), professional_review_items: z.array(z.string()),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentInsuranceAdviceOutput = z.infer<typeof AgentInsuranceAdviceOutputSchema>;

export const AgentWritingOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]), action: z.enum(["generate", "rewrite", "polish", "summarize"]),
  result: z.object({ material_id: z.string().nullable(), title: z.string().nullable(), recommendation: z.string(), publication_execution: z.literal("not_performed"), message_delivery: z.literal("not_performed") }),
  intent: z.object({ source_ids: z.array(z.string()), domain: z.enum(["product", "activity", "industry"]).nullable(), audience: z.string().nullable(), scenario: z.string().nullable(), publish_requested: z.boolean() }),
  sections: z.array(z.object({ heading: z.string(), body: z.string(), fact_refs: z.array(z.string()) })), fact_gaps: z.array(z.string()),
  self_checks: z.array(z.object({ category: z.string(), passed: z.boolean(), detail: z.string() })),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentWritingOutput = z.infer<typeof AgentWritingOutputSchema>;

export const AgentIntelligenceOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]), mode: z.enum(["tender", "news", "quality"]),
  result: z.object({ content_id: z.string().nullable(), content_type: z.enum(["tender", "news", "community"]).nullable(), current_status: z.enum(["active", "changed", "closed", "published", "draft"]).nullable(), recommendation: z.string(), publication_execution: z.literal("not_performed"), removal_execution: z.literal("not_performed"), authoritative_determination: z.literal("not_performed") }),
  intent: z.object({ record_ids: z.array(z.string()), topics: z.array(z.string()), publish_requested: z.boolean(), authoritative_requested: z.boolean() }),
  summary_sections: z.array(z.object({ heading: z.string(), body: z.string(), fact_refs: z.array(z.string()) })), tags: z.array(z.string()),
  related_items: z.array(z.object({ id: z.string(), title: z.string(), relation: z.string(), source: z.string(), version: z.string() })),
  risk_findings: z.array(z.string()),
  quality_assessment: z.object({ score: z.number().min(0).max(100), classification: z.enum(["quality_candidate", "needs_review", "insufficient_data"]), reasons: z.array(z.string()) }),
  review_items: z.array(z.string()), evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentIntelligenceOutput = z.infer<typeof AgentIntelligenceOutputSchema>;

export const AgentContractReviewOutputSchema = z.object({
  engine: z.enum(["langgraph-demo", "langgraph-adapter"]), focus: z.enum(["obligation", "performance", "price", "comprehensive"]),
  result: z.object({ contract_id: z.string().nullable(), contract_title: z.string().nullable(), risk_level: z.enum(["low", "medium", "high", "unknown"]), recommendation: z.string(), breach_determination: z.literal("not_performed"), payment_execution: z.literal("not_performed"), renewal_execution: z.literal("not_performed"), termination_execution: z.literal("not_performed") }),
  intent: z.object({ contract_ids: z.array(z.string()), execution_requested: z.boolean(), legal_decision_requested: z.boolean() }), parties: z.array(z.string()),
  obligations: z.array(z.object({ clause_id: z.string(), category: z.enum(["performance", "payment", "deposit", "price", "compensation", "penalty", "renewal"]), subject: z.string(), condition: z.string(), obligation: z.string(), source_ref: z.string() })),
  conflicts: z.array(z.string()), performance_findings: z.array(z.string()), price_findings: z.array(z.string()), review_items: z.array(z.string()),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentContractReviewOutput = z.infer<typeof AgentContractReviewOutputSchema>;

const R3EngineSchema = z.enum(["langgraph-demo", "langgraph-adapter"]);
const AdvisoryExecutionSchema = z.literal("not_performed");

export const AgentPriceLookupOutputSchema = z.object({
  engine: R3EngineSchema,
  result: z.object({
    sku_id: z.string().nullable(), normalized_price_yuan: z.number().nonnegative().nullable(),
    price_range_yuan: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).nullable(),
    effective_to: z.string().nullable(), stock_status: z.string().nullable(), recommendation: z.string(),
    lock_price_execution: AdvisoryExecutionSchema, lock_stock_execution: AdvisoryExecutionSchema,
    order_execution: AdvisoryExecutionSchema, deal_guarantee: z.literal("not_provided"),
  }),
  quotes: z.array(z.object({
    quote_id: z.string(), supplier_name: z.string(), unit_price_yuan: z.number().nonnegative().nullable(), currency: z.string().nullable(),
    price_unit: z.string().nullable(), tax_included: z.boolean().nullable(), stock_status: z.string().nullable(), lead_time_days: z.number().int().nonnegative().nullable(),
    effective_to: z.string().nullable(), source_id: z.string(), data_version: z.string(), valid: z.boolean(),
  })),
  history: z.array(z.object({ observed_at: z.string(), price_yuan: z.number().nonnegative(), source_id: z.string() })),
  trend: z.enum(["up", "down", "stable", "insufficient"]), missing_fields: z.array(z.string()), conflicting_values: z.array(z.number()),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentPriceLookupOutput = z.infer<typeof AgentPriceLookupOutputSchema>;

export const AgentFlightServiceMatchOutputSchema = z.object({
  engine: R3EngineSchema,
  result: z.object({
    task_id: z.string().nullable(), recommendation: z.string(),
    flight_approval_execution: AdvisoryExecutionSchema, provider_dispatch_execution: AdvisoryExecutionSchema,
    airspace_booking_execution: AdvisoryExecutionSchema, safety_checks_bypassed: z.literal(false),
  }),
  candidates: z.array(z.object({
    provider_id: z.string(), display_name: z.string(), score: z.number().min(0).max(100), eligible: z.boolean(),
    certificate_valid_to: z.string(), service_regions: z.array(z.string()), payload_limit_kg: z.number().nonnegative(),
    reasons: z.array(z.string()), gaps: z.array(z.string()), source_id: z.string(),
  })),
  airspace: z.object({ status: z.enum(["requires_confirmation", "restricted", "unknown"]), valid_to: z.string().nullable(), source_id: z.string().nullable() }),
  limitations: z.array(z.string()), safety_checks: z.array(z.string()), evidence: z.array(z.string()), confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()), review_required: z.boolean(), capability_coverage: z.array(CapabilityCoverageItemSchema),
  data_notice: z.string(), rule_version: z.string(),
});
export type AgentFlightServiceMatchOutput = z.infer<typeof AgentFlightServiceMatchOutputSchema>;

export const AgentDataAnalysisOutputSchema = z.object({
  engine: R3EngineSchema,
  result: z.object({ summary: z.string(), business_action_execution: AdvisoryExecutionSchema }),
  metric: z.object({ metric_id: z.string().nullable(), name: z.string(), definition: z.string(), formula: z.string(), grain: z.string(), unit: z.string(), version: z.string(), owner: z.string(), source_id: z.string() }).nullable(),
  query_scope: z.object({ period: z.string(), baseline_period: z.string().nullable(), comparison_mode: z.enum(["none", "period_over_period", "year_over_year"]), dimensions: z.array(z.string()), data_cutoff: z.string() }),
  query_plan: z.object({ query_id: z.string(), status: z.enum(["clarification_required", "executed", "blocked"]), steps: z.array(z.string()), filters: z.array(z.string()) }),
  observations: z.array(z.object({ label: z.string(), value: z.number(), source_id: z.string(), series: z.string() })),
  comparison: z.object({ current_value: z.number(), baseline_value: z.number(), absolute_change: z.number(), change_rate: z.number().nullable(), direction: z.enum(["up", "down", "flat"]), label: z.string() }).nullable(),
  breakdown: z.array(z.object({ dimension: z.string(), value: z.string(), metric_value: z.number(), share: z.number().min(0).max(1), comparison_value: z.number().nullable(), change_rate: z.number().nullable(), source_id: z.string() })),
  chart: z.object({ type: z.enum(["line", "bar", "table"]), title: z.string(), x_axis: z.string(), y_axis: z.string(), series: z.array(z.object({ name: z.string(), points: z.array(z.object({ label: z.string(), value: z.number(), source_id: z.string() })) })) }).nullable(),
  clarification: z.object({ message: z.string(), options: z.array(z.object({ metric_id: z.string(), label: z.string(), definition: z.string() })) }).nullable(),
  conversation: z.object({ session_id: z.string().nullable(), turn_count: z.number().int().nonnegative(), prior_context_used: z.boolean(), context_summary: z.string() }),
  insights: z.array(z.string()), anomaly_signals: z.array(z.object({ label: z.string(), threshold: z.number(), threshold_version: z.string(), source_id: z.string() })),
  hypotheses_to_verify: z.array(z.string()), next_questions: z.array(z.string()),
  quality: z.object({ completeness_rate: z.number().min(0).max(1), consistency_rate: z.number().min(0).max(1), freshness_at: z.string(), row_count: z.number().int().nonnegative(), status: z.enum(["passed", "limited", "failed"]) }),
  lineage: z.array(z.object({ asset_id: z.string(), asset_name: z.string(), layer: z.enum(["metric", "semantic", "aggregate", "source"]), version: z.string(), source_id: z.string() })),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  rag_runtime: AgentRagRuntimeSchema.optional(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentDataAnalysisOutput = z.infer<typeof AgentDataAnalysisOutputSchema>;

export const AgentUserFeatureOutputSchema = z.object({
  engine: R3EngineSchema,
  result: z.object({
    user_id_pseudonymous: z.string().nullable(), purpose: z.string(),
    entitlement_change_execution: AdvisoryExecutionSchema, service_denial_execution: AdvisoryExecutionSchema,
    credit_change_execution: AdvisoryExecutionSchema, sensitive_inference_execution: AdvisoryExecutionSchema,
  }),
  consent: z.object({ granted: z.boolean(), scope: z.array(z.string()), checked_at: z.string() }),
  features: z.array(z.object({
    feature_id: z.string(), label: z.string(), value: z.string(), state: z.enum(["active", "unknown", "expired", "conflicted"]),
    confidence: z.number().min(0).max(1), evidence_window: z.string(), evidence_count: z.number().int().nonnegative(),
    source_ids: z.array(z.string()), feature_version: z.string(), expires_at: z.string(),
  })),
  correction_record: z.object({ feature_id: z.string(), claimed_value: z.string(), status: z.literal("pending_review") }).nullable(),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentUserFeatureOutput = z.infer<typeof AgentUserFeatureOutputSchema>;

export const AgentNewsRecommendationOutputSchema = z.object({
  engine: R3EngineSchema,
  result: z.object({ summary: z.string(), publish_execution: AdvisoryExecutionSchema, subscribe_execution: AdvisoryExecutionSchema, notify_execution: AdvisoryExecutionSchema, content_status_change_execution: AdvisoryExecutionSchema }),
  intent: z.object({ topic: z.string().nullable(), as_of: z.string(), cold_start: z.boolean(), explicit_context_only: z.boolean() }),
  candidates: z.array(z.object({ content_id: z.string(), title: z.string(), source_id: z.string(), published_at: z.string(), valid_to: z.string(), duplicate_cluster_id: z.string(), score: z.number().min(0).max(100), freshness_score: z.number().min(0).max(100), eligible: z.boolean(), reasons: z.array(z.string()) })),
  exclusions: z.array(z.object({ content_id: z.string(), reasons: z.array(z.string()) })),
  diversity: z.object({ status: z.enum(["balanced", "adjusted", "shortfall"]), source_count: z.number().int().nonnegative(), topic_count: z.number().int().nonnegative(), adjustment_needed: z.boolean() }),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  rag_runtime: AgentRagRuntimeSchema.optional(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentNewsRecommendationOutput = z.infer<typeof AgentNewsRecommendationOutputSchema>;

export const AgentPublicOpinionOutputSchema = z.object({
  engine: R3EngineSchema,
  result: z.object({ summary: z.string(), takedown_execution: AdvisoryExecutionSchema, penalty_execution: AdvisoryExecutionSchema, identity_inference_execution: AdvisoryExecutionSchema, final_fact_determination: AdvisoryExecutionSchema }),
  topic_summary: z.string(), sentiment_distribution: z.record(z.string(), z.number().int().nonnegative()), risk_clues: z.array(z.string()),
  evidence_spans: z.array(z.object({ material_id: z.string(), quote: z.string(), source_id: z.string().nullable(), published_at: z.string().nullable() })),
  window: z.object({ start: z.string().nullable(), end: z.string().nullable(), data_cutoff: z.string() }), source_ids: z.array(z.string()),
  material_count: z.number().int().nonnegative(), unique_voice_count: z.number().int().nonnegative(), duplicate_cluster_count: z.number().int().nonnegative(),
  trend_status: z.enum(["not_assessed", "insufficient", "stable", "deteriorating", "improving"]), conflicts: z.array(z.string()), missing_fields: z.array(z.string()),
  evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentPublicOpinionOutput = z.infer<typeof AgentPublicOpinionOutputSchema>;

export const AgentPrecisionRecommendationOutputSchema = z.object({
  engine: R3EngineSchema,
  result: z.object({ summary: z.string(), order_execution: AdvisoryExecutionSchema, application_execution: AdvisoryExecutionSchema, underwriting_execution: AdvisoryExecutionSchema, contract_execution: AdvisoryExecutionSchema, dispatch_execution: AdvisoryExecutionSchema, service_denial_execution: AdvisoryExecutionSchema, rights_change_execution: AdvisoryExecutionSchema }),
  scenario_id: z.string().nullable(), object_type: z.string().nullable(), cold_start: z.boolean(), not_directly_comparable: z.boolean(), domain_metrics: z.array(z.string()),
  candidates: z.array(z.object({ object_id: z.string(), object_type: z.string(), eligibility_status: z.enum(["eligible", "ineligible", "unknown"]), score: z.number().min(0).max(100).nullable(), score_components: z.object({ intent_match: z.number().optional(), hard_constraint_pass: z.number().optional(), source_quality: z.number().optional() }), hard_constraint_findings: z.array(z.string()), evidence: z.array(z.string()), limitations: z.array(z.string()) })),
  missing_fields: z.array(z.string()), evidence: z.array(z.string()), confidence: z.number().min(0).max(1), warnings: z.array(z.string()), review_required: z.boolean(),
  capability_coverage: z.array(CapabilityCoverageItemSchema), data_notice: z.string(), rule_version: z.string(),
});
export type AgentPrecisionRecommendationOutput = z.infer<typeof AgentPrecisionRecommendationOutputSchema>;

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
    quote_comparison: AgentQuoteComparisonOutputSchema.optional(),
    learning_recommendation: AgentLearningRecommendationOutputSchema.optional(),
    accessory_recommendation: AgentAccessoryRecommendationOutputSchema.optional(),
    deduplication: AgentDeduplicationOutputSchema.optional(),
    maintenance_advice: AgentMaintenanceAdviceOutputSchema.optional(),
    flight_knowledge: AgentFlightKnowledgeOutputSchema.optional(),
    product_content: AgentProductContentOutputSchema.optional(),
    order_progress: AgentOrderProgressOutputSchema.optional(),
    insurance_advice: AgentInsuranceAdviceOutputSchema.optional(),
    writing: AgentWritingOutputSchema.optional(),
    intelligence: AgentIntelligenceOutputSchema.optional(),
    contract_review: AgentContractReviewOutputSchema.optional(),
    price_lookup: AgentPriceLookupOutputSchema.optional(),
    flight_service_match: AgentFlightServiceMatchOutputSchema.optional(),
    data_analysis: AgentDataAnalysisOutputSchema.optional(),
    user_features: AgentUserFeatureOutputSchema.optional(),
    news_recommendation: AgentNewsRecommendationOutputSchema.optional(),
    public_opinion: AgentPublicOpinionOutputSchema.optional(),
    precision_recommendation: AgentPrecisionRecommendationOutputSchema.optional(),
    review_request: z.object({
      review_id: z.string().regex(/^RVW-[A-Z0-9-]+$/),
      status: z.enum(["pending", "approved", "rejected", "needs_more_information", "expired"]),
      reason: z.string(),
      expires_at: z.string().datetime({ offset: true }),
    }).optional(),
  }),
  processing_steps: z.array(z.object({
    name: z.string(),
    status: z.enum(["completed", "needs_review", "stopped"]),
  })).optional(),
  /** Internal workflow trace. Returned only by the local demonstration runtime. */
  trace: z.array(z.object({ name: z.string(), detail: z.string() })).optional(),
});
export type AgentInvokeResponse = z.infer<typeof AgentInvokeResponseSchema>;
