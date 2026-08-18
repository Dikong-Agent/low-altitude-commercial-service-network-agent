import { getRuntimeBindings } from "../runtime-bindings.ts";
import { getRagRuntimeHealth } from "../rag/runtime.ts";
import { DATASET_VERSION, executeRagEvaluation } from "./evaluator.ts";
import type { EvaluationSnapshot, RagEvaluationRun } from "./contracts.ts";
import { FORMAL_ACCEPTANCE_READINESS, ONLINE_VERIFICATION_BASELINE } from "./online-verification.ts";

const TENANT_ID = "DEMO-TENANT"; const SNAPSHOT_ID = "rag-evaluation-v1"; const MAX_RUNS = 20;
let memory: EvaluationSnapshot = { schemaVersion: "1.0", runs: [], updatedAt: new Date(0).toISOString() };
let tail: Promise<void> = Promise.resolve();
type SnapshotRow = { snapshot_json: string };

async function hydrate(): Promise<void> {
  const db = getRuntimeBindings()?.DB; if (!db) return;
  const row = await db.prepare("SELECT snapshot_json FROM rag_evaluation_snapshots WHERE tenant_id = ? AND snapshot_id = ?").bind(TENANT_ID, SNAPSHOT_ID).first<SnapshotRow>();
  if (row) memory = JSON.parse(row.snapshot_json) as EvaluationSnapshot;
}
async function persist(): Promise<void> {
  memory.updatedAt = new Date().toISOString(); const db = getRuntimeBindings()?.DB; if (!db) return;
  await db.prepare("INSERT INTO rag_evaluation_snapshots (tenant_id, snapshot_id, snapshot_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, snapshot_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at")
    .bind(TENANT_ID, SNAPSHOT_ID, JSON.stringify(memory), memory.updatedAt).run();
}
async function mutate<T>(operation: () => Promise<T>): Promise<T> {
  let release = () => {}; const previous = tail; tail = new Promise<void>((resolve) => { release = resolve; }); await previous;
  try { await hydrate(); const result = await operation(); await persist(); return result; } finally { release(); }
}
async function ensureBaseline(): Promise<void> {
  await hydrate(); if (memory.runs.length) return;
  await mutate(async () => { if (memory.runs.length) return; const run = await executeRagEvaluation(); run.baseline = true; memory.runs.unshift(run); });
}
function comparison(current: RagEvaluationRun | undefined, baseline: RagEvaluationRun | undefined) {
  if (!current || !baseline) return [];
  const baselineMap = new Map(baseline.metrics.map((metric) => [metric.id, metric.value]));
  return current.metrics.map((metric) => ({ id: metric.id, label: metric.label, current: metric.value, baseline: baselineMap.get(metric.id) ?? null, delta: baselineMap.has(metric.id) ? metric.value - baselineMap.get(metric.id)! : null, passed: metric.passed }));
}

export async function getEvaluationDashboard() {
  await ensureBaseline(); await hydrate();
  const current = memory.runs[0]; const baseline = memory.runs.find((run) => run.baseline);
  const health = getRagRuntimeHealth();
  return { current, baseline, runs: memory.runs, comparison: comparison(current, baseline), dataset: { version: DATASET_VERSION, totalCases: 200, agentCount: 4, casesPerAgent: 50, categories: current?.categories ?? [] },
    evaluationLayers: { engineering: { status: current?.gateStatus ?? "pending", cases: current?.totalCases ?? 0, passed: current?.passedCases ?? 0, label: "确定性工程回归" }, online: ONLINE_VERIFICATION_BASELINE, formal: FORMAL_ACCEPTANCE_READINESS },
    remediation: { open: current?.failures.filter((item) => item.remediationStatus !== "closed").length ?? 0, closed: current?.failures.filter((item) => item.remediationStatus === "closed").length ?? 0, workflow: ["定位责任环节", "关联修复版本", "全量回归", "复测关闭"] },
    runtime: { status: health.status, mode: health.mode, providers: health.providers, capabilities: health.capabilities, activeIndex: health.activeIndex, indexedNamespaces: health.indexedNamespaces, metrics: health.metrics },
    persistence: getRuntimeBindings()?.DB ? "d1" : "memory", updatedAt: memory.updatedAt };
}
export async function runEvaluation(): Promise<RagEvaluationRun> {
  return mutate(async () => { const run = await executeRagEvaluation(); memory.runs.unshift(run); memory.runs = memory.runs.slice(0, MAX_RUNS); return run; });
}
export async function setEvaluationBaseline(runId: string): Promise<RagEvaluationRun> {
  return mutate(async () => { const target = memory.runs.find((run) => run.id === runId); if (!target) throw new EvaluationStoreError("EVALUATION_RUN_NOT_FOUND", 404, "未找到指定评测运行"); if (target.gateStatus !== "passed") throw new EvaluationStoreError("FAILED_RUN_CANNOT_BE_BASELINE", 409, "未通过质量检查的评测运行不能设为基线"); for (const run of memory.runs) run.baseline = run.id === runId; return target; });
}
export class EvaluationStoreError extends Error { readonly code: string; readonly status: number; constructor(code: string, status: number, message: string) { super(message); this.code = code; this.status = status; this.name = "EvaluationStoreError"; } }
export function resetEvaluationStoreForTests(): void { memory = { schemaVersion: "1.0", runs: [], updatedAt: new Date(0).toISOString() }; tail = Promise.resolve(); }
