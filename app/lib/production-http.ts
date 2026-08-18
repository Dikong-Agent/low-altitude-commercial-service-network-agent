import { z } from "zod/v4";
import { currentAgentTraceId, DependencyUnavailableError } from "./reliability";
import type { RequestIdentity } from "./request-identity";
import { accessContextFromIdentity, type AgentAccessContext } from "./runtime-ports";
import { AI_SAFETY_POLICY_VERSION } from "./ai-safety";

export const ADAPTER_CONTRACT_VERSION = "2026-07-27";

const AdapterEnvelopeSchema = z.object({
  contract_version: z.literal(ADAPTER_CONTRACT_VERSION),
  meta: z.object({
    tenant_id: z.string().min(1),
    classification: z.enum(["public", "internal", "confidential", "restricted"]),
    source_ids: z.array(z.string().min(1)).max(1000),
    generated_at: z.iso.datetime(),
  }).strict(),
  data: z.unknown(),
}).strict();

type AdapterKind = "ai-platform" | "business-data";

const allowedOperations: Record<string, ReadonlySet<string>> = {
  "AG-001:ai-platform": new Set(["understand-comparison-request"]),
  "AG-001:business-data": new Set(["list-products", "get-products"]),
  "AG-012:ai-platform": new Set(["understand-policy-request", "retrieve-policy-evidence"]),
  "AG-012:business-data": new Set(["search-documents", "get-documents", "get-version-chains"]),
  "AG-025:ai-platform": new Set(["understand-customer-request", "rank-customer-knowledge"]),
  "AG-025:business-data": new Set(["search-knowledge", "get-orders", "find-products", "get-service-guides"]),
  "AG-027:ai-platform": new Set(["understand-analysis"]),
  "AG-027:business-data": new Set(["get-analysis-snapshot", "load-analysis-session", "save-analysis-session"]),
};

const MAX_ADAPTER_RESPONSE_BYTES = 2_000_000;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new DependencyUnavailableError("production-adapter.config", `${name} is required`, { retryable: false });
  return value;
}

function validatedBaseUrl(name: string): URL {
  let url: URL;
  try {
    url = new URL(requiredEnvironment(name));
  } catch (error) {
    throw new DependencyUnavailableError("production-adapter.config", `${name} must be an absolute URL`, { cause: error, retryable: false });
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new DependencyUnavailableError("production-adapter.config", `${name} must use HTTPS outside loopback`, { retryable: false });
  }
  return url;
}

function validatedToken(name: string): string {
  const token = requiredEnvironment(name);
  if (token.length < 16) {
    throw new DependencyUnavailableError("production-adapter.config", `${name} must contain at least 16 characters`, { retryable: false });
  }
  return token;
}

export function assertProductionAdapterConfiguration(): void {
  for (const prefix of ["JDZ_AI_PLATFORM", "JDZ_BUSINESS_DATA"] as const) {
    validatedBaseUrl(`${prefix}_BASE_URL`);
    validatedToken(`${prefix}_AUTH_TOKEN`);
  }
}

function assertTrustedIdentity(identity: RequestIdentity | undefined): asserts identity is RequestIdentity {
  if (!identity || identity.source !== "trusted-gateway" || !identity.tenantId || !identity.subjectId) {
    throw new DependencyUnavailableError("production-adapter.identity", "A trusted tenant identity is required", { retryable: false });
  }
}

export class ProductionHttpClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly access: AgentAccessContext;

  constructor(
    private readonly kind: AdapterKind,
    identity: RequestIdentity,
  ) {
    assertTrustedIdentity(identity);
    this.access = accessContextFromIdentity(identity);
    const prefix = kind === "ai-platform" ? "JDZ_AI_PLATFORM" : "JDZ_BUSINESS_DATA";
    this.baseUrl = validatedBaseUrl(`${prefix}_BASE_URL`);
    this.token = validatedToken(`${prefix}_AUTH_TOKEN`);
  }

  async call<T>(
    agentId: string,
    operation: string,
    payload: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!allowedOperations[`${agentId}:${this.kind}`]?.has(operation)) {
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, "The requested adapter operation is not allowlisted", { retryable: false });
    }
    const pathname = `/v1/agent-ports/${agentId.toLowerCase()}/${this.kind}/${operation}`;
    const url = new URL(pathname, this.baseUrl);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-JDZ-Adapter-Contract": ADAPTER_CONTRACT_VERSION,
          "X-JDZ-Tenant-Id": this.access.tenantId,
          "X-JDZ-Subject-Id": this.access.subjectId,
          "X-JDZ-Roles": [...this.access.roles].sort().join(","),
          "X-JDZ-Purpose": this.access.purpose,
          "X-JDZ-Untrusted-Content": "true",
          "X-JDZ-Safety-Policy": AI_SAFETY_POLICY_VERSION,
          ...(currentAgentTraceId() ? { "X-Trace-Id": currentAgentTraceId()! } : {}),
        },
        body: JSON.stringify({ contract_version: ADAPTER_CONTRACT_VERSION, data: payload }),
        signal,
        cache: "no-store",
      });
    } catch (error) {
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, "Production adapter request failed", { cause: error });
    }
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, `Production adapter returned HTTP ${response.status}`, { retryable });
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ADAPTER_RESPONSE_BYTES) {
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, "Production adapter response is too large");
    }
    let body: unknown;
    try {
      const text = await response.text();
      if (new TextEncoder().encode(text).length > MAX_ADAPTER_RESPONSE_BYTES) {
        throw new Error("adapter response exceeds the maximum size");
      }
      body = JSON.parse(text);
    } catch (error) {
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, "Production adapter returned invalid JSON", { cause: error });
    }
    const envelope = AdapterEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, "Production adapter envelope is invalid", { cause: envelope.error });
    }
    if (envelope.data.meta.tenant_id !== this.access.tenantId) {
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, "Production adapter returned data for a different tenant");
    }
    if (this.kind === "business-data" && envelope.data.meta.source_ids.length === 0) {
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, "Business data response is missing source provenance");
    }
    if (envelope.data.meta.classification === "restricted" && !this.access.roles.includes("restricted-data-reader")) {
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, "The current identity cannot access restricted upstream data");
    }
    const parsed = schema.safeParse(envelope.data.data);
    if (!parsed.success) {
      throw new DependencyUnavailableError(`${agentId}.${this.kind}`, "Production adapter data violates the Agent port contract", { cause: parsed.error });
    }
    return parsed.data;
  }
}

export function productionClients(identity: RequestIdentity | undefined) {
  assertTrustedIdentity(identity);
  return {
    ai: new ProductionHttpClient("ai-platform", identity),
    data: new ProductionHttpClient("business-data", identity),
  };
}
