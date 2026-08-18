import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import { AgentInvokeRequestSchema, AgentInvokeResponseSchema, type AgentDataAnalysisOutput, type AgentInvokeRequest, type AgentInvokeResponse } from "../../contracts";
import { executeWithPolicy } from "../../reliability";
import type { RequestIdentity } from "../../request-identity";
import { AG027_CONFIG } from "./config";
import { resolveAg027Dependencies, type Ag027Dependencies } from "./providers";
import { AnalysisConversationStateSchema, AnalysisIntentSchema, AnalysisSnapshotSchema, type AnalysisConversationState, type AnalysisIntent, type AnalysisSnapshot } from "./types";

const TraceSchema = z.object({ name: z.string(), detail: z.string() });
const State = new StateSchema({
  request: AgentInvokeRequestSchema, traceId: z.string(), conversation: AnalysisConversationStateSchema.nullable().optional(),
  intent: AnalysisIntentSchema.optional(), snapshot: AnalysisSnapshotSchema.optional(), response: AgentInvokeResponseSchema.optional(), trace: z.array(TraceSchema).optional(),
});
const traced = (state: { trace?: { name: string; detail: string }[] }, name: string, detail: string) => [...(state.trace ?? []), { name, detail }];
const aggregate = (values: number[], unit: string | undefined) => values.length === 0 ? 0 : unit === "ratio" ? values.reduce((sum, value) => sum + value, 0) / values.length : values.reduce((sum, value) => sum + value, 0);
const formatRate = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

function conversationView(request: AgentInvokeRequest, conversation: AnalysisConversationState | null | undefined, intent: AnalysisIntent) {
  return {
    session_id: request.session_id ?? null,
    turn_count: (conversation?.turnCount ?? 0) + 1,
    prior_context_used: intent.priorContextUsed,
    context_summary: intent.priorContextUsed ? `已沿用前序指标${intent.metricId ?? "待确认"}及已确认分析范围` : "本轮按独立分析问题理解",
  };
}

