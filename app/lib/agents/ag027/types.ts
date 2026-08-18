import { z } from "zod/v4";

export const AnalysisScenarioSchema = z.enum([
  "normal", "ambiguous_metric", "grain_conflict", "low_quality", "anomaly",
  "causal_claim", "unauthorized_detail", "business_boundary", "no_data",
]);
export const AnalysisComparisonModeSchema = z.enum(["none", "period_over_period", "year_over_year"]);
export const AnalysisChartTypeSchema = z.enum(["line", "bar", "table"]);

export const AnalysisConversationTurnSchema = z.object({
  question: z.string(), summary: z.string(), metricId: z.string().nullable(),
});
export const AnalysisConversationStateSchema = z.object({
  sessionId: z.string(), turnCount: z.number().int().nonnegative(), metricId: z.string().nullable(),
  periodLabel: z.string(), dimensions: z.array(z.string()), comparisonMode: AnalysisComparisonModeSchema,
  recentTurns: z.array(AnalysisConversationTurnSchema).max(6), updatedAt: z.string(),
});
export type AnalysisConversationState = z.infer<typeof AnalysisConversationStateSchema>;

export const AnalysisIntentSchema = z.object({
  question: z.string(), metricId: z.string().nullable(), scenario: AnalysisScenarioSchema,
  periodCount: z.number().int().positive().max(366), periodUnit: z.enum(["day", "week", "month"]), periodLabel: z.string(),
  dimensions: z.array(z.string()), comparisonMode: AnalysisComparisonModeSchema, chartType: AnalysisChartTypeSchema,
  priorContextUsed: z.boolean(), requestsCausalConclusion: z.boolean(), requestsBusinessAction: z.boolean(), requestsRestrictedDetail: z.boolean(),
  needsClarification: z.boolean(), clarificationMessage: z.string().nullable(),
  clarificationOptions: z.array(z.object({ metricId: z.string(), label: z.string(), definition: z.string() })),
});
export type AnalysisIntent = z.infer<typeof AnalysisIntentSchema>;

export const MetricDefinitionSchema = z.object({
  metricId: z.string(), name: z.string(), definition: z.string(), formula: z.string(), grain: z.string(),
  dimensions: z.array(z.string()), unit: z.string(), version: z.string(), owner: z.string(), sourceId: z.string(),
});
export const MetricObservationSchema = z.object({ label: z.string(), value: z.number(), sourceId: z.string(), series: z.string() });
export const AnalysisBreakdownSchema = z.object({
  dimension: z.string(), value: z.string(), metricValue: z.number(), share: z.number().min(0).max(1),
  comparisonValue: z.number().nullable(), changeRate: z.number().nullable(), sourceId: z.string(),
});
export const AnalysisLineageSchema = z.object({
  assetId: z.string(), assetName: z.string(), layer: z.enum(["metric", "semantic", "aggregate", "source"]), version: z.string(), sourceId: z.string(),
});
export const AnalysisSnapshotSchema = z.object({
  metric: MetricDefinitionSchema.nullable(), observations: z.array(MetricObservationSchema), comparisonObservations: z.array(MetricObservationSchema),
  breakdown: z.array(AnalysisBreakdownSchema), period: z.string(), baselinePeriod: z.string().nullable(), dataCutoff: z.string(),
  completenessRate: z.number().min(0).max(1), consistencyRate: z.number().min(0).max(1), freshnessAt: z.string(),
  qualityStatus: z.enum(["passed", "limited", "failed"]), threshold: z.number().nullable(), thresholdVersion: z.string().nullable(),
  queryId: z.string(), rowCount: z.number().int().nonnegative(), lineage: z.array(AnalysisLineageSchema), availableDimensions: z.array(z.string()),
});
export type AnalysisSnapshot = z.infer<typeof AnalysisSnapshotSchema>;
