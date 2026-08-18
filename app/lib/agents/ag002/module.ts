import { defineLegacyBackedAgentModule } from "../../agent-sdk/index.ts";
import { Ag002InvokeRequestSchema, AgentInvokeResponseSchema } from "../../contracts.ts";
import { getR0FoundationPorts } from "../../r0/foundation-ports.ts";
import { AG002_CONFIG } from "./config.ts";
import { invokeAg002 } from "./workflow.ts";

export const ag002Module = defineLegacyBackedAgentModule({
  definition: {
    id: "AG-002", requestSchema: Ag002InvokeRequestSchema, responseSchema: AgentInvokeResponseSchema,
    accessPolicy: { productionRequiresTrustedIdentity: true, requiredAnyRole: ["agent-user", "operator", "admin"] },
    timeoutPolicy: { totalTimeoutMs: 40_000, maxSynchronousMs: 15_000 }, executionMode: "async-capable",
    versions: { capability: "AG-002@2.0", workflow: AG002_CONFIG.workflowVersion, prompt: "manual-grounding@2", rule: AG002_CONFIG.ruleVersion, model: "upstream-managed" },
  },
  ports: getR0FoundationPorts(),
  invokeLegacy: invokeAg002,
  reviewReason: (response) => `说明书证据、安全警告或操作条件需要专业复核：${response.output.summary}`,
});
