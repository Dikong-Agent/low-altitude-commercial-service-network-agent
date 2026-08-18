import { defineLegacyBackedAgentModule } from "../../agent-sdk/index.ts";
import { Ag012InvokeRequestSchema, AgentInvokeResponseSchema } from "../../contracts.ts";
import { getR0FoundationPorts } from "../../r0/foundation-ports.ts";
import { AG012_CONFIG } from "./config.ts";
import { invokeAg012 } from "./workflow.ts";

export const ag012Module = defineLegacyBackedAgentModule({
  definition: {
    id: "AG-012", requestSchema: Ag012InvokeRequestSchema, responseSchema: AgentInvokeResponseSchema,
    accessPolicy: { productionRequiresTrustedIdentity: true, requiredAnyRole: ["agent-user", "operator", "admin"] },
    timeoutPolicy: { totalTimeoutMs: 35_000, maxSynchronousMs: 15_000 }, executionMode: "async-capable",
    versions: { capability: "AG-012@2.0", workflow: AG012_CONFIG.workflowVersion, prompt: "policy-grounding@3", rule: AG012_CONFIG.ruleVersion, model: "upstream-managed" },
  },
  ports: getR0FoundationPorts(),
  invokeLegacy: (request, traceId, identity) => invokeAg012(Ag012InvokeRequestSchema.parse(request), traceId, identity),
  reviewReason: (response) => `政策版本、适用条件或专业结论需要人工核验：${response.output.summary}`,
});
