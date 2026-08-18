import type { ManagedAgentId } from "../knowledge-admin/contracts.ts";

export type GateOperator = "gte" | "lte" | "eq";
export interface EvaluationMetric {
  id: string; label: string; value: number; threshold: number; operator: GateOperator;
  unit: "ratio" | "count" | "milliseconds"; passed: boolean; evidenceCount: number; description: string;
}
export interface AgentEvaluationResult {
  agentId: ManagedAgentId; name: string; cases: number; passedCases: number; passRate: number;
  recallAt20: number; ndcgAt10: number; abstentionAccuracy: number;
  specialGateLabel: string; specialGateValue: number; specialGateThreshold: number; specialGateOperator: GateOperator; specialGatePassed: boolean;
}
export interface CategoryEvaluationResult { category: string; label: string; cases: number; passed: number; passRate: number }
export interface EvaluationFailure {
  caseId: string; agentId: ManagedAgentId; category: string; question: string; expectedDocumentId?: string;
  actualDocumentIds: string[]; reason: string; severity: "high" | "medium"; suggestedAction: string;
  ownerStage: "knowledge" | "retrieval" | "rerank" | "generation" | "guardrail";
  remediationStatus: "open" | "fixing" | "retesting" | "closed"; firstSeenAt: string; retestRunId?: string;
}
export interface RagEvaluationRun {
  id: string; status: "completed" | "failed"; baseline: boolean; datasetVersion: string; datasetLabel: string;
  environment: "demo"; startedAt: string; completedAt: string; durationMs: number; totalCases: number; passedCases: number;
  gateStatus: "passed" | "failed"; metrics: EvaluationMetric[]; agents: AgentEvaluationResult[];
  categories: CategoryEvaluationResult[]; failures: EvaluationFailure[];
  versions: { knowledgeCatalog: string; evaluationDataset: string; indexVersion: string; model: string; embedding: string; rerank: string };
  boundary: string;
}
export interface EvaluationSnapshot { schemaVersion: "1.0"; runs: RagEvaluationRun[]; updatedAt: string }
