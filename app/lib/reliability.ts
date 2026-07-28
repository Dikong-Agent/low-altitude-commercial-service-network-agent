import { AsyncLocalStorage } from "node:async_hooks";
import { getRuntimeBindings, type D1Database } from "./runtime-bindings.ts";

export interface ReliabilityPolicy {
  timeoutMs: number;
  maxAttempts: number;
  circuitFailureThreshold: number;
  circuitResetMs: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

interface CircuitState { failures: number; openUntil: number }

export interface DependencySpan {
  dependency: string;
  durationMs: number;
  attempts: number;
  retries: number;
  status: "completed" | "failed" | "cancelled" | "circuit-open";
  errorCode?: string;
}

export interface AgentExecutionContext {
  traceId: string;
  deadlineAt: number;
  requestSignal?: AbortSignal;
  dependencySpans: DependencySpan[];
}

const contexts = new AsyncLocalStorage<AgentExecutionContext>();
const localCircuits = new Map<string, CircuitState>();
const initializedDatabases = new WeakMap<object, Promise<void>>();

export class DependencyUnavailableError extends Error {
  public readonly dependency: string;
  public readonly retryable: boolean;

  constructor(dependency: string, message: string, options?: ErrorOptions & { retryable?: boolean }) {
    super(message, options);
    this.name = "DependencyUnavailableError";
    this.dependency = dependency;
    this.retryable = options?.retryable ?? true;
  }
}

export class AgentExecutionAbortedError extends DependencyUnavailableError {
  constructor(message = "Agent execution was cancelled") {
    super("agent-runtime", message, { retryable: false });
    this.name = "AgentExecutionAbortedError";
  }
}

export function createAgentExecutionContext(traceId: string, totalTimeoutMs: number, requestSignal?: AbortSignal): AgentExecutionContext {
  return { traceId, deadlineAt: Date.now() + totalTimeoutMs, requestSignal, dependencySpans: [] };
}

export function runWithAgentExecutionContext<T>(context: AgentExecutionContext, operation: () => Promise<T>): Promise<T> {
  return contexts.run(context, operation);
}

export function currentAgentTraceId(): string | undefined {
  return contexts.getStore()?.traceId;
}

async function ensureCircuitSchema(db: D1Database): Promise<void> {
  const key = db as object;
  let pending = initializedDatabases.get(key);
  if (!pending) {
    pending = db.prepare("CREATE TABLE IF NOT EXISTS dependency_circuits (circuit_key TEXT PRIMARY KEY, failure_count INTEGER NOT NULL, open_until_ms INTEGER NOT NULL, updated_at TEXT NOT NULL)").run().then(() => undefined);
    initializedDatabases.set(key, pending);
  }
  await pending;
}

async function readCircuit(dependency: string): Promise<CircuitState> {
  const db = getRuntimeBindings()?.DB;
  if (!db) return localCircuits.get(dependency) ?? { failures: 0, openUntil: 0 };
  await ensureCircuitSchema(db);
  const row = await db.prepare("SELECT failure_count, open_until_ms FROM dependency_circuits WHERE circuit_key = ?")
    .bind(dependency).first<{ failure_count: number; open_until_ms: number }>();
  return row ? { failures: Number(row.failure_count), openUntil: Number(row.open_until_ms) } : { failures: 0, openUntil: 0 };
}

async function resetCircuit(dependency: string): Promise<void> {
  const db = getRuntimeBindings()?.DB;
  if (!db) {
    localCircuits.set(dependency, { failures: 0, openUntil: 0 });
    return;
  }
  await ensureCircuitSchema(db);
  await db.prepare("DELETE FROM dependency_circuits WHERE circuit_key = ?").bind(dependency).run();
}

async function failCircuit(dependency: string, state: CircuitState, policy: ReliabilityPolicy): Promise<void> {
  const failures = state.failures + 1;
  const openUntil = failures >= policy.circuitFailureThreshold ? Date.now() + policy.circuitResetMs : 0;
  const db = getRuntimeBindings()?.DB;
  if (!db) {
    localCircuits.set(dependency, { failures, openUntil });
    return;
  }
  await ensureCircuitSchema(db);
  const openUntilAfterFailure = Date.now() + policy.circuitResetMs;
  await db.prepare("INSERT INTO dependency_circuits (circuit_key, failure_count, open_until_ms, updated_at) VALUES (?, 1, CASE WHEN 1 >= ? THEN ? ELSE 0 END, ?) ON CONFLICT(circuit_key) DO UPDATE SET failure_count = dependency_circuits.failure_count + 1, open_until_ms = CASE WHEN dependency_circuits.failure_count + 1 >= ? THEN ? ELSE 0 END, updated_at = excluded.updated_at")
    .bind(dependency, policy.circuitFailureThreshold, openUntilAfterFailure, new Date().toISOString(), policy.circuitFailureThreshold, openUntilAfterFailure).run();
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AgentExecutionAbortedError();
}

function combineSignals(...signals: Array<AbortSignal | undefined>): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  for (const signal of active) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  return { signal: controller.signal, dispose: () => active.forEach((signal) => signal.removeEventListener("abort", abort)) };
}

