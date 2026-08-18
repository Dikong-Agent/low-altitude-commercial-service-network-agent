import { AGENT_INTERFACE_VERSION } from "../contracts.ts";
import { R0_FOUNDATION_VERSION } from "./contracts.ts";

const errorResponse = { description: "统一错误响应", content: { "application/json": { schema: { $ref: "#/components/schemas/RuntimeError" } } } };

export function r0OpenApiDocument(origin = "https://agent-runtime.example.invalid") {
  return {
    openapi: "3.1.0",
    info: { title: "景德镇低空商业服务网业务Agent Runtime API", version: R0_FOUNDATION_VERSION, description: "我方28个业务Agent应用层公共接口。AI中台、数据中台和业务系统仍由对应责任方建设。" },
    servers: [{ url: origin }],
    paths: {
      "/health/live": { get: { operationId: "runtimeLiveness", responses: { "200": { description: "进程存活" } } } },
      "/health/ready": { get: { operationId: "runtimeReadiness", responses: { "200": { description: "生产依赖就绪" }, "503": errorResponse } } },
      "/v1/agents": { get: { operationId: "listAgents", security: [{ trustedGateway: [] }], responses: { "200": { description: "Agent注册清单" }, "401": errorResponse } } },
      "/v1/agents/{agentId}/invoke": { post: { operationId: "invokeAgent", security: [{ trustedGateway: [] }], parameters: [{ $ref: "#/components/parameters/AgentId" }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AgentInvokeRequest" } } } }, responses: { "200": { description: "同步Agent结果" }, "202": { description: "Prefer: respond-async时接受异步任务" }, "400": errorResponse, "401": errorResponse, "503": errorResponse } } },
      "/v1/agents/{agentId}/tasks": { post: { operationId: "createAgentTask", security: [{ trustedGateway: [] }], parameters: [{ $ref: "#/components/parameters/AgentId" }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AgentInvokeRequest" } } } }, responses: { "202": { description: "任务已入队" }, "400": errorResponse, "401": errorResponse, "409": errorResponse, "503": errorResponse } } },
      "/v1/tasks/{taskId}": { get: { operationId: "getAgentTask", security: [{ trustedGateway: [] }], parameters: [{ $ref: "#/components/parameters/TaskId" }], responses: { "200": { description: "任务状态" }, "404": errorResponse } } },
      "/v1/tasks/{taskId}/cancel": { post: { operationId: "cancelAgentTask", security: [{ trustedGateway: [] }], parameters: [{ $ref: "#/components/parameters/TaskId" }], responses: { "200": { description: "排队任务已取消" }, "404": errorResponse, "409": errorResponse } } },
      "/v1/reviews": { post: { operationId: "submitHumanReview", security: [{ trustedGateway: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/HumanReviewSubmission" } } } }, responses: { "201": { description: "复核事项已建立" }, "400": errorResponse } } },
      "/v1/reviews/{reviewId}": { get: { operationId: "getHumanReview", security: [{ trustedGateway: [] }], parameters: [{ $ref: "#/components/parameters/ReviewId" }], responses: { "200": { description: "复核状态" }, "404": errorResponse } } },
      "/v1/reviews/{reviewId}/callback": { post: { operationId: "resolveHumanReview", security: [{ trustedGateway: [] }], parameters: [{ $ref: "#/components/parameters/ReviewId" }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/HumanReviewCallback" } } } }, responses: { "200": { description: "复核结果已回传" }, "400": errorResponse, "409": errorResponse } } },
    },
    components: {
      securitySchemes: { trustedGateway: { type: "apiKey", in: "header", name: "X-JDZ-Signature", description: "可信网关签名，同时包含租户、主体、角色、时间戳和一次性nonce。" } },
      parameters: {
        AgentId: { name: "agentId", in: "path", required: true, schema: { type: "string", pattern: "^AG-[0-9]{3}$" } },
        TaskId: { name: "taskId", in: "path", required: true, schema: { type: "string", pattern: "^TSK-[A-Z0-9-]+$" } },
        ReviewId: { name: "reviewId", in: "path", required: true, schema: { type: "string", pattern: "^RVW-[A-Z0-9-]+$" } },
      },
      schemas: {
        AgentInvokeRequest: { type: "object", additionalProperties: false, required: ["agent_id", "input"], properties: { agent_id: { type: "string" }, input: { type: "string", minLength: 1, maxLength: 2000 }, session_id: { type: "string" }, context: { type: "object" } } },
        RuntimeError: { type: "object", additionalProperties: false, required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, trace_id: { type: "string" } } },
        HumanReviewSubmission: { type: "object", additionalProperties: false, required: ["agent_id", "trace_id", "reason"], properties: { agent_id: { type: "string" }, trace_id: { type: "string" }, reason: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, proposed_action: { type: "string" }, expires_at: { type: "string", format: "date-time" } } },
        HumanReviewCallback: { type: "object", additionalProperties: false, required: ["decision", "reviewer_id", "decided_at"], properties: { decision: { enum: ["approved", "rejected", "needs_more_information"] }, reviewer_id: { type: "string" }, comment: { type: "string" }, decided_at: { type: "string", format: "date-time" }, evidence: { type: "array", items: { type: "string" } } } },
      },
      headers: { "X-Agent-Interface-Version": { schema: { type: "string", const: AGENT_INTERFACE_VERSION } } },
    },
    "x-jdz-outbound-ports": {
      "ai-platform": { route: "/v1/agent-ports/{agentId}/ai-platform/{operation}", ownership: "甲方AI中台", adapter: "HttpAIPlatformPort" },
      "knowledge-search": { route: "/v1/agent-ports/{agentId}/knowledge-search/{operation}", ownership: "甲方AI中台或其授权知识检索服务", adapter: "HttpKnowledgeSearchPort" },
      "business-data": { route: "/v1/agent-ports/{agentId}/business-data/{operation}", ownership: "数据中台或业务系统", adapter: "HttpBusinessDataPort" },
      "business-action": { route: "/v1/agent-ports/{agentId}/business-action/{operation}", ownership: "业务系统", adapter: "HttpBusinessActionPort", requirement: "execute模式必须携带审批令牌和幂等键" },
    },
    "x-jdz-boundary": "本接口只定义业务Agent应用层契约；不代表甲方AI中台或合作方业务系统协议已经确认。",
  } as const;
}
