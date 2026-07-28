import { getRuntimeBindings } from "./runtime-bindings";

export type AgentRuntimeMode = "demo" | "production";

export interface RequestIdentity {
  source: "demo" | "trusted-gateway";
  tenantId: string;
  subjectId: string;
  roles: string[];
}

export class RequestIdentityError extends Error {
  constructor(
    public readonly code: "AUTHENTICATION_REQUIRED" | "INVALID_AUTHENTICATION" | "AUTH_CONFIGURATION_ERROR",
    public readonly status: 401 | 503,
    message: string,
  ) {
    super(message);
    this.name = "RequestIdentityError";
  }
}

const AUTH_VERSION = "v1";
const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 300;
const MIN_SHARED_SECRET_BYTES = 32;
const MAX_ROLES = 20;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const ROLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function getAgentRuntimeMode(): AgentRuntimeMode {
  const value = process.env.AGENT_RUNTIME_MODE ?? "demo";
  if (value === "demo" || value === "production") return value;
  throw new RequestIdentityError("AUTH_CONFIGURATION_ERROR", 503, "Agent runtime authentication is not configured correctly");
}

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new RequestIdentityError("AUTHENTICATION_REQUIRED", 401, "Trusted gateway authentication is required");
  return value;
}

function normalizeRoles(value: string): string[] {
  const roles = [...new Set(value.split(",").map((role) => role.trim().toLowerCase()).filter(Boolean))].sort();
  if (!roles.length || roles.length > MAX_ROLES || roles.some((role) => !ROLE_PATTERN.test(role))) {
    throw new RequestIdentityError("INVALID_AUTHENTICATION", 401, "Trusted gateway authentication is invalid");
  }
  return roles;
}

function maxClockSkewSeconds(): number {
  const value = Number(process.env.JDZ_AUTH_MAX_CLOCK_SKEW_SECONDS ?? DEFAULT_MAX_CLOCK_SKEW_SECONDS);
  if (!Number.isInteger(value) || value < 30 || value > 900) {
    throw new RequestIdentityError("AUTH_CONFIGURATION_ERROR", 503, "Agent runtime authentication is not configured correctly");
  }
  return value;
}

function sharedSecret(): Uint8Array {
  const value = process.env.JDZ_GATEWAY_SHARED_SECRET ?? "";
  const bytes = new TextEncoder().encode(value);
  if (bytes.length < MIN_SHARED_SECRET_BYTES) {
    throw new RequestIdentityError("AUTH_CONFIGURATION_ERROR", 503, "Agent runtime authentication is not configured correctly");
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new RequestIdentityError("INVALID_AUTHENTICATION", 401, "Trusted gateway authentication is invalid");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  } catch {
    throw new RequestIdentityError("INVALID_AUTHENTICATION", 401, "Trusted gateway authentication is invalid");
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function buildGatewaySignatureInput(
  request: Pick<Request, "method" | "url" | "headers">,
  rawBody: string,
  identity: Pick<RequestIdentity, "tenantId" | "subjectId" | "roles">,
  timestamp: string,
  nonce: string,
): Promise<string> {
  return [
    "JDZ-AUTH-V1",
    request.method.toUpperCase(),
    `${new URL(request.url).pathname}${new URL(request.url).search}`,
    timestamp,
    nonce,
    identity.tenantId,
    identity.subjectId,
    [...new Set(identity.roles.map((role) => role.trim().toLowerCase()).filter(Boolean))].sort().join(","),
    request.headers.get("idempotency-key")?.trim() ?? "",
    request.headers.get("prefer")?.trim().toLowerCase() ?? "",
    request.headers.get("x-jdz-callback-id")?.trim() ?? "",
    await sha256Hex(rawBody),
  ].join("\n");
}

async function claimAuthenticationNonce(identity: RequestIdentity, nonce: string): Promise<void> {
  const db = getRuntimeBindings()?.DB;
  if (!db) {
    throw new RequestIdentityError("AUTH_CONFIGURATION_ERROR", 503, "Agent runtime authentication is temporarily unavailable");
  }
  const now = new Date();
  const expires = new Date(now.getTime() + maxClockSkewSeconds() * 2_000).toISOString();
  try {
    const result = await db.prepare(
      "INSERT INTO auth_nonce_records (tenant_id, nonce, subject_id, received_at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, nonce) DO NOTHING",
    ).bind(identity.tenantId, nonce, identity.subjectId, now.toISOString(), expires).run();
    if ((result.meta?.changes ?? 0) === 0) {
      throw new RequestIdentityError("INVALID_AUTHENTICATION", 401, "Trusted gateway authentication was already used");
    }
  } catch (error) {
    if (error instanceof RequestIdentityError) throw error;
    throw new RequestIdentityError("AUTH_CONFIGURATION_ERROR", 503, "Agent runtime authentication is temporarily unavailable");
  }
}

async function verifyTrustedGatewayIdentity(request: Request, rawBody: string): Promise<RequestIdentity> {
  if (requiredHeader(request, "x-jdz-auth-version") !== AUTH_VERSION) {
    throw new RequestIdentityError("INVALID_AUTHENTICATION", 401, "Trusted gateway authentication is invalid");
  }

  const tenantId = requiredHeader(request, "x-jdz-tenant-id");
  const subjectId = requiredHeader(request, "x-jdz-subject-id");
  const roles = normalizeRoles(requiredHeader(request, "x-jdz-roles"));
  const timestamp = requiredHeader(request, "x-jdz-auth-timestamp");
  const nonce = requiredHeader(request, "x-jdz-auth-nonce");
  const signature = requiredHeader(request, "x-jdz-auth-signature");

  if (!ID_PATTERN.test(tenantId) || !ID_PATTERN.test(subjectId) || !NONCE_PATTERN.test(nonce)) {
    throw new RequestIdentityError("INVALID_AUTHENTICATION", 401, "Trusted gateway authentication is invalid");
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (!Number.isInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > maxClockSkewSeconds()) {
    throw new RequestIdentityError("INVALID_AUTHENTICATION", 401, "Trusted gateway authentication has expired");
  }

  const identity: RequestIdentity = { source: "trusted-gateway", tenantId, subjectId, roles };
  const input = await buildGatewaySignatureInput(request, rawBody, identity, timestamp, nonce);
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(sharedSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(base64UrlToBytes(signature)),
    toArrayBuffer(new TextEncoder().encode(input)),
  );
  if (!verified) throw new RequestIdentityError("INVALID_AUTHENTICATION", 401, "Trusted gateway authentication is invalid");
  await claimAuthenticationNonce(identity, nonce);
  return identity;
}

export function assertProductionAuthConfiguration(): void {
  sharedSecret();
  maxClockSkewSeconds();
}

export async function resolveRequestIdentity(request: Request, rawBody: string): Promise<RequestIdentity> {
  if (getAgentRuntimeMode() === "demo") {
    return { source: "demo", tenantId: "DEMO-TENANT", subjectId: "DEMO-VISITOR", roles: ["visitor"] };
  }
  return verifyTrustedGatewayIdentity(request, rawBody);
}
