import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDefaultQueryPlan } from "../app/lib/rag/kernel.ts";
import { getSharedRagRuntime } from "../app/lib/rag/runtime.ts";
import {
  getKnowledgeDashboard, publishKnowledge, registerKnowledge, resetKnowledgeAdminForTests, reviewQaSample,
  rollbackKnowledge, submitKnowledgeReview, withdrawKnowledge,
} from "../app/lib/knowledge-admin/store.ts";

const actor = "test-admin";
const metadata = {
  agentId: "AG-001", title: "X8 应急返航补充指引", documentType: "产品操作指引", domain: "product-manual",
  sourceOrganization: "项目测试知识组（虚构）", sourceNature: "项目自编虚构演示材料", version: "v1.0",
  effectiveFrom: "2026-01-01", effectiveTo: null, confidentiality: "公开演示", visibilityRoles: ["*"], reviewOwner: "产品知识维护岗",
};

test("knowledge administration completes register, review, publish, withdraw and rollback lifecycle", async () => {
  resetKnowledgeAdminForTests();
  const baseline = await getKnowledgeDashboard();
  assert.equal(baseline.stats.total, 15);
  assert.equal(baseline.qaSamples.length, 4);

  const registered = await registerKnowledge({ metadata, file: { name: "return-guide.md", type: "text/markdown", content: "# 应急返航\n\n出现链路异常时，应先确认剩余电量与返航路径。\n\n如无法确认安全边界，应停止自动处置并转人工复核。" } }, actor);
  assert.equal(registered.lifecycleStatus, "draft");
  assert.equal(registered.parseStatus, "parsed");
  assert.ok(registered.chunks.length >= 1);
  assert.ok(registered.checksum.length >= 32);

  const reviewed = await submitKnowledgeReview(registered.id, actor);
  assert.equal(reviewed.lifecycleStatus, "in_review");
  const published = await publishKnowledge(registered.id, actor);
  assert.equal(published.lifecycleStatus, "published");
  assert.ok(published.publishedIndexVersion);

  const request = {
    query: "链路异常返航路径", plan: createDefaultQueryPlan({ agentId: "AG-001", query: "链路异常返航路径", knowledgeDomains: ["product-manual"], asOf: "2026-08-14T00:00:00+08:00" }),
    access: { tenantId: "DEMO-TENANT", roles: ["visitor"] }, namespaces: ["demo-tenant-ag-001-managed"], retrieveK: 10, rerankK: 8, contextK: 4,
  };
  const evidence = await getSharedRagRuntime().retrieve(request);
  assert.ok(evidence.some((item) => item.documentId.endsWith(registered.id)));
  assert.equal(evidence.find((item) => item.documentId.endsWith(registered.id))?.metadata?.lifecycle_status, "published");

  const withdrawn = await withdrawKnowledge(registered.id, actor);
  assert.equal(withdrawn.lifecycleStatus, "withdrawn");
  assert.equal((await getSharedRagRuntime().retrieve(request)).some((item) => item.documentId.endsWith(registered.id)), false);

  const restored = await rollbackKnowledge(registered.id, undefined, actor);
  assert.equal(restored.lifecycleStatus, "published");
  assert.ok((await getSharedRagRuntime().retrieve(request)).some((item) => item.documentId.endsWith(registered.id)));
  const final = await getKnowledgeDashboard();
  assert.deepEqual(final.publications.slice(0, 3).map((item) => item.action), ["rollback", "withdraw", "publish"]);
});

test("unsupported platform documents and malformed structured files are governed as parse issues", async () => {
  resetKnowledgeAdminForTests();
  const external = await registerKnowledge({ metadata: { ...metadata, title: "待解析 PDF" }, file: { name: "manual.pdf", type: "application/pdf", content: "" } }, actor);
  assert.equal(external.parseStatus, "external_service_required");
  assert.match(external.lastError, /甲方AI中台/);
  await assert.rejects(submitKnowledgeReview(external.id, actor), /解析未完成/);

  const malformed = await registerKnowledge({ metadata: { ...metadata, title: "格式异常 JSON" }, file: { name: "broken.json", type: "application/json", content: "{broken" } }, actor);
  assert.equal(malformed.parseStatus, "failed");
  const dashboard = await getKnowledgeDashboard();
  assert.equal(dashboard.stats.parseIssues, 2);
  assert.equal(dashboard.alerts.parse.length, 2);
});

test("QA sampling records an auditable manual review result", async () => {
  resetKnowledgeAdminForTests();
  const sample = (await getKnowledgeDashboard()).qaSamples[0];
  const reviewed = await reviewQaSample(sample.id, "fail", "召回范围需要调整。", actor);
  assert.equal(reviewed.result, "fail");
  assert.equal(reviewed.reviewer, actor);
  assert.ok(reviewed.reviewedAt);
});

test("knowledge admin page exposes all second-stage governance capabilities", async () => {
  const source = await readFile(new URL("../app/knowledge-admin/page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/knowledge-admin/route.ts", import.meta.url), "utf8");
  for (const label of ["知识资料台账", "登记与解析", "提交审核", "审核通过并发布", "撤回索引", "回滚最近版本", "分块预览", "资料提醒", "索引与发布", "问答抽样复核", "编辑元数据", "访问范围"]) assert.match(source, new RegExp(label));
  assert.match(source, /甲方AI中台提供解析或文字识别服务/);
  assert.match(route, /isLoopback/);
  assert.match(route, /origin === url\.origin/);
  assert.match(route, /knowledge-admin/);
});
