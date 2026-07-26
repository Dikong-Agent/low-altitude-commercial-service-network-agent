import { z } from "zod/v4";

export const AGENT_INTERFACE_VERSION = "v1.1";
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
  }),
  trace: z.array(z.object({ name: z.string(), detail: z.string() })),
});
export type AgentInvokeResponse = z.infer<typeof AgentInvokeResponseSchema>;
