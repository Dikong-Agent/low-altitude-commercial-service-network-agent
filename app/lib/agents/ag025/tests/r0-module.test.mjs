import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("AG-025 only calls registered specialists", async () => { const moduleSource = await readFile(new URL("../module.ts", import.meta.url), "utf8"); const providerSource = await readFile(new URL("../providers.ts", import.meta.url), "utf8"); assert.match(moduleSource, /defineLegacyBackedAgentModule/); for (const id of ["AG-001", "AG-012", "AG-027"]) assert.match(providerSource, new RegExp(id)); for (const id of ["AG-002", "AG-003", "AG-006", "AG-014", "AG-023"]) assert.doesNotMatch(providerSource, new RegExp(id)); });
