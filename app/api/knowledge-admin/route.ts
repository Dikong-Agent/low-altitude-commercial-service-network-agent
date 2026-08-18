import { z } from "zod/v4";
import { getAgentRuntimeMode, RequestIdentityError, resolveRequestIdentity } from "../../lib/request-identity.ts";
import { MetadataPatchSchema, RegisterKnowledgeSchema } from "../../lib/knowledge-admin/contracts.ts";
import {
  getKnowledgeDashboard, KnowledgeAdminError, publishKnowledge, registerKnowledge, reviewQaSample,
  rollbackKnowledge, submitKnowledgeReview, updateKnowledgeMetadata, withdrawKnowledge,
} from "../../lib/knowledge-admin/store.ts";

const MAX_BODY_BYTES = 1_700_000;
const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register"), payload: RegisterKnowledgeSchema }),
  z.object({ action: z.literal("update_metadata"), documentId: z.string().min(1), patch: MetadataPatchSchema }),
  z.object({ action: z.literal("submit_review"), documentId: z.string().min(1) }),
  z.object({ action: z.literal("publish"), documentId: z.string().min(1) }),
  z.object({ action: z.literal("withdraw"), documentId: z.string().min(1) }),
  z.object({ action: z.literal("rollback"), documentId: z.string().min(1), revisionId: z.string().min(1).optional() }),
  z.object({ action: z.literal("qa_review"), sampleId: z.string().min(1), result: z.enum(["pass", "fail"]), note: z.string().max(1000).default("") }),
]);

function responseError(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}
function isLoopback(hostname: string): boolean { return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]"; }
function authorizeDemo(request: Request, mutation: boolean): boolean {
  const url = new URL(request.url);
  if (!isLoopback(url.hostname)) return false;
  if (!mutation) return true;
  const origin = request.headers.get("origin");
  return !origin || origin === url.origin;
}
async function authorize(request: Request, rawBody: string, mutation: boolean) {
  const identity = await resolveRequestIdentity(request, rawBody);
  const allowed = getAgentRuntimeMode() === "demo"
    ? authorizeDemo(request, mutation)
    : identity.roles.some((role) => role === "admin" || role === "knowledge-admin");
  if (!allowed) throw new KnowledgeAdminError("KNOWLEDGE_ADMIN_FORBIDDEN", 403, "知识管理操作需要授权管理员身份");
  return identity;
}

export async function GET(request: Request) {
  try {
    await authorize(request, "", false);
    return Response.json(await getKnowledgeDashboard(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestIdentityError) return responseError(error.status, error.code, error.message);
    if (error instanceof KnowledgeAdminError) return responseError(error.status, error.code, error.message);
    return responseError(503, "KNOWLEDGE_ADMIN_UNAVAILABLE", "知识管理服务暂不可用");
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return responseError(413, "KNOWLEDGE_BODY_TOO_LARGE", "上传内容超过当前演示环境限制");
  try {
    const identity = await authorize(request, rawBody, true);
    const parsed = ActionSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return responseError(400, "KNOWLEDGE_ACTION_INVALID", "知识管理请求不符合接口约定");
    const actor = identity.source === "demo" ? "本地演示管理员" : identity.subjectId;
    let result: unknown;
    switch (parsed.data.action) {
      case "register": result = await registerKnowledge(parsed.data.payload, actor); break;
      case "update_metadata": result = await updateKnowledgeMetadata(parsed.data.documentId, parsed.data.patch, actor); break;
      case "submit_review": result = await submitKnowledgeReview(parsed.data.documentId, actor); break;
      case "publish": result = await publishKnowledge(parsed.data.documentId, actor, request.signal); break;
      case "withdraw": result = await withdrawKnowledge(parsed.data.documentId, actor, request.signal); break;
      case "rollback": result = await rollbackKnowledge(parsed.data.documentId, parsed.data.revisionId, actor, request.signal); break;
      case "qa_review": result = await reviewQaSample(parsed.data.sampleId, parsed.data.result, parsed.data.note, actor); break;
    }
    return Response.json({ status: "ok", result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return responseError(400, "KNOWLEDGE_JSON_INVALID", "请求正文必须是有效 JSON");
    if (error instanceof RequestIdentityError) return responseError(error.status, error.code, error.message);
    if (error instanceof KnowledgeAdminError) return responseError(error.status, error.code, error.message);
    return responseError(503, "KNOWLEDGE_ACTION_FAILED", error instanceof Error ? error.message : "知识管理操作执行失败");
  }
}
