import { defineLegacyBackedAgentModule } from "../../agent-sdk/index.ts";
import { Ag001InvokeRequestSchema, AgentInvokeResponseSchema } from "../../contracts.ts";
import { getR0FoundationPorts } from "../../r0/foundation-ports.ts";
import { AG001_CONFIG } from "./config.ts";
import { invokeAg001 } from "./workflow.ts";

export const ag001Module = defineLegacyBackedAgentModule({
  definition: {
    id: "AG-001", requestSchema: Ag001InvokeRequestSchema, responseSchema: AgentInvokeResponseSchema,
    accessPolicy: { productionRequiresTrustedIdentity: true, requiredAnyRole: ["agent-user", "buyer", "operator", "admin"] },
    timeoutPolicy: { totalTimeoutMs: 25_000, maxSynchronousMs: 15_000 }, executionMode: "synchronous",
    versions: { capability: "AG-001@2.0", workflow: AG001_CONFIG.workflowVersion, prompt: "structured-intent@2", rule: AG001_CONFIG.ruleVersion, model: "upstream-managed" },
  },
  ports: getR0FoundationPorts(),
  invokeLegacy: invokeAg001,
  reviewReason: (response) => `产品参数、约束或证据不足：${response.output.summary}`,
});