async function runWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, requestSignal?: AbortSignal): Promise<T> {
  throwIfCancelled(requestSignal);
  const timeoutController = new AbortController();
  const combined = combineSignals(timeoutController.signal, requestSignal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timeoutController.abort();
      reject(new DependencyUnavailableError("timeout", `operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(combined.signal), timeout]);
  } catch (error) {
    if (requestSignal?.aborted) throw new AgentExecutionAbortedError();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    combined.dispose();
  }
}

function remainingBudget(context?: AgentExecutionContext): number {
  return context ? context.deadlineAt - Date.now() : Number.POSITIVE_INFINITY;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AgentExecutionAbortedError) return false;
  if (error instanceof DependencyUnavailableError) return error.retryable;
  return !(error instanceof DOMException && error.name === "AbortError");
}

async function backoff(attempt: number, policy: ReliabilityPolicy, context?: AgentExecutionContext): Promise<void> {
  const upperBound = Math.min(policy.maxDelayMs ?? 500, (policy.baseDelayMs ?? 25) * 2 ** Math.max(0, attempt - 1));
  const delay = Math.floor(Math.random() * (upperBound + 1));
  if (delay <= 0) return;
  if (remainingBudget(context) <= delay) throw new DependencyUnavailableError("agent-runtime", "Agent request time budget was exhausted", { retryable: false });
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      context?.requestSignal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, delay);
    const abort = () => { clearTimeout(timer); reject(new AgentExecutionAbortedError()); };
    context?.requestSignal?.addEventListener("abort", abort, { once: true });
  });
}

export async function executeWithPolicy<T>(
  dependency: string,
  policy: ReliabilityPolicy,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const context = contexts.getStore();
  const startedAt = Date.now();
  const circuit = await readCircuit(dependency);
  if (circuit.openUntil > Date.now()) {
    context?.dependencySpans.push({ dependency, durationMs: 0, attempts: 0, retries: 0, status: "circuit-open", errorCode: "CIRCUIT_OPEN" });
    throw new DependencyUnavailableError(dependency, `${dependency} circuit is temporarily open`);
  }

  let lastError: unknown;
  let attempts = 0;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    attempts = attempt;
    if (context?.requestSignal?.aborted) {
      context.dependencySpans.push({ dependency, durationMs: Date.now() - startedAt, attempts: attempt - 1, retries: Math.max(0, attempt - 2), status: "cancelled", errorCode: "REQUEST_CANCELLED" });
      throw new AgentExecutionAbortedError();
    }
    const remaining = remainingBudget(context);
    if (remaining <= 0) {
      lastError = new DependencyUnavailableError(dependency, "Agent request time budget was exhausted", { retryable: false });
      break;
    }
    try {
      const result = await runWithTimeout(operation, Math.max(1, Math.min(policy.timeoutMs, remaining)), context?.requestSignal);
      await resetCircuit(dependency);
      context?.dependencySpans.push({ dependency, durationMs: Date.now() - startedAt, attempts, retries: attempts - 1, status: "completed" });
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt >= policy.maxAttempts) break;
      await backoff(attempt, policy, context);
    }
  }

  if (!(lastError instanceof AgentExecutionAbortedError)) await failCircuit(dependency, circuit, policy);
  const cancelled = lastError instanceof AgentExecutionAbortedError;
  context?.dependencySpans.push({ dependency, durationMs: Date.now() - startedAt, attempts, retries: Math.max(0, attempts - 1), status: cancelled ? "cancelled" : "failed", errorCode: cancelled ? "REQUEST_CANCELLED" : "DEPENDENCY_UNAVAILABLE" });
  if (cancelled) throw lastError;
  throw new DependencyUnavailableError(dependency, `${dependency} failed after ${attempts} attempt(s)`, { cause: lastError, retryable: false });
}
