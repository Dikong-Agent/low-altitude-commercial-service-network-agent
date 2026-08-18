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
  "AG-004": new Set(rawCoverage["AG-004"].map((item) => item.function_id)),
  "AG-005": new Set(rawCoverage["AG-005"].map((item) => item.function_id)),
  "AG-006": new Set(rawCoverage["AG-006"].map((item) => item.function_id)),
  "AG-007": new Set(rawCoverage["AG-007"].map((item) => item.function_id)),
  "AG-008": new Set(rawCoverage["AG-008"].map((item) => item.function_id)),
  "AG-009": new Set(rawCoverage["AG-009"].map((item) => item.function_id)),
  "AG-010": new Set(rawCoverage["AG-010"].map((item) => item.function_id)),
  "AG-012": new Set([
    "F-0270", "F-0271", "F-0272", "F-0273", "F-0274",
    "F-0307", "F-0308", "F-0309", "F-0310", "F-0311", "F-0312", "F-0313", "F-0314",
    "F-0327", "F-0328", "F-0331", "F-0333", "F-0335", "F-0336", "F-0337", "F-0338",
    "F-0559", "F-0560", "F-0561", "F-0562", "F-0564", "F-0565", "F-0566", "F-0567", "F-0568", "F-0569", "F-0570", "F-0571",
  ]),
  "AG-013": new Set(rawCoverage["AG-013"].map((item) => item.function_id)),
  "AG-014": new Set(rawCoverage["AG-014"].map((item) => item.function_id)),
  "AG-015": new Set(rawCoverage["AG-015"].map((item) => item.function_id)),
  "AG-016": new Set(rawCoverage["AG-016"].map((item) => item.function_id)),
  "AG-017": new Set(rawCoverage["AG-017"].map((item) => item.function_id)),
  "AG-018": new Set(rawCoverage["AG-018"].map((item) => item.function_id)),
  "AG-019": new Set(rawCoverage["AG-019"].map((item) => item.function_id)),
  "AG-020": new Set(rawCoverage["AG-020"].map((item) => item.function_id)),
  "AG-023": new Set(rawCoverage["AG-023"].map((item) => item.function_id)),
  "AG-025": new Set([
    "F-0001", "F-0002", "F-0003", "F-0004", "F-0005", "F-0006",
    "F-0237", "F-0238", "F-0242", "F-0243", "F-0244", "F-0245", "F-0249", "F-0250",
    "F-0285", "F-0286", "F-0287", "F-0288", "F-0289", "F-0290", "F-0291", "F-0292", "F-0293", "F-0294", "F-0295",
    "F-0296", "F-0297", "F-0298", "F-0299", "F-0300", "F-0301", "F-0302", "F-0303", "F-0304", "F-0305", "F-0306",
    "F-0760", "F-0761", "F-0762", "F-0763", "F-0764", "F-0765", "F-0390", "F-0391", "F-0392",
    "F-0584", "F-0588",
  ]),
  "AG-026": new Set(rawCoverage["AG-026"].map((item) => item.function_id)),
  // Current AG-027 demo proves B2C scope/trend/structure analysis plus the
  // common metric-query path. B2B diagnosis, cross-metric attribution,
  // recommendation feedback and knowledge-gap aggregation remain adapter-ready.
  "AG-027": new Set([
    "F-0535", "F-0536", "F-0538", "F-0543", "F-0548", "F-0549", "F-0551",
    "F-0585", "F-0586", "F-0587", "F-0589", "F-0590", "F-0592", "F-0593",
  ]),
  "AG-028": new Set(rawCoverage["AG-028"].map((item) => item.function_id)),
};

export const AGENT_CAPABILITY_COUNTS: Record<AgentId, number> = {
  "AG-001": 12,
  "AG-002": 13,
  "AG-003": 50,
  "AG-004": 19,
  "AG-005": 7,
  "AG-006": 8,
  "AG-007": 13,
  "AG-008": 28,
  "AG-009": 20,
  "AG-010": 16,
  "AG-012": 66,
  "AG-013": 32,
  "AG-014": 3,
  "AG-015": 23,
  "AG-016": 8,
  "AG-017": 12,
  "AG-018": 36,
  "AG-019": 3,
  "AG-020": 16,
  "AG-023": 29,
  "AG-025": 56,
  "AG-026": 82,
  "AG-027": 50,
  "AG-028": 15,
};

export function capabilityCoverageForAgent(agentId: AgentId): readonly CapabilityCoverageItem[] {
  const demonstrated = demonstratedFunctionIds[agentId];
  return rawCoverage[agentId].map((item) => ({
    ...item,
    status: demonstrated.has(item.function_id) ? "mock-demonstrated" : "adapter-ready",
  }));
}
