import { getHumanReview, resolveHumanReview, submitHumanReview } from "../human-review.ts";
import type { RequestIdentity } from "../request-identity.ts";
import type { AgentAccessContext } from "../runtime-ports.ts";
import { HttpAIPlatformPort, HttpBusinessActionPort, HttpBusinessDataPort, HttpKnowledgeSearchPort } from "./http-platform-ports.ts";
import type { AuditStorePort, HumanReviewPort, R0FoundationPorts, TaskQueuePort } from "./platform-ports.ts";

function internalIdentity(access: AgentAccessContext): RequestIdentity {
  if (access.source !== "demo") return { source: access.source, tenantId: access.tenantId, subjectId: access.subjectId, roles: [...access.roles] };
  if (process.env.AGENT_RUNTIME_MODE === "production") throw new Error("Demo identity cannot create production review items");
  return { source: "trusted-gateway", tenantId: access.tenantId, subjectId: access.subjectId, roles: [...access.roles] };
}

class RuntimeHumanReviewPort implements HumanReviewPort {
  readonly portKind = "human-review" as const;
  submit(request: Parameters<HumanReviewPort["submit"]>[0], access: AgentAccessContext) { return submitHumanReview(request, internalIdentity(access)); }
  get(reviewId: string, access: AgentAccessContext) { return getHumanReview(reviewId, internalIdentity(access)); }
  resolve(reviewId: string, decision: Parameters<HumanReviewPort["resolve"]>[1], access: AgentAccessContext) { return resolveHumanReview(reviewId, decision, internalIdentity(access)); }
}

class RuntimeTaskQueuePort implements TaskQueuePort {
  readonly portKind = "task-queue" as const;
  async enqueue(message: { taskId: string }): Promise<void> {
    const queue = (await import("../runtime-bindings.ts")).getRuntimeBindings()?.AGENT_TASKS;
    if (queue) await queue.send(message);
    else if (process.env.AGENT_RUNTIME_MODE === "production") throw new Error("Production task queue is unavailable");
  }
}

class RuntimeAuditStorePort implements AuditStorePort {
  readonly portKind = "audit-store" as const;
  async record(): Promise<void> {
    // Invocation audit is recorded centrally by the runtime handler. This port
    // exists so Agent modules never depend on the persistence implementation.
  }
}

let singleton: R0FoundationPorts | undefined;

export function getR0FoundationPorts(): R0FoundationPorts {
  singleton ??= {
    ai: new HttpAIPlatformPort(),
    knowledge: new HttpKnowledgeSearchPort(),
    data: new HttpBusinessDataPort(),
    action: new HttpBusinessActionPort(),
    review: new RuntimeHumanReviewPort(),
    tasks: new RuntimeTaskQueuePort(),
    audit: new RuntimeAuditStorePort(),
  };
  return singleton;
}
