import { defineLegacyBackedAgentModule } from "../../agent-sdk/index.ts";
import { Ag027InvokeRequestSchema, AgentInvokeResponseSchema } from "../../contracts.ts";
import { getR0FoundationPorts } from "../../r0/foundation-ports.ts";
import { AG027_CONFIG } from "./config.ts";
import { invokeAg027 } from "./workflow.ts";

export const ag027Module = defineLegacyBackedAgentModule({
  definition: {
    id: "AG-027", requestSchema: Ag027InvokeRequestSchema, responseSchema: AgentInvokeResponseSchema,
    accessPolicy: { productionRequiresTrustedIdentity: true, requiredAnyRole: ["agent-user", "operator", "admin"] },
    timeoutPolicy: { totalTimeoutMs: 25_000, maxSynchronousMs: 15_000 }, executionMode: "synchronous",
    versions: { capability: "AG-027@3.0", workflow: AG027_CONFIG.workflowVersion, prompt: "metric-analysis@3", rule: AG027_CONFIG.ruleVersion, model: "upstream-managed" },
  },
  ports: getR0FoundationPorts(),
  invokeLegacy: (request, traceId, identity) => invokeAg027(Ag027InvokeRequestSchema.parse(request), traceId, identity),
  reviewReason: (response) => `指标口径、数据质量、异常或归因线索需要业务复核：${response.output.summary}`,
});
