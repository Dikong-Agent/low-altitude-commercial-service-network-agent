import { AGENTS } from "../../lib/agent-registry";
import { AGENT_INTERFACE_VERSION } from "../../lib/contracts";

export async function GET() {
  return Response.json({ environment: "demo", items: AGENTS, interface_version: AGENT_INTERFACE_VERSION });
}
