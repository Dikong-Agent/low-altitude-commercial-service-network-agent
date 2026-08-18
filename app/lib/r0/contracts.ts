import { z } from "zod/v4";
import { AgentIdSchema, AgentInvokeRequestSchema } from "../contracts.ts";

export const R0_FOUNDATION_VERSION = "r0.1.0";

export const RuntimeStatusSchema = z.enum(["queued", "processing", "completed", "failed", "cancelled", "enqueue_failed"]);
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;

export const RuntimeErrorSchema = z.object({
  code: z.string().trim().min(1), message: z.string().trim().min(1), trace_id: z.string().trim().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const AgentTaskCreateSchema = AgentInvokeRequestSchema.extend({ agent_id: AgentIdSchema }).strict();
export const AgentTaskAcceptedSchema = z.object({
  task_id: z.string().regex(/^TSK-[A-Z0-9-]+$/), agent_id: AgentIdSchema, status: z.literal("queued"),
  trace_id: z.string().regex(/^TRC-/), replayed: z.boolean().default(false),
}).strict();
export const AgentTaskViewSchema = z.object({
  task_id: z.string().regex(/^TSK-[A-Z0-9-]+$/), state: RuntimeStatusSchema,
  result: z.unknown().optional(), error_code: z.string().optional(),
}).strict();
export const AgentTaskCancellationSchema = z.object({
  task_id: z.string().regex(/^TSK-[A-Z0-9-]+$/), status: z.literal("cancelled"),
  cancelled_at: z.string().datetime({ offset: true }),
}).strict();

export const HumanReviewSubmissionSchema = z.object({
  agent_id: AgentIdSchema,
  trace_id: z.string().regex(/^TRC-/),
  reason: z.string().trim().min(3).max(1_000),
  evidence: z.array(z.string().trim().min(1).max(1_000)).max(50).default([]),
  proposed_action: z.string().trim().max(1_000).optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
}).strict();
export type HumanReviewSubmission = z.infer<typeof HumanReviewSubmissionSchema>;

export const HumanReviewDecisionSchema = z.enum(["approved", "rejected", "needs_more_information"]);
export const HumanReviewCallbackSchema = z.object({
  decision: HumanReviewDecisionSchema,
  reviewer_id: z.string().trim().min(1).max(128),
  comment: z.string().trim().max(2_000).default(""),
  decided_at: z.string().datetime({ offset: true }),
  evidence: z.array(z.string().trim().min(1).max(1_000)).max(50).default([]),
}).strict();
export type HumanReviewCallback = z.infer<typeof HumanReviewCallbackSchema>;

export const HumanReviewViewSchema = z.object({
  review_id: z.string().regex(/^RVW-[A-Z0-9-]+$/), agent_id: AgentIdSchema, trace_id: z.string().regex(/^TRC-/),
  status: z.enum(["pending", "approved", "rejected", "needs_more_information", "expired"]),
  reason: z.string(), evidence: z.array(z.string()), proposed_action: z.string().optional(),
  decision: HumanReviewCallbackSchema.optional(),
  created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
}).strict();
export type HumanReviewView = z.infer<typeof HumanReviewViewSchema>;

export const ProviderRequestEnvelopeSchema = z.object({
  contract_version: z.string().trim().min(1), trace_id: z.string().trim().min(1), tenant_id: z.string().trim().min(1),
  subject_id: z.string().trim().min(1), agent_id: AgentIdSchema, operation: z.string().trim().min(1), data: z.unknown(),
}).strict();
export const ProviderResponseEnvelopeSchema = z.object({
  contract_version: z.string().trim().min(1),
  meta: z.object({
    tenant_id: z.string().trim().min(1), source_ids: z.array(z.string().trim().min(1)),
    generated_at: z.string().datetime({ offset: true }), classification: z.enum(["public", "internal", "confidential", "restricted"]),
  }).strict(),
  data: z.unknown(),
}).strict();

export const FoundationHealthSchema = z.object({
  status: z.enum(["live", "ready", "not_ready"]), foundation_version: z.literal(R0_FOUNDATION_VERSION),
  interface_version: z.string(), checks: z.record(z.string(), z.enum(["ready", "degraded", "missing"])).optional(),
}).strict();
