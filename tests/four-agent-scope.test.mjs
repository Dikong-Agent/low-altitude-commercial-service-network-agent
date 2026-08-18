import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const activeIds = ["AG-001", "AG-012", "AG-025", "AG-027"];
const activeFolders = activeIds.map((id) => id.toLowerCase().replace("-", ""));
const pausedFolders = ["ag002", "ag003"];
const retiredFolders = ["ag004", "ag005", "ag006", "ag007", "ag008", "ag009", "ag010", "ag013", "ag014", "ag015", "ag016", "ag017", "ag018", "ag019", "ag020", "ag023", "ag026", "ag028"];
const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("current runtime and product registry contain exactly the four retained Agents", async () => {
  const registry = await source("../app/lib/agent-runtime-registry.ts");
  const productRegistry = await source("../app/lib/agent-registry.ts");
  for (const folder of activeFolders) assert.match(registry, new RegExp(`${folder}Module`));
  for (const folder of pausedFolders) assert.doesNotMatch(registry, new RegExp(`${folder}Module`));
  assert.equal((productRegistry.match(/id: "AG-/g) ?? []).length, 4);
  for (const id of activeIds) assert.match(productRegistry, new RegExp(`id: "${id}"`));
  for (const id of ["AG-002", "AG-003"]) assert.doesNotMatch(productRegistry, new RegExp(`id: "${id}"`));
});

test("AG-002 and AG-003 remain source-only references and are not deployable", async () => {
  const folders = await readdir(new URL("../app/lib/agents/", import.meta.url));
  for (const folder of [...activeFolders, ...pausedFolders]) assert.ok(folders.includes(folder));
  for (const folder of retiredFolders) await assert.rejects(access(new URL(`../app/lib/agents/${folder}`, import.meta.url)));
  const production = await source("../app/lib/production-http.ts");
  for (const id of activeIds) assert.match(production, new RegExp(`${id}:`));
  for (const id of ["AG-002", "AG-003"]) assert.doesNotMatch(production, new RegExp(`${id}:`));
});

test("each retained Agent has the R0 module and local tests/evals", async () => {
  for (const folder of activeFolders) {
    const files = await readdir(new URL(`../app/lib/agents/${folder}/`, import.meta.url));
    for (const required of ["types.ts", "config.ts", "providers.ts", "adapters.ts", "workflow.ts", "module.ts", "tests", "evals"]) assert.ok(files.includes(required), `${folder}/${required}`);
    const moduleSource = await source(`../app/lib/agents/${folder}/module.ts`);
    assert.match(moduleSource, /defineLegacyBackedAgentModule/);
    assert.match(moduleSource, /getR0FoundationPorts/);
  }
});

test("AG-025 collaboration is limited to active specialist Agents", async () => {
  const providers = await source("../app/lib/agents/ag025/providers.ts");
  for (const id of ["AG-001", "AG-012", "AG-027"]) assert.match(providers, new RegExp(id));
  for (const id of ["AG-002", "AG-003", "AG-006", "AG-014", "AG-023"]) assert.doesNotMatch(providers, new RegExp(id));
});

test("RAG and knowledge governance expose exactly four active profiles", async () => {
  for (const path of ["../app/lib/rag/profiles.ts", "../app/lib/knowledge-admin/contracts.ts", "../app/lib/rag-evaluation/evaluator.ts"]) {
    const text = await source(path);
    for (const id of activeIds) assert.match(text, new RegExp(id));
    for (const id of ["AG-002", "AG-003"]) assert.doesNotMatch(text, new RegExp(id));
  }
});

test("needs_review responses expose the common review request contract", async () => {
  const contracts = await source("../app/lib/contracts.ts");
  const sdk = await source("../app/lib/agent-sdk/index.ts");
  assert.match(contracts, /review_request:/); assert.match(sdk, /ports\.review\.submit/); assert.match(sdk, /response\.status !== "needs_review"/);
});
