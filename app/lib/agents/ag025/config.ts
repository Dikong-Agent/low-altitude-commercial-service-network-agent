const demonstrated = (requirement_id: string, capability: string) => ({ requirement_id, capability, status: "mock-demonstrated" as const });
const adapterReady = (requirement_id: string, capability: string) => ({ requirement_id, capability, status: "adapter-ready" as const });

export const AG025_CONFIG = {
  workflowVersion: "1.0.0",
  ruleVersion: "AG-025 多意图客服路由规则 v1.0",
  maxKnowledgeMatches: 4,
  reliability: {
    aiPlatform: { timeoutMs: 3_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
    customerData: { timeoutMs: 2_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  },
  capabilityCoverage: [
    adapterReady("070-A-001", "运营问数意图理解"), adapterReady("070-A-002", "运营指标口径理解"), adapterReady("070-A-003", "分析时间范围理解"), adapterReady("070-A-004", "业务筛选条件理解"), adapterReady("070-A-006", "缺失问数条件追问"), adapterReady("070-A-007", "问数结果摘要生成"), adapterReady("070-A-008", "异常指标原因辅助分析"), adapterReady("070-A-009", "关联经营原因分析"), adapterReady("070-A-010", "后续分析问题建议"),
    demonstrated("076-A-001", "投诉问题要素理解"), demonstrated("085-A-002", "咨询板块识别"), demonstrated("085-A-002", "咨询问题类型识别"), demonstrated("085-A-003", "缺失信息智能追问"), demonstrated("085-A-004", "平台通用规则解答"), demonstrated("085-A-005", "商品信息场景化解答"), demonstrated("085-A-006", "订单咨询协同答复"), demonstrated("085-A-007", "售后规则与办理说明"), adapterReady("085-A-008", "跨板块咨询协同答复"), demonstrated("085-A-009", "人工介入条件判断"), demonstrated("085-A-009", "人工转接建议"), demonstrated("085-A-010", "会话处理轨迹摘要生成"), demonstrated("085-A-010", "会话已确认信息摘要"), demonstrated("085-A-010", "用户问题摘要"), adapterReady("085-A-011", "客服答复有效性判断"), adapterReady("085-A-011", "人工转接原因趋势分析"), adapterReady("085-A-011", "未解决问题类型聚类分析"), adapterReady("085-A-011", "未解决问题原因识别"),
    adapterReady("085-A-022", "客服会话违规风险线索识别"), adapterReady("085-A-023", "违规行为类型辅助判断"), adapterReady("085-A-024", "违规行为证据提取"), adapterReady("085-A-025", "重复违规线索识别"), adapterReady("085-A-026", "信用影响程度建议"), adapterReady("085-A-027", "信用规则适用条款匹配"), adapterReady("085-A-028", "信用影响复核材料生成"),
    demonstrated("139-A-002", "客服业务上下文识别"), demonstrated("139-A-004", "人工答复依据摘要生成"), demonstrated("139-A-004", "人工客服答复建议生成"), demonstrated("139-A-005", "相关订单语义关联"), demonstrated("139-A-005", "相关服务语义关联"), demonstrated("139-A-005", "相关商品语义关联"),
    adapterReady("214-A-001", "商品搜索意图理解"), adapterReady("214-A-002", "商品型号识别"), adapterReady("214-A-003", "商品搜索词纠错"), adapterReady("214-A-004", "商品类目推断"), adapterReady("214-A-005", "商品搜索候选匹配"), adapterReady("214-A-006", "商品搜索相关性评分"),
    adapterReady("353-A-001", "投融资问题识别"), adapterReady("353-A-002", "投融资阶段流程场景解答"), adapterReady("353-A-003", "融资沟通材料清单生成"), adapterReady("353-A-004", "投融资风险事项解释"), adapterReady("353-A-005", "融资方式适用性分析"), adapterReady("353-A-006", "融资阶段关键事项解答"), adapterReady("353-A-007", "融资材料缺口说明"), adapterReady("358-A-001", "信贷问题识别"), adapterReady("358-A-002", "企业信贷申请流程场景解答"), adapterReady("358-A-003", "信贷材料清单生成"), adapterReady("358-A-004", "信贷风险事项解释"), adapterReady("358-A-005", "信贷条件场景适用性解释"), adapterReady("358-A-006", "还款方式差异解读"), adapterReady("358-A-007", "信贷材料缺口说明"),
  ],
} as const;
