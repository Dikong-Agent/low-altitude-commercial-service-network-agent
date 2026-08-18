import type { AgentInvokeRequest } from "../../contracts";
import type { CommonAIPlatformPort, CommonDomainDataPort } from "../../runtime-ports";
import type { AnalysisConversationState, AnalysisIntent, AnalysisSnapshot } from "./types";

export interface AnalysisAccessScope { source: "demo" | "trusted-gateway"; tenantId: string; subjectId: string; roles: string[]; }
export interface AIPlatformPort extends CommonAIPlatformPort {
  understandAnalysis(request: AgentInvokeRequest, conversation: AnalysisConversationState | null, options?: { signal?: AbortSignal }): Promise<AnalysisIntent>;
}
export interface AnalyticsDataPort extends CommonDomainDataPort {
  getAnalysisSnapshot(intent: AnalysisIntent, options?: { signal?: AbortSignal }): Promise<AnalysisSnapshot>;
}
export interface AnalysisConversationPort extends CommonDomainDataPort {
  loadSession(sessionId: string, scope: AnalysisAccessScope, options?: { signal?: AbortSignal }): Promise<AnalysisConversationState | null>;
  saveSession(state: AnalysisConversationState, scope: AnalysisAccessScope, options?: { signal?: AbortSignal }): Promise<AnalysisConversationState>;
}

const METRICS = {
  "M-DEMO-GMV-B2C": { name: "B2C成交额", definition: "B2C已支付且未关闭订单的含税成交金额", formula: "SUM(有效支付订单含税金额)", grain: "week", dimensions: ["品类", "渠道", "区域"], unit: "CNY", version: "v2.1", owner: "经营分析组", sourceId: "METRIC-GMV-V2" },
  "M-DEMO-REFUND-RATE": { name: "退款率", definition: "统计期内完成退款订单数占有效支付订单数的比例", formula: "完成退款订单数 / 有效支付订单数", grain: "week", dimensions: ["品类", "渠道", "售后原因"], unit: "ratio", version: "v2.0", owner: "售后运营组", sourceId: "METRIC-REFUND-RATE-V2" },
  "M-DEMO-ORDER-CONVERSION": { name: "订单转化率", definition: "完成支付的订单会话数占有效商品访问会话数的比例", formula: "支付订单会话数 / 有效商品访问会话数", grain: "week", dimensions: ["渠道", "品类", "终端"], unit: "ratio", version: "v2.0", owner: "用户运营组", sourceId: "METRIC-CONVERSION-RATE-V2" },
  "M-DEMO-LEAD-CONVERSION": { name: "线索转化率", definition: "转为有效商机的线索数占进入跟进池线索数的比例", formula: "有效商机线索数 / 进入跟进池线索数", grain: "week", dimensions: ["渠道", "行业", "区域"], unit: "ratio", version: "v1.3", owner: "B2B运营组", sourceId: "METRIC-CONVERSION-RATE-V2" },
} as const;

function detectPeriod(input: string, conversation: AnalysisConversationState | null) {
  const match = input.match(/(?:近|最近)(\d{1,3})(周|个月|月|天)/);
  if (!match) return conversation ? { count: Number(conversation.periodLabel.match(/\d+/)?.[0] ?? 8), unit: conversation.periodLabel.includes("月") ? "month" as const : conversation.periodLabel.includes("天") ? "day" as const : "week" as const, label: conversation.periodLabel, inherited: true } : { count: 8, unit: "week" as const, label: "近8周", inherited: false };
  const count = Number(match[1]); const unit = match[2] === "天" ? "day" as const : match[2].includes("月") ? "month" as const : "week" as const;
  return { count, unit, label: `近${count}${unit === "day" ? "天" : unit === "month" ? "个月" : "周"}`, inherited: false };
}

function detectDimensions(input: string, conversation: AnalysisConversationState | null): { dimensions: string[]; inherited: boolean } {
  const dimensions = [["品类", /品类|类目/], ["渠道", /渠道/], ["区域", /区域|地区/], ["商户", /商户/], ["客户", /客户|用户明细/], ["售后原因", /售后原因|退款原因/]] as const;
  const matched = dimensions.filter(([, pattern]) => pattern.test(input)).map(([name]) => name);
  if (matched.length) return { dimensions: [...new Set(matched)], inherited: false };
  if (conversation?.dimensions.length && /继续|再|它|这个指标|同样/.test(input)) return { dimensions: conversation.dimensions, inherited: true };
  return { dimensions: [], inherited: false };
}

