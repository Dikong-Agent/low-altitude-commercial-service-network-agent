import { AGENTS } from "../../lib/contracts";

export async function GET() {
  return Response.json({ environment: "demo", items: AGENTS, interface_version: "v1" });
}
