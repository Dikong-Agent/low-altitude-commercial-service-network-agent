export interface ReliabilityPolicy {
  timeoutMs: number;
  maxAttempts: number;
  circuitFailureThreshold: number;
  circuitResetMs: number;
}

interface CircuitState {
  failures: number;
  openUntil: number;
}

const circuits = new Map<string, CircuitState>();

export class DependencyUnavailableError extends Error {
  public readonly dependency: string;

  constructor(dependency: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DependencyUnavailableError";
    this.dependency = dependency;
  }
}

async function runWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function executeWithPolicy<T>(
  dependency: string,
  policy: ReliabilityPolicy,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const circuit = circuits.get(dependency) ?? { failures: 0, openUntil: 0 };
  if (circuit.openUntil > now) {
    throw new DependencyUnavailableError(dependency, `${dependency} circuit is temporarily open`);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      const result = await runWithTimeout(operation, policy.timeoutMs);
      circuits.set(dependency, { failures: 0, openUntil: 0 });
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  const failures = circuit.failures + 1;
  circuits.set(dependency, {
    failures,
    openUntil: failures >= policy.circuitFailureThreshold ? Date.now() + policy.circuitResetMs : 0,
  });
  throw new DependencyUnavailableError(dependency, `${dependency} failed after ${policy.maxAttempts} attempts`, { cause: lastError });
}
