import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentRoot = path.join(root, "app", "lib", "agents");
const agentIds = [
  "AG-001", "AG-012", "AG-025", "AG-027",
];

const evalFiles = ["four-agent-golden-cases.json"];

const read = (file) => readFile(file, "utf8");
const has = (text, expression) => expression.test(text);
const folderFor = (agentId) => agentId.toLowerCase().replace("-", "");

const registry = await read(path.join(root, "app", "lib", "agent-runtime-registry.ts"));
const coverage = JSON.parse(await read(path.join(root, "app", "lib", "capability-coverage.json")));
const evalCounts = new Map(agentIds.map((id) => [id, 0]));

for (const evalFile of evalFiles) {
  const parsed = JSON.parse(await read(path.join(root, "evals", evalFile)));
  const cases = Array.isArray(parsed) ? parsed : parsed.cases ?? parsed.items ?? [];
  for (const item of cases) {
    const id = item.agent_id ?? item.agentId;
    if (evalCounts.has(id)) evalCounts.set(id, evalCounts.get(id) + 1);
  }
}

const results = [];
for (const agentId of agentIds) {
  const folder = path.join(agentRoot, folderFor(agentId));
  const files = await readdir(folder);
  const texts = {};
  for (const file of files.filter((entry) => entry.endsWith(".ts"))) texts[file] = await read(path.join(folder, file));
  const combined = Object.values(texts).join("\n");
  const workflow = texts["workflow.ts"] ?? "";
  const providers = texts["providers.ts"] ?? "";
  const moduleSource = texts["module.ts"] ?? "";
  const registryBlock = registry.match(new RegExp(`id: "${agentId}"[\\s\\S]*?(?=\\n  \\{\\n    id: "AG-|\\n\\];)`))?.[0] ?? "";
  const moduleSymbol = `${folderFor(agentId)}Module`;

  const requiredFiles = ["types.ts", "config.ts", "providers.ts", "adapters.ts", "workflow.ts", "module.ts"];
  const missingFiles = requiredFiles.filter((file) => !files.includes(file));
  const moduleLocalTests = files.includes("tests");
  const moduleLocalEvals = files.includes("evals");
  const usesDedicatedRequestSchema = has(moduleSource, new RegExp(`Ag${agentId.slice(3)}InvokeRequestSchema`));
  const usesGenericRequestExtension = has(registryBlock, /AgentInvokeRequestSchema\.extend/)
    || has(registry, new RegExp(`const ag${agentId.slice(3)}RequestSchema = AgentInvokeRequestSchema\\.extend`));

  results.push({
    agent_id: agentId,
    capability_count: coverage[agentId]?.length ?? 0,
    golden_case_count: evalCounts.get(agentId),
    runtime_registered: has(registry, new RegExp(`\\b${moduleSymbol}\\b`)),
    stage_files_complete: missingFiles.length === 0,
    missing_stage_files: missingFiles,
    module_local_tests: moduleLocalTests,
    module_local_evals: moduleLocalEvals,
    seven_piece_module_complete: missingFiles.length === 0 && moduleLocalTests && moduleLocalEvals,
    uses_r0_sdk: has(combined, /defineAgentModule|defineLegacyBackedAgentModule/) || has(registryBlock, /defineAgentModule/),
    uses_r0_platform_ports: has(combined, /r0[\\/](?:platform-ports|foundation-ports)|R0FoundationPorts|getR0FoundationPorts/),
    has_legacy_provider_contracts: has(providers, /interface\s+\w+(Data|AI|Policy|Document|Customer|Service|Port)\w*Port|\bAIPlatformPort\b|\bBusinessDataPort\b/),
    uses_langgraph: has(workflow, /StateGraph|Annotation\.Root|START|END/),
    dedicated_request_schema: usesDedicatedRequestSchema,
    generic_request_schema: usesGenericRequestExtension,
    review_status_only: has(workflow, /needs_review/) && !has(combined, /submitHumanReview|HumanReviewPort|defineLegacyBackedAgentModule/),
    uses_common_review_port: has(combined, /submitHumanReview|HumanReviewPort|defineLegacyBackedAgentModule/),
    explicit_non_execution_boundary: has(combined, /not_performed|不执行|未执行/),
    direct_external_coupling: has(combined, /\bfetch\s*\(|from\s+["'](?:openai|@langchain\/openai|@qwen|axios)|prepare\s*\(/),
    capability_version: moduleSource.match(/capability:\s*"([^"]+)"/)?.[1] ?? null,
  });
}

const counts = {
  agents: results.length,
  runtime_registered: results.filter((row) => row.runtime_registered).length,
  stage_files_complete: results.filter((row) => row.stage_files_complete).length,
  seven_piece_module_complete: results.filter((row) => row.seven_piece_module_complete).length,
  sdk_migrated: results.filter((row) => row.uses_r0_sdk).length,
  r0_ports_migrated: results.filter((row) => row.uses_r0_platform_ports).length,
  dedicated_request_schema: results.filter((row) => row.dedicated_request_schema).length,
  langgraph: results.filter((row) => row.uses_langgraph).length,
  common_review_port: results.filter((row) => row.uses_common_review_port).length,
  golden_cases: results.reduce((sum, row) => sum + row.golden_case_count, 0),
  capabilities: results.reduce((sum, row) => sum + row.capability_count, 0),
  direct_external_coupling: results.filter((row) => row.direct_external_coupling).length,
};

console.log(JSON.stringify({ audited_at: new Date().toISOString(), foundation_target: "r0.1.0", counts, agents: results }, null, 2));
