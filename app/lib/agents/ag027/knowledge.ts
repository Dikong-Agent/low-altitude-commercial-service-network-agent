import type { LegacyKnowledgeRecord } from "../../rag/legacy-bridge.ts";

/**
 * AG-027 only uses RAG for governed metric semantics, lineage and analysis
 * boundaries. Numeric observations remain the responsibility of the analytics
 * data port and are never generated from these knowledge records.
 */
export const AG027_GOVERNANCE_KNOWLEDGE: readonly LegacyKnowledgeRecord[] = [
  {
    id: "METRIC-GMV-V2",
    title: "成交额指标口径",
    content: "成交额是统计周期内支付成功且未全额关闭的订单实付金额合计。默认使用支付成功时间，可按周或月汇总，并按业务类型、品类、商户和渠道分析。成交额变化不能直接归因为单一活动或人员操作。",
    sourceUri: "knowledge/AG-027_指标与分析治理/指标与分析资料.md#成交额METRIC-GMV-V2",
    domain: "metric-dictionary",
  },
  {
    id: "METRIC-REFUND-RATE-V2",
    title: "退款率指标口径",
    content: "退款率是统计周期内退款成功金额除以同口径支付成功金额。分子分母必须使用一致的时间窗口、业务范围和币种；退款未完结或数据完整率不足时应标记待核验。",
    sourceUri: "knowledge/AG-027_指标与分析治理/指标与分析资料.md#退款率METRIC-REFUND-RATE-V2",
    domain: "metric-dictionary",
  },
  {
    id: "METRIC-CONVERSION-RATE-V2",
    title: "转化率指标口径",
    content: "订单转化率与线索转化率是不同业务指标。访问转化率需要确认访问范围、去重标识和时间窗口；用户只说转化率时必须先澄清具体指标口径。",
    sourceUri: "knowledge/AG-027_指标与分析治理/指标与分析资料.md#访问转化率METRIC-CONVERSION-RATE-V2",
    domain: "metric-dictionary",
  },
  {
    id: "LINEAGE-ORDER-PAYMENT",
    title: "订单支付数据血缘",
    content: "订单域支付成功事实经过租户、订单状态、币种和测试订单过滤后形成成交额事实层；正式接入时必须返回数据版本、截止时间和质量状态。",
    sourceUri: "knowledge/AG-027_指标与分析治理/指标与分析资料.md#经营指标数据血缘说明",
    domain: "metric-lineage",
  },
  {
    id: "LINEAGE-REFUND",
    title: "退款数据血缘",
    content: "退款域退款成功事实需与原支付订单关联，并使用与支付数据一致的统计范围后形成退款金额事实层。",
    sourceUri: "knowledge/AG-027_指标与分析治理/指标与分析资料.md#经营指标数据血缘说明",
    domain: "metric-lineage",
  },
  {
    id: "LINEAGE-TRAFFIC",
    title: "访问数据血缘",
    content: "访问事件经过机器人流量、无效会话和跨端重复标识过滤后形成有效访问汇总层。",
    sourceUri: "knowledge/AG-027_指标与分析治理/指标与分析资料.md#经营指标数据血缘说明",
    domain: "metric-lineage",
  },
  {
    id: "GUIDE-GRAIN-COMPATIBILITY",
    title: "指标比较口径兼容规则",
    content: "同比、环比和分组比较必须保证指标定义、统计粒度、时间窗口与业务范围可比；粒度冲突时应停止比较并请求澄清。",
    sourceUri: "knowledge/AG-027_指标与分析治理/指标与分析资料.md#经营分析解释与边界指引",
    domain: "analysis-guidance",
  },
  {
    id: "GUIDE-ANOMALY-INTERPRETATION",
    title: "异常线索解释规则",
    content: "异常信号只表示指标偏离历史基线，应列出待验证假设，不能直接等同于根因或形成正式经营处置。",
    sourceUri: "knowledge/AG-027_指标与分析治理/指标与分析资料.md#经营分析解释与边界指引",
    domain: "analysis-guidance",
  },
  {
    id: "GUIDE-CAUSAL-BOUNDARY",
    title: "经营分析因果边界",
    content: "观察性经营数据只能支持相关性描述。因果判断需要实验设计、反事实证据或业务复核；Agent只生成分析建议，不执行调价、停用供应商、授信等业务动作。",
    sourceUri: "knowledge/AG-027_指标与分析治理/指标与分析资料.md#经营分析解释与边界指引",
    domain: "analysis-guidance",
  },
] as const;