export class DemoAIPlatformAdapter implements AIPlatformPort {
  readonly portKind = "ai-platform" as const; readonly capabilities = ["understanding"] as const;
  async understandAnalysis(request: AgentInvokeRequest, conversation: AnalysisConversationState | null): Promise<AnalysisIntent> {
    const input = request.input; const contextMetric = typeof request.context?.metric_id === "string" ? request.context.metric_id : null;
    const explicitMetric = contextMetric ?? (/订单转化率/.test(input) ? "M-DEMO-ORDER-CONVERSION" : /线索转化率/.test(input) ? "M-DEMO-LEAD-CONVERSION" : /退款率/.test(input) ? "M-DEMO-REFUND-RATE" : /B2C.*成交额|成交额|GMV/i.test(input) ? "M-DEMO-GMV-B2C" : null);
    const genericConversion = /(?:查询|分析|看|查)?转化率/.test(input) && !/订单转化率|线索转化率/.test(input);
    const followup = /继续|再|它|这个指标|同样|相比|环比|同比|分解|下钻/.test(input);
    const inheritedMetric = !explicitMetric && !genericConversion && followup ? conversation?.metricId ?? null : null;
    const metricId = explicitMetric ?? inheritedMetric;
    const period = detectPeriod(input, conversation); const dimensionResult = detectDimensions(input, conversation);
    const comparisonMode = /同比/.test(input) ? "year_over_year" as const : /环比|上期|前\d*[周月天]|相比/.test(input) ? "period_over_period" as const : followup && conversation ? conversation.comparisonMode : "none" as const;
    const requestsBusinessAction = /自动调价|自动执行|停用供应商|调整库存|下架|触发营销/.test(input);
    const requestsCausalConclusion = /认定|证明|就是.*导致|归因于|导致/.test(input);
    const requestsRestrictedDetail = /客户明细|用户明细|手机号|身份证/.test(input);
    const grainConflict = /日活.*月成交额|月成交额.*日活|粒度冲突/.test(input); const lowQuality = /质量不足|完整率|数据延迟|low quality/i.test(input);
    const noData = /无数据|不存在的指标|客单价/.test(input); const anomaly = /退款率|异常|波动/.test(input);
    const ambiguous = genericConversion && !conversation?.metricId;
    const scenario = ambiguous ? "ambiguous_metric" : grainConflict ? "grain_conflict" : noData ? "no_data" : lowQuality ? "low_quality" : requestsBusinessAction ? "business_boundary" : requestsRestrictedDetail ? "unauthorized_detail" : requestsCausalConclusion ? "causal_claim" : anomaly ? "anomaly" : "normal";
    const priorContextUsed = Boolean(conversation && (inheritedMetric || period.inherited || dimensionResult.inherited || (followup && conversation.comparisonMode !== "none")));
    return {
      question: input, metricId, scenario, periodCount: period.count, periodUnit: period.unit, periodLabel: period.label,
      dimensions: dimensionResult.dimensions, comparisonMode, chartType: /表格/.test(input) ? "table" : /柱状/.test(input) ? "bar" : "line",
      priorContextUsed, requestsCausalConclusion, requestsBusinessAction, requestsRestrictedDetail,
      needsClarification: ambiguous || (!metricId && noData),
      clarificationMessage: ambiguous ? "“转化率”存在订单转化率与线索转化率两个业务口径，请选择后再执行查询。" : !metricId && noData ? "未识别到可用指标，请从指标字典选择指标或补充指标定义。" : null,
      clarificationOptions: ambiguous ? [
        { metricId: "M-DEMO-ORDER-CONVERSION", label: "订单转化率", definition: METRICS["M-DEMO-ORDER-CONVERSION"].definition },
        { metricId: "M-DEMO-LEAD-CONVERSION", label: "线索转化率", definition: METRICS["M-DEMO-LEAD-CONVERSION"].definition },
      ] : [],
    };
  }
}

const SERIES: Record<string, number[]> = {
  "M-DEMO-GMV-B2C": [112, 118, 121, 125, 130, 134, 139, 146].map((value) => value * 10_000),
  "M-DEMO-REFUND-RATE": [0.071, 0.076, 0.073, 0.081, 0.086, 0.092, 0.108, 0.18],
  "M-DEMO-ORDER-CONVERSION": [0.032, 0.034, 0.035, 0.036, 0.039, 0.041, 0.043, 0.045],
  "M-DEMO-LEAD-CONVERSION": [0.118, 0.121, 0.119, 0.126, 0.13, 0.134, 0.132, 0.139],
};
const BASELINES: Record<string, number[]> = {
  "M-DEMO-GMV-B2C": [101, 106, 110, 113, 116, 120, 124, 130].map((value) => value * 10_000),
  "M-DEMO-REFUND-RATE": [0.067, 0.069, 0.071, 0.072, 0.074, 0.076, 0.078, 0.08],
  "M-DEMO-ORDER-CONVERSION": [0.029, 0.03, 0.031, 0.032, 0.033, 0.034, 0.035, 0.036],
  "M-DEMO-LEAD-CONVERSION": [0.108, 0.11, 0.112, 0.114, 0.116, 0.118, 0.12, 0.122],
};

