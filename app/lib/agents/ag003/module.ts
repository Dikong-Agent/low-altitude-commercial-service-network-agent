import { defineLegacyBackedAgentModule } from "../../agent-sdk/index.ts";
import { Ag003InvokeRequestSchema, AgentInvokeResponseSchema } from "../../contracts.ts";
import { getR0FoundationPorts } from "../../r0/foundation-ports.ts";
import { AG003_CONFIG } from "./config.ts";
import { invokeAg003 } from "./workflow.ts";

export const ag003Module = defineLegacyBackedAgentModule({
  definition: {
    id: "AG-003", requestSchema: Ag003InvokeRequestSchema, responseSchema: AgentInvokeResponseSchema,
    accessPolicy: { productionRequiresTrustedIdentity: true, requiredAnyRole: ["agent-user", "buyer", "operator", "admin"] },
    timeoutPolicy: { totalTimeoutMs: 25_000, maxSynchronousMs: 15_000 }, executionMode: "synchronous",
    versions: { capability: "AG-003@2.0", workflow: "1.0.0", prompt: "recommendation-intent@2", rule: AG003_CONFIG.ruleVersion, model: "upstream-managed" },
  },
  ports: getR0FoundationPorts(),
  invokeLegacy: invokeAg003,
  reviewReason: (response) => `推荐必要条件、候选依据或适用范围需要人工确认：${response.output.summary}`,
});
