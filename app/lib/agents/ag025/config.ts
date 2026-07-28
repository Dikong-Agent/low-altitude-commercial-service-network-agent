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
    adapterReady("1", "即时沟通语境理解"), adapterReady("1", "即时沟通疑似诈骗话术识别"), adapterReady("1", "即时沟通站外交易引导识别"), adapterReady("1", "即时沟通个人信息泄露识别"), adapterReady("1", "即时沟通攻击威胁内容识别"), adapterReady("1", "即时沟通骚扰内容识别"),
    adapterReady("70", "运营问数意图理解"), adapterReady("70", "缺失问数条件追问"),
    demonstrated("76", "投诉问题要素理解"), demonstrated("85", "咨询板块识别"), demonstrated("85", "咨询问题类型识别"), demonstrated("85", "缺失信息智能追问"), demonstrated("85", "平台通用规则解答"), demonstrated("85", "商品信息场景化解答"), demonstrated("85", "订单咨询协同答复"), demonstrated("85", "售后规则与办理说明"), adapterReady("85", "跨板块咨询协同答复"), demonstrated("85", "人工介入条件判断"), demonstrated("85", "人工转接建议"), demonstrated("85", "会话处理轨迹摘要生成"), demonstrated("85", "会话已确认信息摘要"), demonstrated("85", "用户问题摘要"), adapterReady("85", "客服答复有效性判断"), adapterReady("85", "人工转接原因趋势分析"), adapterReady("85", "未解决问题类型聚类分析"), adapterReady("85", "未解决问题原因识别"),
    adapterReady("85", "客服会话违规风险线索识别"), adapterReady("85", "违规行为证据提取"), adapterReady("85", "重复违规线索识别"), adapterReady("85", "信用影响复核材料生成"),
    demonstrated("139", "客服业务上下文识别"), demonstrated("139", "人工答复依据摘要生成"), demonstrated("139", "人工客服答复建议生成"), demonstrated("139", "相关订单语义关联"), demonstrated("139", "相关服务语义关联"), demonstrated("139", "相关商品语义关联"),
    adapterReady("214", "商品搜索意图理解"), adapterReady("214", "商品型号识别"), adapterReady("214", "商品搜索词纠错"), adapterReady("214", "商品类目推断"), adapterReady("214", "商品搜索候选匹配"), adapterReady("214", "商品搜索相关性评分"),
    adapterReady("353", "投融资问题识别"), adapterReady("353", "投融资阶段流程场景解答"), adapterReady("353", "融资沟通材料清单生成"), adapterReady("353", "投融资通用风险事项场景解释"), adapterReady("353", "融资方式适用特点解释"), adapterReady("353", "融资阶段关键事项解答"), adapterReady("353", "融资沟通材料缺口说明"), adapterReady("358", "信贷问题识别"), adapterReady("358", "企业信贷申请流程场景解答"), adapterReady("358", "信贷材料清单生成"), adapterReady("358", "信贷通用风险事项场景解释"), adapterReady("358", "信贷条件场景适用性解释"), adapterReady("358", "还款方式差异解读"), adapterReady("358", "信贷材料缺口说明"),
  ],
} as const;