export class MockAnalyticsDataAdapter implements AnalyticsDataPort {
  readonly portKind = "domain-data" as const; readonly domain = "analytics" as const;
  async getAnalysisSnapshot(intent: AnalysisIntent): Promise<AnalysisSnapshot> {
    const metricEntry = intent.metricId && intent.metricId in METRICS ? METRICS[intent.metricId as keyof typeof METRICS] : null;
    const noData = intent.scenario === "no_data" || !metricEntry; const low = intent.scenario === "low_quality";
    const values = noData ? [] : SERIES[intent.metricId!] ?? []; const baseline = intent.comparisonMode === "none" || noData ? [] : BASELINES[intent.metricId!] ?? [];
    const observations = values.map((value, index) => ({ label: `第${index + 1}周`, value, sourceId: `OBS-${intent.metricId}-${index + 1}`, series: "本期" }));
    const comparisonObservations = baseline.map((value, index) => ({ label: `基准${index + 1}周`, value, sourceId: `OBS-${intent.metricId}-BASE-${index + 1}`, series: intent.comparisonMode === "year_over_year" ? "去年同期" : "前期" }));
    const total = values.reduce((sum, value) => sum + value, 0); const categoryValues = intent.metricId === "M-DEMO-GMV-B2C" ? [["工业巡检", 4_100_000, 3_700_000], ["航拍测绘", 3_500_000, 3_200_000], ["配件服务", 2_650_000, 2_500_000]] as const : [];
    const breakdown = intent.dimensions.includes("品类") ? categoryValues.map(([value, metricValue, comparisonValue]) => ({ dimension: "品类", value, metricValue, share: total ? metricValue / total : 0, comparisonValue: baseline.length ? comparisonValue : null, changeRate: baseline.length ? (metricValue - comparisonValue) / comparisonValue : null, sourceId: `AGG-CATEGORY-${value}` })) : [];
    return {
      metric: metricEntry ? { metricId: intent.metricId!, ...metricEntry, dimensions: [...metricEntry.dimensions] } : null,
      observations: intent.scenario === "grain_conflict" ? [] : observations, comparisonObservations: intent.scenario === "grain_conflict" ? [] : comparisonObservations, breakdown,
      period: intent.periodLabel, baselinePeriod: intent.comparisonMode === "none" ? null : intent.comparisonMode === "year_over_year" ? "去年同期" : `前${intent.periodCount}${intent.periodUnit === "week" ? "周" : intent.periodUnit === "month" ? "个月" : "天"}`,
      dataCutoff: "2026-08-16", completenessRate: low ? 0.61 : 0.992, consistencyRate: low ? 0.72 : 0.986,
      freshnessAt: low ? "2026-07-01T00:00:00+08:00" : "2026-08-16T23:00:00+08:00", qualityStatus: low ? "failed" : "passed",
      threshold: intent.metricId === "M-DEMO-REFUND-RATE" ? 0.1 : null, thresholdVersion: intent.metricId === "M-DEMO-REFUND-RATE" ? "risk-v3.2" : null,
      queryId: `QRY-AG027-${intent.metricId ?? "UNKNOWN"}-${intent.periodCount}`, rowCount: noData ? 0 : values.length * 1_240,
      lineage: metricEntry ? [
        { assetId: metricEntry.sourceId, assetName: `${metricEntry.name}指标口径`, layer: "metric", version: metricEntry.version, sourceId: metricEntry.sourceId },
        { assetId: "SEM-ORDER-COMMERCE", assetName: "交易主题语义模型", layer: "semantic", version: "v1.8", sourceId: "LINEAGE-ORDER-PAYMENT" },
        { assetId: "DWS-TRADE-WEEKLY", assetName: "经营周聚合数据集", layer: "aggregate", version: "2026.08", sourceId: "LINEAGE-ORDER-PAYMENT" },
      ] : [], availableDimensions: metricEntry ? [...metricEntry.dimensions] : [],
    };
  }
}

export class InMemoryAnalysisConversationAdapter implements AnalysisConversationPort {
  readonly portKind = "domain-data" as const; readonly domain = "conversation" as const;
  private readonly sessions = new Map<string, AnalysisConversationState>();
  private key(sessionId: string, scope: AnalysisAccessScope) { return `${scope.source}:${scope.tenantId}:${scope.subjectId}:${sessionId}`; }
  async loadSession(sessionId: string, scope: AnalysisAccessScope): Promise<AnalysisConversationState | null> { return this.sessions.get(this.key(sessionId, scope)) ?? null; }
  async saveSession(state: AnalysisConversationState, scope: AnalysisAccessScope): Promise<AnalysisConversationState> { this.sessions.set(this.key(state.sessionId, scope), state); return state; }
}
