import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicCopyFiles = [
  "../app/page.tsx",
  "../app/experience/page.tsx",
  "../app/knowledge-admin/page.tsx",
  "../app/evaluation-center/page.tsx",
  "../app/runtime-center/page.tsx",
  "../app/lib/agent-registry.ts",
];

const forbiddenCopy = [
  /企业级业务智能体解决方案/,
  /标杆样板/,
  /不是预设动画/,
  /从一句需求/,
  /让知识从/,
  /确定性黄金用例/,
  /黄金问题/,
  /公共质量门禁/,
  /Agent专项门禁/,
  /指标血缘/,
  /语义查询计划/,
  /硬约束/,
  /硬条件/,
  /赋能/,
  /一站式/,
  /全链路/,
  /智能化升级/,
  /深度融合/,
  /精准触达/,
  /极致体验/,
  /RAG质量评测/,
  /当前工程回归通过/,
  /有发现项/,
  /无阻断项/,
  /工具与Agent调用/,
  /结果仅用于能力展示/,
];

test("client-facing pages avoid stale counts and formulaic AI copy", async () => {
  for (const path of publicCopyFiles) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    for (const pattern of forbiddenCopy) {
      assert.doesNotMatch(source, pattern, `${path} contains client copy that should be rewritten: ${pattern}`);
    }
  }
});

test("project introduction states the current four-sample scope and overall 28-Agent plan", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /4个可运行工程样例/);
  assert.match(source, /总体规划<\/dt><dd>28个业务智能体/);
  assert.match(source, /不代表28个业务智能体均已完成开发/);
});
