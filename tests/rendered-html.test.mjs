import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function invoke(worker, agentId, input) {
  return invokeBody(worker, agentId, { agent_id: agentId, input });
}

async function invokeBody(worker, agentId, body) {
  return worker.fetch(new Request(`http://localhost/api/agents/${agentId}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env, ctx);
}

test("renders the Agent capability showroom", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /AI Agent 能力展厅/);
  assert.match(html, /五种模式，一套底座/);
  assert.match(html, /AG-001/);
  assert.match(html, /AG-025/);
  assert.match(html, /V1\.6/);
  assert.equal((html.match(/<i>RUNNABLE<\/i>/g) ?? []).length, 3);
  assert.equal((html.match(/<i>PREVIEW<\/i>/g) ?? []).length, 2);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("exposes the reserved Agent interface", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-012", "演示政策解读");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.agent_id, "AG-012");
  assert.equal(body.environment, "demo");
  assert.equal(body.status, "preview");
  assert.match(body.trace_id, /^TRC-/);
  assert.ok(body.output.evidence.length > 0);
  assert.ok(body.trace.length > 0);
});

test("runs AG-001 through the LangGraph comparison workflow", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "对比云巡 X8 和山岳 T60，重点看续航、载荷和抗风能力");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-agent-engine"), "langgraph-demo");
  const body = await response.json();
  assert.equal(response.headers.get("x-trace-id"), body.trace_id);
  assert.equal(body.status, "completed");
  assert.equal(body.output.comparison.engine, "langgraph-demo");
  assert.equal(body.output.comparison.products.length, 2);
  assert.ok(body.output.comparison.table.length >= 8);
  const productOrder = body.output.comparison.products.map((item) => item.id);
  assert.ok(body.output.comparison.table.every((row) => row.values.map((item) => item.product_id).join(",") === productOrder.join(",")));
  assert.ok(body.output.comparison.recommendation.primary_product_id);
  assert.ok(body.output.evidence.every((item) => /Mock|规则/.test(item)));
  assert.ok(body.trace.length >= 5);
});

test("AG-001 rejects forced recommendations when hard constraints conflict", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "对比云巡 X8 和山岳 T60，续航至少80分钟");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_review");
  assert.equal(body.output.comparison.recommendation.primary_product_id, null);
  assert.ok(body.output.comparison.conflicts.length >= 3);
});

test("AG-001 asks for clarification on an unusable input", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "你好");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_clarification");
  assert.equal(body.output.comparison, undefined);
});

test("serves the AG-001 mock product catalog through BusinessDataPort", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/data/products?scenario=%E5%9B%AD%E5%8C%BA%E5%B7%A1%E6%A3%80"), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.environment, "demo");
  assert.equal(body.connector.status, "mock-active");
  assert.ok(body.items.length >= 2);
  assert.ok(body.items.every((item) => item.name.startsWith("样例·")));
});

test("runs AG-002 through the LangGraph manual interpretation workflow", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-002", "飞行前需要完成哪些安全检查？请按顺序说明");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-agent-engine"), "langgraph-demo");
  const body = await response.json();
  assert.equal(response.headers.get("x-trace-id"), body.trace_id);
  assert.equal(body.status, "needs_review");
  assert.equal(body.output.manual.engine, "langgraph-demo");
  assert.equal(body.output.manual.document.id, "DEMO-MANUAL-X8");
  assert.ok(body.output.manual.steps.length >= 5);
  assert.ok(body.output.manual.citations.every((item) => /第\d+/.test(item.location)));
  assert.ok(body.output.manual.risk_markers.some((item) => item.level === "warning"));
  assert.ok(body.output.manual.risk_markers.some((item) => item.level === "prohibited"));
  assert.ok(body.output.manual.risk_markers.some((item) => item.level === "compliance"));
  assert.equal(body.output.manual.capability_coverage.length, 13);
  assert.deepEqual(body.output.manual.capability_coverage.map((item) => item.capability), [
    "安全事项要点提取",
    "安全风险提示生成",
    "禁止操作提示生成",
    "合规要求场景提示生成",
    "说明书操作步骤通俗解读",
    "专业术语转换",
    "说明书场景语义检索",
    "场景化操作指引生成",
    "操作步骤摘要",
    "故障排查路径摘要",
    "产品核心能力与适用边界摘要",
    "说明书图示含义解读",
    "说明书章节与图表关系理解",
  ]);
  assert.deepEqual(
    body.output.manual.capability_coverage.filter((item) => item.status === "adapter-ready").map((item) => item.capability),
    ["说明书场景语义检索", "说明书图示含义解读", "说明书章节与图表关系理解"],
  );
  assert.ok(body.trace.length >= 7);
});

test("AG-002 combines core-function, safety, and compliance summaries", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-002", "概括核心功能、安全事项和合规要求");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_review");
  assert.ok(body.output.manual.intent.topics.includes("overview"));
  assert.ok(body.output.manual.intent.topics.includes("safety"));
  assert.ok(body.output.manual.intent.topics.includes("compliance"));
  assert.ok(body.output.manual.citations.some((item) => item.section_id === "x8-overview"));
  assert.ok(body.output.manual.citations.some((item) => item.section_id === "x8-compliance"));
  assert.ok(body.output.manual.risk_markers.some((item) => item.level === "compliance"));
});

test("AG-002 preserves troubleshooting order and source locations", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-002", "设备出现定位漂移时，应优先检查哪些项目？");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_review");
  assert.ok(body.output.manual.intent.topics.includes("troubleshooting"));
  assert.equal(body.output.manual.steps[0].title, "转移到开阔区域");
  assert.ok(body.output.manual.steps.some((step) => step.title === "异常持续则降落停用"));
  assert.ok(body.output.manual.steps.every((step, index) => step.order === index + 1));
  assert.ok(body.output.manual.steps.every((step) => /第\d+/.test(step.source_ref)));
});

test("AG-002 explains requested terminology without forcing an operational conclusion", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-002", "用通俗的话解释GNSS、返航点和失控保护，并标出原文位置");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.deepEqual(body.output.manual.glossary.map((item) => item.term), ["GNSS", "返航点", "失控保护"]);
  assert.ok(body.output.manual.glossary.every((item) => /第\d+/.test(item.source_ref)));
});

test("AG-002 composes a terminology answer from the requested term rather than a nearby operation scenario", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-002", "RTH是什么意思？");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.match(body.output.manual.answer, /^RTH：/);
  assert.doesNotMatch(body.output.manual.answer, /失控保护不是万能保险/);
  assert.equal(body.output.manual.citations[0].section_id, "x8-overview");
});

test("AG-002 does not mix maintenance content into a core capability summary", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-002", "概括核心功能");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.deepEqual(body.output.manual.citations.map((item) => item.section_id), ["x8-overview"]);
  assert.doesNotMatch(body.output.manual.answer, /累计50小时/);
});

test("AG-002 stops safely when the sample manual has no direct evidence", async () => {
  const worker = await loadWorker();
  for (const input of ["如何升级固件？", "固件升级有哪些操作步骤？", "如何连接遥控器？", "帮我查询订单怎么退款"]) {
    const response = await invoke(worker, "AG-002", input);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "needs_clarification");
    assert.equal(body.output.manual, undefined);
    assert.match(body.output.summary, /请说明想了解|没有找到/);
  }
});

test("AG-002 asks for clarification and rejects unknown document ids safely", async () => {
  const worker = await loadWorker();
  const vague = await invoke(worker, "AG-002", "你好");
  assert.equal(vague.status, 200);
  assert.equal((await vague.json()).status, "needs_clarification");

  const missing = await invokeBody(worker, "AG-002", { agent_id: "AG-002", input: "概括核心功能", context: { document_id: "UNKNOWN" } });
  assert.equal(missing.status, 200);
  const missingBody = await missing.json();
  assert.equal(missingBody.status, "needs_clarification");
  assert.match(missingBody.output.summary, /没有找到指定文档/);

  const malformed = await invokeBody(worker, "AG-002", { agent_id: "AG-002", input: "概括核心功能", context: { document_id: 123 } });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "INVALID_AGENT_REQUEST");
});

test("an invalid AG-002 provider is isolated from the rest of the site", async () => {
  const worker = await loadWorker();
  const previousProvider = process.env.AG002_PROVIDER;
  process.env.AG002_PROVIDER = "missing-audit-provider";
  try {
    const healthyAgent = await invoke(worker, "AG-001", "对比云巡 X8 和山岳 T60");
    assert.equal(healthyAgent.status, 200);
    const failedAgent = await invoke(worker, "AG-002", "概括核心功能");
    assert.equal(failedAgent.status, 503);
    assert.equal((await failedAgent.json()).code, "DEPENDENCY_UNAVAILABLE");
  } finally {
    if (previousProvider === undefined) delete process.env.AG002_PROVIDER;
    else process.env.AG002_PROVIDER = previousProvider;
  }
});

test("serves the AG-002 mock manual directory through DocumentDataPort", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/data/manuals?id=DEMO-MANUAL-X8"), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.environment, "demo");
  assert.equal(body.connector.port, "DocumentDataPort");
  assert.equal(body.items.length, 1);
  assert.match(body.items[0].title, /^样例·/);
  assert.match(body.notice, /虚构样例/);

  const missing = await worker.fetch(new Request("http://localhost/api/data/manuals?id=UNKNOWN"), env, ctx);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "DOCUMENT_NOT_FOUND");
});

test("runs AG-003 through the scenario-solution recommendation workflow", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-003", "需要一套山区电力巡检方案，强调抗风和长续航，如何选？");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-agent-engine"), "langgraph-demo");
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.equal(body.output.recommendation.mode, "scenario_solution");
  assert.equal(body.output.recommendation.recommendation.primary_id, "DEMO-SOLUTION-MOUNTAIN-POWER");
  assert.equal(body.output.recommendation.capability_coverage.length, 32);
  assert.equal(body.output.recommendation.capability_coverage.filter((item) => item.status === "mock-demonstrated").length, 12);
  assert.equal(body.output.recommendation.capability_coverage.filter((item) => item.status === "adapter-ready").length, 20);
  assert.match(body.output.recommendation.data_notice, /虚构 Mock 数据/);
  assert.ok(body.trace.length >= 6);
});

test("AG-003 recommends an eligible entry product within a hard budget", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-003", "为新手推荐适合航拍入门的产品，预算不超过3万元");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.equal(body.output.recommendation.mode, "product_search");
  assert.equal(body.output.recommendation.recommendation.primary_id, "DEMO-C1");
  const primary = body.output.recommendation.product_candidates.find((item) => item.id === "DEMO-C1");
  assert.equal(primary.eligible, true);
  assert.ok(primary.price_yuan <= 30_000);
});

test("AG-003 corrects a product search term and ranks the matching model", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-003", "帮我搜索云训X8，重点看长续航和抗风");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.deepEqual(body.output.recommendation.intent.corrected_terms, [{ from: "云训x8", to: "云巡X8" }]);
  assert.equal(body.output.recommendation.recommendation.primary_id, "DEMO-X8");
});

test("AG-003 never replaces an explicit model with an unrelated eligible product", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-003", "搜索云巡X8，载荷至少5公斤");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_review");
  assert.equal(body.output.recommendation.recommendation.primary_id, null);
  assert.equal(body.output.recommendation.product_candidates[0].id, "DEMO-X8");
  assert.equal(body.output.recommendation.product_candidates[0].request_match, true);
  assert.equal(body.output.recommendation.product_candidates[0].eligible, false);
  assert.ok(body.output.recommendation.recommendation.alternative_ids.includes("DEMO-R6"));
});

test("AG-003 recognizes comparator-first numeric constraints", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-003", "至少续航50分钟，为新手推荐航拍无人机");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_review");
  assert.deepEqual(body.output.recommendation.intent.hard_constraints, ["续航不低于50分钟"]);
  assert.equal(body.output.recommendation.recommendation.primary_id, null);
  assert.ok(body.output.recommendation.product_candidates.every((item) => !item.eligible));
});

test("AG-003 preserves negated and ignored preference semantics", async () => {
  const worker = await loadWorker();
  const ignoredResponse = await invoke(worker, "AG-003", "园区巡检不强调抗风，推荐产品");
  const ignoredBody = await ignoredResponse.json();
  assert.ok(!ignoredBody.output.recommendation.intent.focus_tags.includes("抗风"));
  assert.ok(ignoredBody.output.recommendation.intent.ignored_focus_tags.includes("抗风"));

  const excludedResponse = await invoke(worker, "AG-003", "应急保障不要重载，推荐产品");
  const excludedBody = await excludedResponse.json();
  assert.ok(excludedBody.output.recommendation.intent.excluded_focus_tags.includes("重载"));
  const excludedHeavyCandidates = excludedBody.output.recommendation.product_candidates.filter((item) => ["DEMO-R6", "DEMO-T60"].includes(item.id));
  assert.ok(excludedHeavyCandidates.length >= 1);
  assert.ok(excludedHeavyCandidates.every((item) => !item.eligible && item.limitations.some((text) => /排除“重载”/.test(text))));
});

test("AG-003 preserves decimal budget precision in the hard-constraint label", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-003", "预算2.5万元，为新手推荐航拍产品");
  const body = await response.json();
  assert.equal(body.output.recommendation.intent.budget_yuan, 25_000);
  assert.deepEqual(body.output.recommendation.intent.hard_constraints, ["预算不超过2.5万元"]);
});

test("AG-003 honors target-model membership when recommending a scenario solution", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-003", "需要一套包含山岳T60的巡检方案");
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.ok(["DEMO-SOLUTION-MOUNTAIN-POWER", "DEMO-SOLUTION-EMERGENCY"].includes(body.output.recommendation.recommendation.primary_id));
  const primary = body.output.recommendation.solution_candidates.find((item) => item.id === body.output.recommendation.recommendation.primary_id);
  assert.equal(primary.request_match, true);
  assert.ok(primary.matched_tags.includes("包含目标型号"));
});

test("AG-003 evaluates and exposes scenario-solution suitability conditions", async () => {
  const worker = await loadWorker();
  const professional = await invoke(worker, "AG-003", "专业团队需要一套山区电力巡检方案，强调抗风");
  const professionalBody = await professional.json();
  const primary = professionalBody.output.recommendation.solution_candidates.find((item) => item.id === professionalBody.output.recommendation.recommendation.primary_id);
  assert.ok(primary.suitable_conditions.length >= 3);
  assert.match(primary.condition_assessment, /通过场景、实施能力和关键约束检查/);

  const beginner = await invoke(worker, "AG-003", "新手需要一套山区电力巡检方案");
  const beginnerBody = await beginner.json();
  assert.equal(beginnerBody.status, "needs_review");
  assert.equal(beginnerBody.output.recommendation.recommendation.primary_id, null);
  assert.ok(beginnerBody.output.recommendation.solution_candidates.some((item) => /不适合作为新手方案/.test(item.condition_assessment)));
});

test("AG-003 loads only the catalog required by the selected recommendation mode", async () => {
  const worker = await loadWorker();
  const product = await invoke(worker, "AG-003", "为新手推荐适合航拍入门的产品，预算不超过3万元");
  const productBody = await product.json();
  assert.ok(productBody.trace.some((item) => /仅加载\d+个商品；未调用场景方案目录/.test(item.detail)));
  const solution = await invoke(worker, "AG-003", "需要一套山区电力巡检方案");
  const solutionBody = await solution.json();
  assert.ok(solutionBody.trace.some((item) => /仅加载\d+个场景方案；未调用商品目录/.test(item.detail)));
});

test("AG-003 refuses a forced recommendation when all candidates conflict", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-003", "推荐适合航拍的产品，预算不超过1万元");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_review");
  assert.equal(body.output.recommendation.recommendation.primary_id, null);
  assert.ok(body.output.recommendation.gaps.some((item) => /预算/.test(item)));
});

test("AG-003 clarifies vague requests and stops at image/C2C adapter boundaries", async () => {
  const worker = await loadWorker();
  const vague = await invoke(worker, "AG-003", "你好");
  assert.equal(vague.status, 200);
  assert.equal((await vague.json()).status, "needs_clarification");

  for (const input of ["上传一张图片帮我找相似商品", "按卖家信用推荐同城二手无人机"]) {
    const response = await invoke(worker, "AG-003", input);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "needs_clarification");
    assert.equal(body.output.recommendation, undefined);
    assert.match(body.output.summary, /不能/);
  }
});

test("an invalid AG-003 provider is isolated from the other Agents", async () => {
  const worker = await loadWorker();
  const previousProvider = process.env.AG003_PROVIDER;
  process.env.AG003_PROVIDER = "missing-audit-provider";
  try {
    const healthyAgent = await invoke(worker, "AG-001", "对比云巡 X8 和山岳 T60");
    assert.equal(healthyAgent.status, 200);
    const failedAgent = await invoke(worker, "AG-003", "推荐适合航拍的产品");
    assert.equal(failedAgent.status, 503);
    assert.equal((await failedAgent.json()).code, "DEPENDENCY_UNAVAILABLE");
  } finally {
    if (previousProvider === undefined) delete process.env.AG003_PROVIDER;
    else process.env.AG003_PROVIDER = previousProvider;
  }
});

test("serves the AG-003 mock solution directory through BusinessDataPort", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/data/solutions?scenario=%E5%B1%B1%E5%8C%BA%E5%B7%A1%E6%A3%80"), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.environment, "demo");
  assert.equal(body.connector.port, "BusinessDataPort");
  assert.equal(body.connector.status, "mock-active");
  assert.ok(body.items.length >= 1);
  assert.match(body.notice, /虚构样例/);
});

test("AG-001 evaluates hard constraints before limiting candidates", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "载荷至少5公斤，推荐哪个型号");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "completed");
  assert.equal(body.output.comparison.recommendation.primary_product_id, "DEMO-R6");
  assert.ok(body.output.comparison.products.some((item) => item.id === "DEMO-R6"));
});

test("AG-001 requests a second model for direct single-model comparisons", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "对比云巡 X8");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_clarification");
  assert.match(body.output.summary, /至少补充另一个型号/);
});

test("AG-001 preserves compound business scenarios", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "用于山区电力巡检，载荷至少3公斤、抗风至少13米/秒，有合适型号吗？");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.output.comparison.intent.use_cases, ["山区巡检", "电力巡检"]);
});

test("AG-001 asks for the unit when a budget is ambiguous", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", "预算20，用于园区巡检，推荐哪个型号？");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "needs_clarification");
  assert.match(body.output.summary, /缺少单位/);
});

test("rejects null and malformed Agent request objects with 400", async () => {
  const worker = await loadWorker();
  const nullResponse = await invokeBody(worker, "AG-001", null);
  assert.equal(nullResponse.status, 400);
  const nullBody = await nullResponse.json();
  assert.equal(nullBody.code, "INVALID_AGENT_REQUEST");

  const sessionResponse = await invokeBody(worker, "AG-001", { agent_id: "AG-001", input: "对比 X8 和 T60", session_id: "same" });
  assert.equal(sessionResponse.status, 400);
});

test("rejects oversized Agent requests", async () => {
  const worker = await loadWorker();
  const response = await invoke(worker, "AG-001", `对比${"A".repeat(21_000)}`);
  assert.equal(response.status, 413);
  const body = await response.json();
  assert.equal(body.code, "REQUEST_TOO_LARGE");
});

test("returns 404 for unknown business data resources", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/data/unknown"), env, ctx);
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.code, "DATA_RESOURCE_NOT_FOUND");
});
