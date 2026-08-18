import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeRagEvaluation } from "../app/lib/rag-evaluation/evaluator.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "reports/rag-evaluation-baseline-20260814.json");
const run = await executeRagEvaluation();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(run, null, 2)}\n`, "utf8");

console.log(`RAG evaluation: ${run.passedCases}/${run.totalCases}`);
console.log(`Public gates: ${run.metrics.filter((metric) => metric.passed).length}/${run.metrics.length}`);
console.log(`Agent gates: ${run.agents.filter((agent) => agent.specialGatePassed).length}/${run.agents.length}`);
console.log(`Report: ${output}`);
if (run.gateStatus !== "passed") process.exitCode = 1;
