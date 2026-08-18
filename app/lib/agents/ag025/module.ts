import { defineLegacyBackedAgentModule } from "../../agent-sdk/index.ts";
import { Ag025InvokeRequestSchema, AgentInvokeResponseSchema } from "../../contracts.ts";
import { getR0FoundationPorts } from "../../r0/foundation-ports.ts";
import { AG025_CONFIG } from "./config.ts";
import { customerAccessScopeFromIdentity } from "./providers.ts";
import { invokeAg025 } from "./workflow.ts";

export const ag025Module = defineLegacyBackedAgentModule({
  definition: {
    id: "AG-025", requestSchema: Ag025InvokeRequestSchema, responseSchema: AgentInvokeResponseSchema,
    accessPolicy: { productionRequiresTrustedIdentity: true, requiredAnyRole: ["agent-user", "customer-service", "operator", "admin"] },
    timeoutPolicy: { totalTimeoutMs: 25_000, maxSynchronousMs: 15_000 }, executionMode: "synchronous",
    versions: { capability: "AG-025@2.0", workflow: AG025_CONFIG.workflowVersion, prompt: "customer-orchestration@3", rule: AG025_CONFIG.ruleVersion, model: "upstream-managed" },
  },
  ports: getR0FoundationPorts(),
  invokeLegacy: (request, traceId, identity) => invokeAg025(request, traceId, customerAccessScopeFromIdentity(identity), identity),
  reviewReason: (response) => `客服问题需要人工介入、业务确认或补充处理：${response.output.summary}`,
});
