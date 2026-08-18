import { z } from "zod/v4";
import { createDefaultQueryPlan } from "../../../lib/rag/kernel.ts";
import { getRagAgentProfile } from "../../../lib/rag/profiles.ts";
import { getSharedRagRuntime } from "../../../lib/rag/runtime.ts";
import { RequestIdentityError, resolveRequestIdentity } from "../../../lib/request-identity";

const BodySchema = z.object({
  agent_id: z.enum(["AG-001", "AG-012", "AG-025", "AG-027"]), query: z.string().trim().min(1).max(8000),
  namespace: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/),
  exact_terms: z.array(z.string().trim().min(1)).max(20).default([]), filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}), as_of: z.string().datetime({ offset: true }).optional(),
});
function error(status: number, code: string, message: string): Response { return Response.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const identity = await resolveRequestIdentity(request, rawBody); const parsed = BodySchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return error(400, "RAG_QUERY_INVALID", "RAG query violates the contract");
    const profile = getRagAgentProfile(parsed.data.agent_id); const result = await getSharedRagRuntime().answer({
      query: parsed.data.query,
      plan: createDefaultQueryPlan({ agentId: parsed.data.agent_id, query: parsed.data.query, knowledgeDomains: profile.knowledgeDomains, asOf: parsed.data.as_of, exactTerms: parsed.data.exact_terms, filters: parsed.data.filters }),
      access: { tenantId: identity.tenantId, roles: identity.roles }, namespaces: [`${identity.tenantId}-${parsed.data.namespace}`.toLocaleLowerCase("en-US")], ...profile.retrieval,
    }, request.signal);
    return Response.json(result, { status: result.status === "validation_failed" ? 502 : result.status === "insufficient_evidence" ? 422 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof RequestIdentityError) return error(caught.status, caught.code, caught.message);
    if (caught instanceof SyntaxError) return error(400, "RAG_QUERY_INVALID_JSON", "RAG query body must be valid JSON");
    return error(503, "RAG_QUERY_FAILED", "RAG query failed");
  }
}
