import { AsyncLocalStorage } from "node:async_hooks";

export interface D1RunResult {
  success: boolean;
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1RunResult[]>;
}

export interface RuntimeBindings {
  DB?: D1Database;
  AGENT_TASKS?: { send(message: { taskId: string }): Promise<void> };
  ASSETS?: { fetch(request: Request): Promise<Response> };
  IMAGES?: unknown;
}

const runtimeBindings = new AsyncLocalStorage<RuntimeBindings>();

export function runWithRuntimeBindings<T>(bindings: RuntimeBindings, operation: () => Promise<T>): Promise<T> {
  return runtimeBindings.run(bindings, operation);
}

export function getRuntimeBindings(): RuntimeBindings | undefined {
  return runtimeBindings.getStore();
}
