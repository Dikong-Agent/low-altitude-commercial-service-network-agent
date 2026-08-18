import { z } from "zod/v4";
import { getAgentRuntimeMode, RequestIdentityError, resolveRequestIdentity } from "../../lib/request-identity.ts";
import { EvaluationStoreError, getEvaluationDashboard, runEvaluation, setEvaluationBaseline } from "../../lib/rag-evaluation/store.ts";

const ActionSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("run") }), z.object({ action: z.literal("set_baseline"), runId: z.string().min(1) })]);
function error(status: number, code: string, message: string): Response { return Response.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } }); }
function loopback(hostname: string): boolean { return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]"; }
async function authorize(request: Request, rawBody: string, mutation: boolean) {
  const identity = await resolveRequestIdentity(request, rawBody); const url = new URL(request.url);
  const allowed = getAgentRuntimeMode() === "demo" ? loopback(url.hostname) && (!mutation || !request.headers.get("origin") || request.headers.get("origin") === url.origin) : identity.roles.some((role) => ["admin", "knowledge-admin", "evaluator"].includes(role));
  if (!allowed) throw new EvaluationStoreError("EVALUATION_FORBIDDEN", 403, "RAG评测操作需要授权评测人员身份"); return identity;
}
export async function GET(request: Request) {
  try { await authorize(request, "", false); return Response.json(await getEvaluationDashboard(), { headers: { "Cache-Control": "no-store" } }); }
  catch (caught) { if (caught instanceof RequestIdentityError) return error(caught.status, caught.code, caught.message); if (caught instanceof EvaluationStoreError) return error(caught.status, caught.code, caught.message); return error(503, "EVALUATION_UNAVAILABLE", "RAG评测服务暂不可用"); }
}
export async function POST(request: Request) {
  const rawBody = await request.text();
  try { await authorize(request, rawBody, true); const parsed = ActionSchema.safeParse(JSON.parse(rawBody)); if (!parsed.success) return error(400, "EVALUATION_ACTION_INVALID", "评测请求不符合接口约定"); const result = parsed.data.action === "run" ? await runEvaluation() : await setEvaluationBaseline(parsed.data.runId); return Response.json({ status: "ok", result }, { headers: { "Cache-Control": "no-store" } }); }
  catch (caught) { if (caught instanceof SyntaxError) return error(400, "EVALUATION_JSON_INVALID", "请求正文必须是有效JSON"); if (caught instanceof RequestIdentityError) return error(caught.status, caught.code, caught.message); if (caught instanceof EvaluationStoreError) return error(caught.status, caught.code, caught.message); return error(503, "EVALUATION_RUN_FAILED", caught instanceof Error ? caught.message : "RAG评测执行失败"); }
}