function clarificationOutput(deps: Ag027Dependencies, request: AgentInvokeRequest, conversation: AnalysisConversationState | null | undefined, intent: AnalysisIntent): AgentDataAnalysisOutput {
  const summary = intent.clarificationMessage ?? "需要补充指标口径后再执行查询。";
  return {
    engine: deps.engine, result: { summary, business_action_execution: "not_performed" }, metric: null,
    query_scope: { period: intent.periodLabel, baseline_period: null, comparison_mode: intent.comparisonMode, dimensions: intent.dimensions, data_cutoff: "未查询" },
    query_plan: { query_id: `QRY-AG027-PENDING-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, status: "clarification_required", steps: ["识别经营问题", "匹配指标字典", "等待确认唯一指标口径"], filters: [intent.periodLabel, ...intent.dimensions] },
    observations: [], comparison: null, breakdown: [], chart: null,
    clarification: { message: summary, options: intent.clarificationOptions.map((item) => ({ metric_id: item.metricId, label: item.label, definition: item.definition })) },
    conversation: conversationView(request, conversation, intent), insights: [], anomaly_signals: [], hypotheses_to_verify: [],
    next_questions: intent.clarificationOptions.map((item) => `按${item.label}继续分析`),
    quality: { completeness_rate: 0, consistency_rate: 0, freshness_at: "未查询", row_count: 0, status: "limited" }, lineage: [],
    evidence: [AG027_CONFIG.ruleVersion], confidence: 0.2, warnings: ["未确认唯一指标口径，未向数据端发起正式查询"], review_required: false,
    capability_coverage: AG027_CONFIG.capabilityCoverage.map((item) => ({ ...item })),
    data_notice: "当前仅完成指标口径确认，未生成经营结论，也未执行任何业务操作。", rule_version: AG027_CONFIG.ruleVersion,
  };
}

function buildOutput(deps: Ag027Dependencies, request: AgentInvokeRequest, conversation: AnalysisConversationState | null | undefined, intent: AnalysisIntent, snap: AnalysisSnapshot): AgentDataAnalysisOutput {
  const grainConflict = intent.scenario === "grain_conflict"; const low = snap.qualityStatus !== "passed";
  const noData = snap.observations.length === 0 && !grainConflict; const anomaly = snap.threshold != null && snap.observations.some((item) => item.value > snap.threshold!);
  const restrictedDimensions = intent.requestsRestrictedDetail ? intent.dimensions.filter((item) => !["客户", "用户"].includes(item)) : intent.dimensions;
  const reviewWarnings = [
    ...(grainConflict ? ["日粒度与月粒度不可直接比较，查询已在粒度校验环节阻断"] : []),
    ...(low ? [`数据质量不足：完整率${(snap.completenessRate * 100).toFixed(1)}%、一致率${(snap.consistencyRate * 100).toFixed(1)}%，结论受限`] : []),
    ...(anomaly ? ["指标超过版本化阈值，当前仅作为异常线索，需业务人员复核"] : []),
    ...(intent.requestsCausalConclusion ? ["当前证据仅支持相关性线索，不能直接形成因果结论"] : []),
    ...(intent.requestsRestrictedDetail ? ["当前角色仅返回汇总粒度，未返回客户或用户明细"] : []),
    ...(intent.requestsBusinessAction ? ["仅输出分析和建议，未调价、未调整库存、未停用供应商或修改营销活动"] : []),
  ];
  const informationalWarnings = noData ? ["指定指标与筛选范围暂无可用观测；未使用其他范围数据替代，也未生成趋势结论"] : [];
  const warnings = [...reviewWarnings, ...informationalWarnings]; const review = reviewWarnings.length > 0;
  const currentValue = aggregate(snap.observations.map((item) => item.value), snap.metric?.unit); const baselineValue = aggregate(snap.comparisonObservations.map((item) => item.value), snap.metric?.unit);
  const change = currentValue - baselineValue; const changeRate = baselineValue === 0 ? null : change / Math.abs(baselineValue);
  const comparison = snap.comparisonObservations.length ? { current_value: currentValue, baseline_value: baselineValue, absolute_change: change, change_rate: changeRate, direction: change > 0 ? "up" as const : change < 0 ? "down" as const : "flat" as const, label: intent.comparisonMode === "year_over_year" ? "同比" : "较前期" } : null;
  const first = snap.observations[0]?.value; const last = snap.observations.at(-1)?.value; const trendRate = first && last != null ? (last - first) / Math.abs(first) : null;
  const insights = noData || grainConflict ? [] : [
    ...(trendRate == null ? [] : [`${snap.period}内${snap.metric?.name ?? "指标"}由首期到末期${trendRate >= 0 ? "上升" : "下降"}${Math.abs(trendRate * 100).toFixed(1)}%`]),
    ...(comparison?.change_rate == null ? [] : [`本期聚合值${comparison.direction === "up" ? "高于" : comparison.direction === "down" ? "低于" : "持平于"}${snap.baselinePeriod}，变动${formatRate(comparison.change_rate)}`]),
    ...(snap.breakdown[0] ? [`${snap.breakdown[0].dimension}分解中“${snap.breakdown[0].value}”贡献最高，占比${(snap.breakdown[0].share * 100).toFixed(1)}%`] : []),
  ];
  const hypotheses = [
    ...(anomaly ? ["退款率异常可能与品类结构、渠道质量或售后原因集中有关，需继续分解验证"] : []),
    ...(intent.requestsCausalConclusion ? ["活动与销量同期变化可能相关；需补充对照组、活动前基线及价格、渠道等扰动因素后验证"] : []),
  ];
  const nextQuestions = noData ? ["是否调整时间范围或业务筛选条件？", "是否改查指标字典中已有的成交额、退款率或订单转化率？"] : [
    ...(intent.dimensions.includes("品类") ? ["是否继续查看贡献最高品类的渠道分布？"] : ["是否按品类或渠道继续下钻？"]),
    ...(intent.comparisonMode === "none" ? ["是否补充环比或同比基准？"] : []),
    ...(anomaly ? ["是否按售后原因拆解异常周？"] : []),
  ];
  const summary = noData ? "当前范围未查到可用数据，因此没有生成趋势结论。可调整时间范围或筛选条件后重试。" : grainConflict ? "两个指标的数据粒度不一致，本次未执行比较。" : review ? "结果包含异常或待确认事项，暂不用于经营处置。具体限制见下方提示。" : "已按所选指标口径完成趋势、对比和维度分析。数据截止时间、查询记录和来源关系见下方。";
  const observations = [...snap.observations, ...snap.comparisonObservations];
  const evidence = [...new Set([snap.metric?.sourceId, ...observations.map((item) => item.sourceId), ...snap.breakdown.map((item) => item.sourceId), ...snap.lineage.map((item) => item.sourceId)].filter((item): item is string => Boolean(item)))];
  return {
    engine: deps.engine, result: { summary, business_action_execution: "not_performed" },
    metric: snap.metric ? { metric_id: snap.metric.metricId, name: snap.metric.name, definition: snap.metric.definition, formula: snap.metric.formula, grain: snap.metric.grain, unit: snap.metric.unit, version: snap.metric.version, owner: snap.metric.owner, source_id: snap.metric.sourceId } : null,
    query_scope: { period: snap.period, baseline_period: snap.baselinePeriod, comparison_mode: intent.comparisonMode, dimensions: restrictedDimensions, data_cutoff: snap.dataCutoff },
    query_plan: { query_id: snap.queryId, status: grainConflict ? "blocked" : "executed", steps: ["解析指标、周期、维度与比较方式", "校验指标口径、粒度、权限和质量", grainConflict ? "因粒度不兼容而停止查询" : "读取指标观测、对比基准与维度聚合", "生成趋势、异常和后续分析问题"], filters: [snap.period, ...(snap.baselinePeriod ? [snap.baselinePeriod] : []), ...restrictedDimensions] },
    observations: observations.map((item) => ({ label: item.label, value: item.value, source_id: item.sourceId, series: item.series })), comparison,
    breakdown: snap.breakdown.map((item) => ({ dimension: item.dimension, value: item.value, metric_value: item.metricValue, share: item.share, comparison_value: item.comparisonValue, change_rate: item.changeRate, source_id: item.sourceId })),
    chart: snap.observations.length ? { type: intent.chartType, title: `${snap.metric?.name ?? "指标"} · ${snap.period}${snap.baselinePeriod ? ` / ${snap.baselinePeriod}` : ""}`, x_axis: "时间", y_axis: snap.metric?.unit ?? "value", series: [
      { name: "本期", points: snap.observations.map((item) => ({ label: item.label, value: item.value, source_id: item.sourceId })) },
      ...(snap.comparisonObservations.length ? [{ name: snap.comparisonObservations[0]!.series, points: snap.comparisonObservations.map((item) => ({ label: item.label, value: item.value, source_id: item.sourceId })) }] : []),
    ] } : null,
    clarification: null, conversation: conversationView(request, conversation, intent), insights,
    anomaly_signals: anomaly && snap.threshold != null && snap.thresholdVersion ? [{ label: `${snap.metric?.name ?? "指标"}超过治理阈值`, threshold: snap.threshold, threshold_version: snap.thresholdVersion, source_id: snap.observations.at(-1)?.sourceId ?? snap.queryId }] : [],
    hypotheses_to_verify: hypotheses, next_questions: nextQuestions,
    quality: { completeness_rate: snap.completenessRate, consistency_rate: snap.consistencyRate, freshness_at: snap.freshnessAt, row_count: snap.rowCount, status: snap.qualityStatus },
    lineage: snap.lineage.map((item) => ({ asset_id: item.assetId, asset_name: item.assetName, layer: item.layer, version: item.version, source_id: item.sourceId })),
    evidence, confidence: noData ? 0.4 : review ? 0.56 : 0.9, warnings, review_required: review,
    capability_coverage: AG027_CONFIG.capabilityCoverage.map((item) => ({ ...item })),
    data_notice: deps.environment === "demo" ? "当前使用虚构指标、观测、质量状态和阈值验证问数流程；不代表甲方正式经营数据。" : "正式结论依赖数据中台提供的指标字典、来源关系、权限、质量与刷新状态。",
    rule_version: AG027_CONFIG.ruleVersion,
  };
}

export function createAg027Workflow(deps: Ag027Dependencies) {
  const loadConversation = async (state: typeof State.State) => {
    if (!state.request.session_id) return { conversation: null, trace: traced(state, "加载分析会话", "本轮未提供会话标识，按独立问题处理") };
    const conversation = await executeWithPolicy("ag027.business-data", AG027_CONFIG.reliability.businessData, (signal) => deps.conversationData.loadSession(state.request.session_id!, deps.accessScope, { signal }));
    return { conversation, trace: traced(state, "加载分析会话", conversation ? `已加载${conversation.turnCount}轮分析上下文` : "新建分析会话") };
  };
  const understand = async (state: typeof State.State) => ({
    intent: await executeWithPolicy("ag027.ai-platform", AG027_CONFIG.reliability.aiPlatform, (signal) => deps.aiPlatform.understandAnalysis(state.request, state.conversation ?? null, { signal })),
    trace: traced(state, "理解分析问题", "识别指标、周期、维度、对比方式、权限与处置边界"),
  });
  const clarify = (state: typeof State.State) => {
    const output = clarificationOutput(deps, state.request, state.conversation, state.intent!); const trace = traced(state, "澄清指标口径", "存在同名指标或指标未命中，未向数据端发起查询");
    return { response: { request_id: `AG027-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, trace_id: state.traceId, agent_id: "AG-027" as const, status: "needs_clarification" as const, environment: deps.environment, output: { title: "需要确认指标口径", summary: output.result.summary, points: [output.result.summary, ...output.next_questions], evidence: output.evidence, data_analysis: output }, trace }, trace };
  };
  const load = async (state: typeof State.State) => ({
    snapshot: await executeWithPolicy("ag027.business-data", AG027_CONFIG.reliability.businessData, (signal) => deps.analyticsData.getAnalysisSnapshot(state.intent!, { signal })),
    trace: traced(state, "执行指标查询计划", "从指标数据接口读取指标、观测、对比基准、维度汇总、质量和来源关系"),
  });
  const build = (state: typeof State.State) => {
    const output = buildOutput(deps, state.request, state.conversation, state.intent!, state.snapshot!);
    const response: AgentInvokeResponse = { request_id: `AG027-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, trace_id: state.traceId, agent_id: "AG-027", status: output.review_required ? "needs_review" : "completed", environment: deps.environment, output: { title: "经营数据分析结果", summary: output.result.summary, points: [output.result.summary, ...output.insights, ...output.warnings], evidence: output.evidence, data_analysis: output }, trace: traced(state, "生成分析结果", "输出趋势、对比、维度分析、图表数据、异常线索、来源关系和后续问题，未执行经营处置") };
    return { response, trace: response.trace };
  };
  const saveConversation = async (state: typeof State.State) => {
    if (!state.request.session_id || !state.response || !state.intent) {
      const trace = traced(state, "保存分析会话", "未提供会话标识，无需保存");
      return { trace, ...(state.response ? { response: { ...state.response, trace } } : {}) };
    }
    const current = state.conversation; const next: AnalysisConversationState = {
      sessionId: state.request.session_id, turnCount: (current?.turnCount ?? 0) + 1,
      metricId: state.intent.metricId ?? current?.metricId ?? null, periodLabel: state.intent.periodLabel,
      dimensions: state.intent.dimensions.length ? state.intent.dimensions : current?.dimensions ?? [], comparisonMode: state.intent.comparisonMode,
      recentTurns: [...(current?.recentTurns ?? []), { question: state.request.input, summary: state.response.output.summary, metricId: state.intent.metricId }].slice(-6), updatedAt: new Date().toISOString(),
    };
    await executeWithPolicy("ag027.business-data", AG027_CONFIG.reliability.businessData, (signal) => deps.conversationData.saveSession(next, deps.accessScope, { signal }));
    const trace = traced(state, "保存分析会话", `已保存第${next.turnCount}轮指标与分析范围摘要`);
    return { conversation: next, trace, response: { ...state.response, trace } };
  };
  return new StateGraph(State)
    .addNode("loadConversation", loadConversation).addNode("understand", understand).addNode("clarify", clarify).addNode("load", load).addNode("build", build).addNode("saveConversation", saveConversation)
    .addEdge(START, "loadConversation").addEdge("loadConversation", "understand").addConditionalEdges("understand", (state) => state.intent?.needsClarification ? "clarify" : "load")
    .addEdge("clarify", "saveConversation").addEdge("load", "build").addEdge("build", "saveConversation").addEdge("saveConversation", END).compile();
}

export async function invokeAg027(request: AgentInvokeRequest, traceId: string, identity?: RequestIdentity): Promise<AgentInvokeResponse> {
  const result = await createAg027Workflow(resolveAg027Dependencies(undefined, identity)).invoke({ request, traceId, trace: [] });
  if (!result.response) throw new Error("AG-027 workflow completed without a response");
  return AgentInvokeResponseSchema.parse(result.response);
}
