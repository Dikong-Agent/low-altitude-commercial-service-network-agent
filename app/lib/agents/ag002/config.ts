export const AG002_CONFIG = {
  workflowVersion: "1.0.0",
  ruleVersion: "AG-002 说明书解读规则 v1.0",
  defaultManualId: "DEMO-MANUAL-X8",
  maxSections: 5,
  maxSteps: 8,
  reliability: {
    aiPlatform: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    documentData: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  },
  capabilityCoverage: [
    { requirement_id: "085-A-015", capability: "合规要求标注", status: "mock-demonstrated" },
    { requirement_id: "085-A-015", capability: "安全风险标注", status: "mock-demonstrated" },
    { requirement_id: "085-A-015", capability: "操作禁忌标注", status: "mock-demonstrated" },
    { requirement_id: "085-A-012", capability: "说明书操作步骤通俗化", status: "mock-demonstrated" },
    { requirement_id: "085-A-013", capability: "说明书场景语义检索", status: "mock-demonstrated" },
    { requirement_id: "085-A-012", capability: "专业术语转换", status: "mock-demonstrated" },
    { requirement_id: "085-A-014", capability: "场景化操作指引生成", status: "mock-demonstrated" },
    { requirement_id: "085-A-016", capability: "说明书图文语义识别", status: "adapter-ready" },
    { requirement_id: "085-A-016", capability: "说明书文档结构解析", status: "mock-demonstrated" },
    { requirement_id: "121-A-002", capability: "安全事项摘要", status: "mock-demonstrated" },
    { requirement_id: "121-A-002", capability: "操作步骤摘要", status: "mock-demonstrated" },
    { requirement_id: "121-A-002", capability: "故障排查摘要", status: "mock-demonstrated" },
    { requirement_id: "121-A-002", capability: "核心功能摘要", status: "mock-demonstrated" },
  ],
} as const;

