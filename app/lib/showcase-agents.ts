import { AGENTS } from "./agent-registry";
import type { AgentDefinition, AgentId } from "./contracts";

export const SHOWCASE_AGENT_IDS: AgentId[] = [
  "AG-027",
  "AG-012",
  "AG-025",
  "AG-001",
];

export const SHOWCASE_AGENTS: AgentDefinition[] = SHOWCASE_AGENT_IDS.map((id) => {
  const agent = AGENTS.find((item) => item.id === id);
  if (!agent) throw new Error(`Missing showcase Agent definition: ${id}`);
  return agent;
});
