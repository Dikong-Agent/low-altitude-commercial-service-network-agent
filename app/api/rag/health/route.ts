import { getRagRuntimeHealth } from "../../../lib/rag/runtime.ts";

export async function GET() {
  const health = getRagRuntimeHealth();
  return Response.json(health, { status: health.status === "ready" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
