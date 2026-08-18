import { z } from "zod/v4";
import { KnowledgeDocumentSchema } from "../../../lib/rag/contracts.ts";
import { getSharedRagRuntime } from "../../../lib/rag/runtime.ts";
import { getAgentRuntimeMode, RequestIdentityError, resolveRequestIdentity } from "../../../lib/request-identity";

const NamespaceSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/);
const BodySchema = z.object({ namespace: NamespaceSchema, mode: z.enum(["upsert", "replace"]).default("upsert"), documents: z.array(KnowledgeDocumentSchema).min(1).max(50) });
const MAX_BODY_BYTES = 2_000_000;

function error(status: number, code: string, message: string): Response { return Response.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } }); }
function authorizeDemo(request: Request): boolean {
  const configured = process.env.JDZ_DEMO_RAG_ADMIN_TOKEN;
  return Boolean(configured && configured.length >= 24 && request.headers.get("x-demo-rag-admin-token") === configured);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return error(413, "RAG_BODY_TOO_LARGE", "Knowledge ingestion body is too large");
  try {
    const identity = await resolveRequestIdentity(request, rawBody); const mode = getAgentRuntimeMode();
    if (mode === "demo" ? !authorizeDemo(request) : !identity.roles.some((role) => role === "admin" || role === "knowledge-admin")) return error(403, "RAG_INGESTION_FORBIDDEN", "Knowledge ingestion requires an authorized administrator");
    const parsed = BodySchema.safeParse(JSON.parse(rawBody)); if (!parsed.success) return error(400, "RAG_INGESTION_INVALID", "Knowledge ingestion request violates the contract");
    if (parsed.data.documents.some((document) => document.tenantId !== identity.tenantId)) return error(403, "RAG_TENANT_MISMATCH", "Every document must belong to the authenticated tenant");
    const runtime = getSharedRagRuntime(); const namespace = `${identity.tenantId}-${parsed.data.namespace}`.toLocaleLowerCase("en-US");
    const publications = parsed.data.mode === "replace" ? await runtime.ingestDocuments(namespace, parsed.data.documents, request.signal) : await runtime.upsertDocuments(namespace, parsed.data.documents, request.signal);
    return Response.json({ status: "published", publications }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof RequestIdentityError) return error(caught.status, caught.code, caught.message);
    if (caught instanceof SyntaxError) return error(400, "RAG_INGESTION_INVALID_JSON", "Knowledge ingestion body must be valid JSON");
    return error(503, "RAG_INGESTION_FAILED", "Knowledge ingestion failed");
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request, ""); const mode = getAgentRuntimeMode();
    if (mode === "demo" ? !authorizeDemo(request) : !identity.roles.some((role) => role === "admin" || role === "knowledge-admin")) return error(403, "RAG_INGESTION_FORBIDDEN", "Knowledge deletion requires an authorized administrator");
    const url = new URL(request.url); const parsedNamespace = NamespaceSchema.safeParse(url.searchParams.get("namespace"));
    if (!parsedNamespace.success) return error(400, "RAG_NAMESPACE_INVALID", "A valid knowledge namespace is required");
    const documentIds = url.searchParams.getAll("document_id").map((item) => item.trim()).filter(Boolean);
    if (documentIds.length > 50) return error(400, "RAG_DELETE_TOO_MANY_DOCUMENTS", "At most 50 document ids may be deleted at once");
    const namespace = `${identity.tenantId}-${parsedNamespace.data}`.toLocaleLowerCase("en-US");
    const publication = await getSharedRagRuntime().deleteDocuments(namespace, documentIds.length ? documentIds : undefined, request.signal);
    return Response.json({ status: publication ? "deleted" : "not_found", namespace: parsedNamespace.data, document_ids: documentIds }, { status: publication ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof RequestIdentityError) return error(caught.status, caught.code, caught.message);
    return error(503, "RAG_DELETE_FAILED", "Knowledge deletion failed");
  }
}
