import { handleAgentInvocation } from "../../../../lib/agent-runtime-handler";

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await context.params;
  return handleAgentInvocation(request, agentId);
}
