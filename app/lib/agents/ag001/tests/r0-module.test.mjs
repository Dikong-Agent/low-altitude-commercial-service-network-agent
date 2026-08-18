import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("AG-001 uses the R0 module and review bridge", async () => { const source = await readFile(new URL("../module.ts", import.meta.url), "utf8"); assert.match(source, /defineLegacyBackedAgentModule/); assert.match(source, /getR0FoundationPorts/); assert.match(source, /reviewReason/); });
