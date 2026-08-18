import { AGENT_INTERFACE_VERSION } from "../../lib/contracts";
import { R0_FOUNDATION_VERSION } from "../../lib/r0/contracts";

export async function GET() {
  return Response.json({
    status: "live",
    environment: "demo",
    foundation_version: R0_FOUNDATION_VERSION,
    interface_version: AGENT_INTERFACE_VERSION,
    checks: { runtime: "ready", providers: "degraded", persistence: "degraded" },
    boundary: "研发演示实例存活；生产就绪状态以独立Agent Runtime的/health/ready为准。",
  }, { headers: { "Cache-Control": "no-store" } });
}

