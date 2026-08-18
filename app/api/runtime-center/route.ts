import { AGENTS } from "../../lib/agent-registry";
import { listRuntimeAgentDefinitions } from "../../lib/agent-runtime-registry";
import { AGENT_INTERFACE_VERSION } from "../../lib/contracts";
import { getAgentRuntimeSnapshot } from "../../lib/observability";
import { R0_FOUNDATION_VERSION } from "../../lib/r0/contracts";

export async function GET() {
  const names = new Map(AGENTS.map((agent) => [agent.id, agent.name]));
  const snapshot = getAgentRuntimeSnapshot();
  return Response.json({
    environment: "demo",
    foundationVersion: R0_FOUNDATION_VERSION,
    interfaceVersion: AGENT_INTERFACE_VERSION,
    agents: listRuntimeAgentDefinitions().map((definition) => ({
      id: definition.id,
      name: names.get(definition.id) ?? definition.id,
      executionMode: definition.executionMode,
      versions: definition.versions,
      timeoutPolicy: definition.timeoutPolicy,
      provider: process.env[`${definition.id.replace("-", "")}_PROVIDER`] ?? "demo",
    })),
    ...snapshot,
    interfaces: ["Agent同步调用", "异步任务", "AI能力", "知识检索", "业务数据", "业务动作", "人工复核"],
    links: { openapi: "/api/openapi", evaluation: "/evaluation-center", knowledge: "/knowledge-admin" },
    boundary: "本中心只展示当前研发实例的脱敏运行信息；不代表甲方AI中台监控或生产验收。",
  }, { headers: { "Cache-Control": "no-store" } });
}

