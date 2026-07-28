import rawCoverage from "./capability-coverage.json";
import type { AgentId } from "./contracts";

export type CapabilityCoverageStatus = "mock-demonstrated" | "adapter-ready";

export interface CapabilityCoverageItem {
  function_id: string;
  source_requirement_id: string;
  capability: string;
  status: CapabilityCoverageStatus;
}

const demonstratedFunctionIds: Record<AgentId, ReadonlySet<string>> = {
  "AG-001": new Set(rawCoverage["AG-001"].map((item) => item.function_id)),
  "AG-002": new Set(["F-0204", "F-0205", "F-0206", "F-0209", "F-0210", "F-0211", "F-0212", "F-0213", "F-0214", "F-0215", "F-0216"]),
  "AG-003": new Set(["F-0001", "F-0002", "F-0003", "F-0004", "F-0005", "F-0006", "F-0024", "F-0025", "F-0026", "F-0027", "F-0028", "F-0029", "F-0030"]),
  "AG-012": new Set([
    "F-0307", "F-0308", "F-0309", "F-0310", "F-0311", "F-0312", "F-0313", "F-0314",
    "F-0327", "F-0328", "F-0331", "F-0333", "F-0335", "F-0336", "F-0337", "F-0338",
    "F-0562", "F-0564", "F-0565", "F-0566", "F-0567", "F-0570", "F-0571",
  ]),
  "AG-025": new Set([
    "F-0285", "F-0286", "F-0287", "F-0288", "F-0289", "F-0290", "F-0291", "F-0292",
    "F-0296", "F-0297", "F-0298", "F-0299", "F-0300", "F-0301", "F-0302", "F-0303", "F-0304", "F-0305", "F-0306",
  ]),
};

export const AGENT_CAPABILITY_COUNTS: Record<AgentId, number> = {
  "AG-001": 12,
  "AG-002": 13,
  "AG-003": 50,
  "AG-012": 66,
  "AG-025": 56,
};

export function capabilityCoverageForAgent(agentId: AgentId): readonly CapabilityCoverageItem[] {
  const demonstrated = demonstratedFunctionIds[agentId];
  return rawCoverage[agentId].map((item) => ({
    ...item,
    status: demonstrated.has(item.function_id) ? "mock-demonstrated" : "adapter-ready",
  }));
}
