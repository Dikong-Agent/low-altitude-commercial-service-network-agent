export const ONLINE_VERIFICATION_BASELINE = {
  id: "ONLINE-RAG-20260817-v4", verifiedAt: "2026-08-17T08:31:53.950Z", status: "observed_no_blocking_findings" as const, sampleCount: 4,
  providers: { model: "deepseek:deepseek-chat", embedding: "qwen:text-embedding-v4", rerank: "qwen:gte-rerank-v2" },
  citationCoverage: 1, minimumGroundingSupport: 0.895959595959596, totalModelTokens: 4032, averageModelTokens: 1008, p95LatencyMs: 3566,
  finding: "当前4个在线样例均已完成研发抽样，引用覆盖率为100%，最低内容支撑度为89.6%。本结果仅代表研发抽样，不替代甲方正式验收。",
  agents: [
    { agentId: "AG-001", latencyMs: 3086, modelTokens: 721, citationCoverage: 1, groundingSupport: 0.895959595959596 },
    { agentId: "AG-012", latencyMs: 3566, modelTokens: 2311, citationCoverage: 1, groundingSupport: 0.9974358974358974 },
    { agentId: "AG-027", latencyMs: 1480, modelTokens: 432, citationCoverage: 1, groundingSupport: 0.96 },
    { agentId: "AG-025", latencyMs: 2121, modelTokens: 568, citationCoverage: 1, groundingSupport: 0.9814814814814814 },
  ],
} as const;

export const FORMAL_ACCEPTANCE_READINESS = {
  status: "pending_inputs" as const, completed: 1, total: 5,
  items: [
    { label: "Agent侧评测机制与质量检查", status: "ready" as const },
    { label: "甲方授权的正式知识与版本状态", status: "pending" as const },
    { label: "业务专家确认的正式基准问题与答案", status: "pending" as const },
    { label: "甲方AI中台模型、检索、监控与审计接口", status: "pending" as const },
    { label: "数据中台及业务系统身份校验与业务接口", status: "pending" as const },
  ],
};
