"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SHOWCASE_AGENTS } from "../lib/showcase-agents";
import type { AgentAccessoryRecommendationOutput, AgentComparisonOutput, AgentCustomerServiceOutput, AgentDataAnalysisOutput, AgentDeduplicationOutput, AgentDefinition, AgentId, AgentInvokeResponse, AgentLearningRecommendationOutput, AgentManualOutput, AgentPolicyOutput, AgentQuoteComparisonOutput, AgentRagRuntime, AgentRecommendationOutput, ManualTopic, PolicyTopic } from "../lib/contracts";
import { AgentGatewayError, invokeAgent } from "../lib/agent-gateway";

const capabilityStats = [
  { value: "28", label: "总体规划" },
  { value: "6", label: "已完成场景样例" },
  { value: "6", label: "当前可体验" },
];

const agentPresentation: Record<string, { scene: string; input: string; output: string }> = {
  "AG-027": { scene: "经营指标连续问数与维度分析", input: "经营问题、指标口径、周期、维度与对比方式", output: "查询计划、趋势对比、维度分析、质量状态与异常线索" },
  "AG-001": { scene: "产品选型与参数比较", input: "候选型号、使用场景与约束条件", output: "结构化对比、约束校验与选型建议" },
  "AG-012": { scene: "政策与标准解读", input: "政策文件、查询时点、业务主体与使用场景", output: "现行版本、要求清单、办理核对步骤与条款依据" },
  "AG-025": { scene: "商品、订单、售后、商业服务与沟通风险咨询", input: "用户问题、业务对象与会话上下文", output: "问题答复、准备清单、风险复核线索与人工接续材料" },
};

const knowledgePresentation: Record<string, { label: string; title: string; detail: string }> = {
  "AG-027": { label: "演示指标资料", title: "4项指标口径 · 两个对比周期 · 指标来源关系", detail: "支持连续问数、查询计划、同比环比、维度分析、质量检查和原因线索分析" },
  "AG-001": { label: "知识资产目录", title: "3项产品参数知识档案", detail: "统一记录知识编号、版本、来源性质和维护状态" },
  "AG-012": { label: "知识资产目录", title: "4项政策与标准知识档案", detail: "含1项国务院官网公开条例摘录及3项版本演示材料" },
  "AG-025": { label: "知识资产目录", title: "5项客服知识档案", detail: "覆盖平台规则、售后投诉、专业服务、投融资和企业信贷咨询" },
};

const runnableCount = SHOWCASE_AGENTS.length;

function presentEvidenceLabel(value: string): string {
  if (/^AG-?\d{3}(?:\s|-).*(?:rule|规则|port|边界)/i.test(value)) return "处理规则";
  const protectedOrderIds: string[] = [];
  const protectedValue = value.replace(/JDZ-DEMO-\d+/gi, (orderId) => {
    const index = protectedOrderIds.push(orderId) - 1;
    return `__ORDER_ID_${index}__`;
  });
  const presented = protectedValue
    .replace(/^MockOrderData\s*·\s*/i, "演示订单记录 · ")
    .replace(/^MockProductData\s*·\s*/i, "演示商品记录 · ")
    .replace(/^MockServiceData\s*·\s*/i, "演示服务记录 · ")
    .replace(/\bv(\d+(?:\.\d+)*)-demo\b/gi, "演示版本 $1")
    .replaceAll("Mock", "演示样例")
    .replaceAll("DEMO", "样例");
  return protectedOrderIds.reduce(
    (result, orderId, index) => result.replace(`__ORDER_ID_${index}__`, orderId),
    presented,
  );
}

function presentEvidenceLabels(values: string[]): string[] {
  return [...new Set(values.map(presentEvidenceLabel))];
}

const manualTopicLabels: Record<ManualTopic, string> = {
  overview: "产品概况",
  operation: "操作指引",
  safety: "安全事项",
  troubleshooting: "故障排查",
  terminology: "术语解释",
  compliance: "合规要求",
};

const policyTopicLabels: Record<PolicyTopic, string> = {
  scope: "适用范围",
  filing: "活动报备",
  operation: "运行管理",
  operation_safety: "运行安全",
  record_retention: "记录保存",
  logistics: "低空物流",
  applicability: "适用条件",
  timeliness: "政策时效",
  version_status: "版本状态",
  business_impact: "业务影响",
  airworthiness: "适航要求",
};

const policyChangeLabels: Record<AgentPolicyOutput["changes"][number]["change_type"], string> = {
  added: "新增",
  removed: "废止",
  modified: "调整",
  moved: "迁移",
};

interface DemoHistoryItem {
  requestId: string;
  input: string;
  summary: string;
  createdAt: string;
}

const HISTORY_KEY = "jdz-ag001-demo-history";
const SESSION_KEY = "jdz-agent-demo-session";

function loadDemoHistory(): DemoHistoryItem[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter((item): item is DemoHistoryItem => Boolean(item)
        && typeof item === "object"
        && typeof item.requestId === "string"
        && typeof item.input === "string"
        && typeof item.summary === "string"
        && typeof item.createdAt === "string").slice(0, 5)
      : [];
  } catch {
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* Browser storage may be unavailable. */ }
    return [];
  }
}

function persistDemoHistory(items: DemoHistoryItem[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch { /* History is optional device-local state. */ }
}

function clearDemoHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* History is optional device-local state. */ }
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = `showroom-${crypto.randomUUID()}`;
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `showroom-${crypto.randomUUID()}`;
  }
}

function AgentMark({ agent, compact = false }: { agent: AgentDefinition; compact?: boolean }) {
  return <span className={`agent-mark tone-${agent.tone} ${compact ? "compact" : ""}`} aria-hidden="true"><span>{agent.symbol}</span></span>;
}

function extractRagRuntime(output: AgentInvokeResponse["output"]): AgentRagRuntime | undefined {
  return output.comparison?.rag_runtime
    ?? output.manual?.rag_runtime
    ?? output.recommendation?.rag_runtime
    ?? output.policy?.rag_runtime
    ?? output.news_recommendation?.rag_runtime
    ?? output.customer_service?.rag_runtime;
}

function RagEvidencePanel({ rag }: { rag?: AgentRagRuntime }) {
  if (!rag || !rag.evidence.length) return null;
  const hasOfficialEvidence = rag.evidence.some((item) => /国务院官网|公开现行行政法规/.test(item.source_nature));
  const statusLabels: Record<AgentRagRuntime["status"], string> = { completed: "证据校验通过", evidence_only: "仅返回证据", insufficient_evidence: "证据不足", validation_failed: "引用校验未通过" };
  const lifecycleLabels: Record<string, string> = { published: "当前发布", superseded: "已被替代", withdrawn: "已撤回", active: "有效" };
  const evidenceByChunk = new Map(rag.evidence.map((item) => [item.chunk_id, item.knowledge_id]));
  return (
    <section className="rag-evidence-panel">
      <header>
        <div><span>引用资料</span><strong>查看结论对应的原文位置和资料版本</strong></div>
        <b className={`rag-status status-${rag.status}`}>{statusLabels[rag.status]}</b>
      </header>
      <div className="rag-audit-strip">
        <span>知识证据 <b>{rag.evidence.length}</b></span>
          <span>引用完整度 <b>{rag.citation_coverage === null ? "—" : `${Math.round(rag.citation_coverage * 100)}%`}</b></span>
          <span>结论有据率 <b>{rag.grounding_support === null ? "—" : `${Math.round(rag.grounding_support * 100)}%`}</b></span>
        <span>检索方式 <b>{rag.vector_evidence_count > 0 ? "关键词 + 向量" : "关键词"}</b></span>
      </div>
        {rag.claims.length > 0 && <div className="rag-claims"><strong>结论与依据对应关系</strong>{rag.claims.map((claim, index) => (
        <article key={`${index}-${claim.text}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{claim.text}<small>{[...new Set(claim.evidence_chunk_ids.map((id) => evidenceByChunk.get(id) ?? id))].join(" · ")}</small></p></article>
      ))}</div>}
      <div className="rag-evidence-list">{rag.evidence.map((item, index) => (
        <article key={item.chunk_id}>
          <div className="rag-evidence-index"><span>依据 {String(index + 1).padStart(2, "0")}</span><b>{lifecycleLabels[item.lifecycle_status] ?? item.lifecycle_status}</b></div>
          <div className="rag-evidence-main">
            <small>{item.knowledge_id} · {item.document_type} · {item.document_version}</small>
            <strong>{item.title}</strong>
            <p>{item.excerpt}</p>
            <dl>
              <div><dt>来源单位</dt><dd>{item.source_organization}</dd></div>
              <div><dt>来源性质</dt><dd>{item.source_nature}</dd></div>
              <div><dt>原文定位</dt><dd>{item.section ?? "知识条目"}</dd></div>
              <div><dt>生效信息</dt><dd>{item.effective_from ?? "未设置"}{item.effective_to ? ` 至 ${item.effective_to}` : " 起"}</dd></div>
              <div><dt>访问级别</dt><dd>{item.confidentiality}</dd></div>
              <div><dt>检索评分</dt><dd>综合 {item.fused_score.toFixed(3)}{item.rerank_score === null ? "" : ` · 复核排序 ${item.rerank_score.toFixed(3)}`}</dd></div>
            </dl>
            {/^https?:\/\//.test(item.source_uri) ? <a className="rag-source-link" href={item.source_uri} target="_blank" rel="noreferrer">查看公开来源 ↗</a> : <em>{item.source_uri}</em>}
          </div>
        </article>
      ))}</div>
      <p className="rag-evidence-notice">{hasOfficialEvidence ? "本次包含经国务院官网核验的公开条例摘录；公开摘录不替代完整法规、实时空域信息或主管部门口径。其他样例资料仍为项目虚构材料。" : "以上材料为项目虚构演示知识资产；正式环境需替换为经授权、已审核且处于有效状态的业务知识。"}</p>
    </section>
  );
}

function ActualExecutionPanel({ response }: { response: AgentInvokeResponse }) {
  const steps = response.trace ?? [];
  if (!steps.length) return null;
  return <section className="actual-execution">
    <header><div><span>本次处理记录</span><strong>记录由本次运行返回</strong></div><b>{response.trace_id}</b></header>
    <div>{steps.map((step, index) => <article key={`${index}-${step.name}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{step.name}</strong><p>{step.detail}</p></div><i /></article>)}</div>
          <footer><span>处理状态：{response.status === "completed" ? "已完成" : response.status === "needs_review" ? "待人工复核" : response.status === "needs_clarification" ? "等待补充信息" : "功能说明"}</span><b>本次未执行审批、发布、交易或人工转接</b></footer>
  </section>;
}

function ReviewRequestPanel({ response }: { response: AgentInvokeResponse }) {
  const review = response.output.review_request;
  if (!review) return null;
  return <section className="review-request-panel">
    <div><span>人工复核任务已创建</span><strong>{review.reason}</strong><small>复核编号 {review.review_id} · 当前状态 {review.status === "pending" ? "待处理" : review.status}</small></div>
    <time>有效期至<br />{new Date(review.expires_at).toLocaleString("zh-CN", { hour12: false })}</time>
  </section>;
}

function LiveTracePanel({ agent, response, loading }: { agent: AgentDefinition; response: AgentInvokeResponse | null; loading: boolean }) {
  const actual = response?.trace?.length ? response.trace : null;
  const steps = actual ?? agent.trace.map((name, index) => ({ name, detail: agent.traceNotes[index] ?? "" }));
  return <aside className="trace-panel">
    <div className="panel-title"><span>{actual ? "本次处理记录" : "处理流程"}</span><b>{actual ? "本次运行结果" : "流程说明"}</b></div>
    <div className="trace-status"><span className={`trace-symbol tone-${agent.tone}`}>{agent.symbol}</span><div><small>{actual ? response?.trace_id : "流程说明"}</small><strong>{agent.workflow}</strong></div></div>
    <div className="trace-list">{steps.map((step, index) => (
      <div className={actual || (!loading && index === 0) || (loading && index < 3) ? "done" : ""} key={`${index}-${step.name}`}>
        <span>{String(index + 1).padStart(2, "0")}</span><p><strong>{step.name}</strong><small>{step.detail}</small></p><i />
      </div>
    ))}</div>
    <div className="trace-metrics"><div><span>流程状态</span><strong>{response ? (response.status === "completed" ? "已完成" : response.status === "needs_review" ? "待复核" : "待补充") : agent.availability === "runnable" ? "可运行" : "功能说明"}</strong></div><div><span>记录类型</span><strong>{actual ? "本次运行" : "预设流程"}</strong></div></div>
  </aside>;
}

function ComparisonPanel({ comparison }: { comparison: AgentComparisonOutput }) {
  const [tableView, setTableView] = useState<"horizontal" | "vertical">("horizontal");
  const productById = new Map(comparison.products.map((product) => [product.id, product]));
  const intentItems = [
    ...(comparison.intent.use_cases.length
      ? comparison.intent.use_cases.map((useCase) => `场景 · ${useCase}`)
      : comparison.intent.use_case ? [`场景 · ${comparison.intent.use_case}`] : []),
    comparison.intent.budget_yuan ? `预算 · ${Math.round(comparison.intent.budget_yuan / 10000)}万元` : null,
    ...comparison.intent.focus_dimensions.map((item) => `关注 · ${item}`),
    ...comparison.intent.hard_constraints.map((item) => `必要条件 · ${item}`),
    ...comparison.intent.requested_features.map((item) => `必要能力 · ${item}`),
  ].filter((item): item is string => Boolean(item));
  const quality = comparison.parameter_quality;
  const qualityReview = quality.conflict_items.length > 0 || quality.missing_items.length > 0;
  const hasUnverified = comparison.intent.unverified_conditions.length > 0;
  const decisionLabels = {
    recommended: "选型建议", comparison_only: "差异比较", quality_review: "参数复核", no_eligible: "条件未满足", insufficient_evidence: "资料不足",
  } as const;
  const qualityLabels = { verified: "来源已核验", master_only: "仅主数据", conflict: "口径冲突", missing: "资料缺失" } as const;

  return (
    <div className="comparison-result">
      <div className="intent-strip">
        <span>识别条件</span>
        <div>{intentItems.length ? intentItems.map((item) => <b key={item}>{item}</b>) : <b>通用型号比较</b>}</div>
      </div>

      <div className={`recommendation-band ${comparison.recommendation.primary_product_id ? "success" : "review"}`}>
        <span>{decisionLabels[comparison.decision_assessment.status]} · {comparison.decision_assessment.confidence === "not_applicable" ? "不评定置信度" : `${comparison.decision_assessment.confidence === "high" ? "高" : comparison.decision_assessment.confidence === "medium" ? "中" : "低"}置信度`}</span>
        <strong>{comparison.recommendation.primary_product_name ?? (comparison.decision_assessment.status === "comparison_only" ? "本次不指定首选型号" : "当前不形成首选建议")}</strong>
        <p>{comparison.recommendation.reason}</p>
      </div>

      <section className={`parameter-quality ${qualityReview || hasUnverified ? "review" : "passed"}`}>
        <header><div><span>参数质量检查</span><strong>{qualityReview || hasUnverified ? "存在待确认事项" : "参数口径可用于本次比较"}</strong></div><b>{quality.source_count}份来源资料</b></header>
        <div className="parameter-quality-stats">
          <article><span>单位换算</span><strong>{quality.normalized_conversions.length}</strong><small>项已转为统一口径</small></article>
          <article><span>资料缺失</span><strong>{quality.missing_items.length}</strong><small>项没有可用参数值</small></article>
          <article><span>来源冲突</span><strong>{quality.conflict_items.length}</strong><small>项未自动裁定</small></article>
          <article><span>来源缺口</span><strong>{quality.source_gap_items.length}</strong><small>项目前仅有主数据</small></article>
        </div>
        {quality.normalized_conversions.length > 0 && <div className="quality-detail conversions"><strong>口径换算记录</strong>{quality.normalized_conversions.map((item) => <p key={`${item.product_id}-${item.field}-${item.source_id}`}><span>{item.product_name.replace("样例·", "")} · {item.field}</span>{item.raw} → <b>{item.normalized}</b><small>{item.source_id}</small></p>)}</div>}
        {quality.conflict_items.length > 0 && <div className="quality-detail conflicts"><strong>多来源参数冲突</strong>{quality.conflict_items.map((item) => <p key={`${item.product_id}-${item.field}`}><span>{item.product_name.replace("样例·", "")} · {item.field}</span>{item.detail}<small>{item.source_ids.join(" · ")}</small></p>)}</div>}
        {quality.missing_items.length > 0 && <div className="quality-detail missing"><strong>参数资料缺失</strong>{quality.missing_items.map((item) => <p key={`${item.product_id}-${item.field}`}><span>{item.product_name.replace("样例·", "")} · {item.field}</span>{item.detail}</p>)}</div>}
        {quality.source_gap_items.length > 0 && <div className="quality-detail missing"><strong>参数来源待补充</strong>{quality.source_gap_items.map((item) => <p key={`${item.product_id}-${item.field}`}><span>{item.product_name.replace("样例·", "")} · {item.field}</span>{item.detail}</p>)}</div>}
        {comparison.intent.unverified_conditions.length > 0 && <div className="quality-detail unverified"><strong>尚未核验的必要条件</strong>{comparison.intent.unverified_conditions.map((item) => <p key={item}>! {item}</p>)}</div>}
      </section>

      {comparison.table.length > 0 && <>
        <div className="table-view-switch" aria-label="对比表布局">
          <span>参数对比</span>
          <div>
            <button type="button" aria-pressed={tableView === "horizontal"} onClick={() => setTableView("horizontal")}>横向表</button>
            <button type="button" aria-pressed={tableView === "vertical"} onClick={() => setTableView("vertical")}>纵向表</button>
          </div>
        </div>
        {tableView === "horizontal" ? (
          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead><tr><th>对比维度</th>{comparison.products.map((product) => <th key={product.id}>{product.name.replace("样例·", "")}</th>)}</tr></thead>
              <tbody>{comparison.table.map((row) => (
                <tr key={row.key}><th>{row.label}</th>{comparison.products.map((product) => {
                  const value = row.values.find((item) => item.product_id === product.id);
                  const isBest = row.best_product_ids.includes(product.id);
                  return <td key={product.id} className={isBest ? "best" : ""}>
                    {value?.display ?? "未提供"}{isBest && <small>优势项</small>}{value && value.quality_status !== "verified" && <small className={`quality-${value.quality_status}`}>{qualityLabels[value.quality_status]}</small>}
                  </td>;
                })}</tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="vertical-comparison-list">
            {comparison.products.map((product) => (
              <article key={product.id}>
                <header><small>{product.id}</small><strong>{product.name}</strong></header>
                <div>{comparison.table.map((row) => {
                  const value = row.values.find((item) => item.product_id === product.id);
                  return <p key={row.key}><span>{row.label}</span><b className={row.best_product_ids.includes(product.id) ? "best" : ""}>{value?.display ?? "未提供"}{value && value.quality_status !== "verified" ? ` · ${qualityLabels[value.quality_status]}` : ""}</b></p>;
                })}</div>
              </article>
            ))}
          </div>
        )}
      </>}

      {comparison.difference_analysis.length > 0 && <section className="difference-analysis">
        <header><span>关键差异</span><strong>差异依据与决策相关性</strong></header>
        <div>{comparison.difference_analysis.filter((item) => item.decision_relevance !== "reference").slice(0, 6).map((item) => <article key={item.key}><b>{item.decision_relevance === "required" ? "必要条件" : "关注维度"}</b><strong>{item.label}</strong><p>{item.summary}</p><small>{qualityLabels[item.quality_status]}{item.source_refs.length ? ` · ${item.source_refs.join(" · ")}` : ""}</small></article>)}</div>
      </section>}

      <div className="product-evaluations">
        {comparison.products.map((product) => (
          <article key={product.id} className={product.eligible ? "eligible" : "ineligible"}>
            <header><div><small>{product.id}</small><strong>{product.name}</strong></div><b>{product.score}<small>/100 · 辅助排序 · {product.eligible ? "必要条件通过" : "必要条件未通过"}</small></b></header>
            <p>{product.scenario_fit}</p>
            <div className="decision-breakdown">
              <span>必要条件 {product.score_breakdown.hard_constraint_passed}/{product.score_breakdown.hard_constraint_total || 0}</span>
              <span>场景覆盖 {product.score_breakdown.scenario_score}分</span>
              <span>关注维度 {product.score_breakdown.preference_score}分</span>
            </div>
            {product.constraint_checks.length > 0 && <div className="constraint-checks">{product.constraint_checks.map((item) => <p className={item.determination === "passed" ? "passed" : "failed"} key={item.label}><b>{item.determination === "passed" ? "通过" : item.determination === "needs_review" ? "待复核" : "未通过"}</b><span>{item.label}</span><small>当前：{item.actual} · {qualityLabels[item.evidence_status]}</small></p>)}</div>}
            <details className="capability-profile"><summary>查看单型号能力画像</summary><div><p><b>性能</b>{product.capability_profile.performance.join("；")}</p><p><b>成本与服务</b>{product.capability_profile.cost_and_service.join("；")}</p><p><b>适用场景</b>{product.capability_profile.applicable_scenarios.join("、")}</p><p><b>使用限制</b>{product.capability_profile.usage_limits.join("；") || "资料未列明特殊限制"}</p><small>依据：{product.capability_profile.evidence_refs.join(" · ") || "主数据"}</small></div></details>
            <div className="evaluation-columns">
              <div><span>优势</span>{product.advantages.length ? product.advantages.map((item) => <p key={item}>＋ {item}</p>) : <p>暂无明显优势项</p>}</div>
              <div><span>限制</span>{product.limitations.length ? product.limitations.map((item) => <p key={item}>－ {item}</p>) : <p>未发现必要条件冲突</p>}</div>
            </div>
          </article>
        ))}
      </div>

      {comparison.recommendation.alternative_reasons.length > 0 && <section className="alternative-analysis"><strong>备选方案适用条件</strong>{comparison.recommendation.alternative_reasons.map((item) => <article key={item.product_id}><b>{item.product_name}</b><p><span>未列为首选</span>{item.why_not_primary}</p><p><span>更适合的情况</span>{item.when_preferred}</p></article>)}</section>}
      {comparison.decision_assessment.sensitivity_notes.length > 0 && <div className="conflict-box"><strong>结论敏感项</strong>{comparison.decision_assessment.sensitivity_notes.map((item) => <p key={item}>! {item}</p>)}</div>}

      {comparison.conflicts.length > 0 && <div className="conflict-box"><strong>条件冲突</strong>{comparison.conflicts.map((item) => <p key={item}>! {item}</p>)}</div>}
      <p className="data-notice">当前展示使用演示样例产品，不代表正式商品、价格、库存或采购结论。</p>
      <span className="engine-label">本次比较范围 · {productById.size}个候选产品</span>
    </div>
  );
}

function ManualPanel({ manual }: { manual: AgentManualOutput }) {
  const riskLabels = { warning: "安全风险", prohibited: "操作禁忌", compliance: "合规要求" } as const;
  return (
    <div className="manual-result">
      <div className="manual-document-band">
        <div><small>{manual.document.id} · {manual.document.version}</small><strong>{manual.document.title}</strong><span>{manual.document.source_type} · 更新于 {manual.document.updated_at}</span></div>
        <b>{manual.document_structure.chapters}章 / {manual.document_structure.figures}图示</b>
      </div>

      <div className="intent-strip">
        <span>理解结果</span>
        <div>
          {manual.intent.topics.map((topic) => <b key={topic}>主题 · {manualTopicLabels[topic]}</b>)}
          {manual.intent.scenarios.map((scenario) => <b key={scenario}>场景 · {scenario}</b>)}
          {manual.intent.terms.map((term) => <b key={term}>术语 · {term}</b>)}
        </div>
      </div>

      <div className="manual-answer"><span>问题答复</span><p>{manual.answer}</p></div>

      {manual.steps.length > 0 && <section className="manual-steps">
        <header><strong>操作步骤</strong><small>按说明书规定的条件和顺序整理</small></header>
        <div>{manual.steps.map((step) => (
          <article key={`${step.order}-${step.title}`}>
            <b>{String(step.order).padStart(2, "0")}</b>
            <div><strong>{step.title}</strong><p>{step.instruction}</p>{step.condition && <span>条件：{step.condition}</span>}{step.safety_note && <em>注意：{step.safety_note}</em>}<small>{step.source_ref}</small></div>
          </article>
        ))}</div>
      </section>}

      {manual.risk_markers.length > 0 && <div className="manual-risks">
        {manual.risk_markers.map((risk) => <article className={`risk-${risk.level}`} key={`${risk.level}-${risk.label}`}><span>{riskLabels[risk.level]}</span><strong>{risk.label}</strong><p>{risk.detail}</p><small>{risk.source_ref}</small></article>)}
      </div>}

      {manual.glossary.length > 0 && <section className="manual-glossary"><header><strong>术语说明</strong></header><div>{manual.glossary.map((item) => <article key={item.term}><b>{item.term}</b><p>{item.plain_explanation}</p><small>{item.source_ref}</small></article>)}</div></section>}

      <section className="manual-citations">
        <header><strong>原文定位</strong><small>按与当前问题的相关程度展示</small></header>
        <div>{manual.citations.map((citation) => <article key={citation.section_id}><span>{Math.round(citation.relevance * 100)}%</span><div><strong>{citation.location}</strong><p>{citation.excerpt}</p></div></article>)}</div>
      </section>

      <div className="manual-coverage"><span><b>{manual.capability_coverage.length}</b>项需求功能已关联</span><p>其中{manual.capability_coverage.filter((item) => item.status === "mock-demonstrated").length}项可在当前样例中运行；图示与图表解读仍需接入原始文档和多模态解析服务。</p></div>
      <p className="data-notice">当前展示使用演示样例说明书；实际操作请以真实有效手册、现行规范和专业人员确认结果为准。</p>
    </div>
  );
}

function RecommendationPanel({ recommendation }: { recommendation: AgentRecommendationOutput }) {
  const candidates = [...recommendation.solution_candidates, ...recommendation.product_candidates];
  const budgetDisplay = recommendation.intent.budget_yuan === null
    ? null
    : recommendation.intent.budget_yuan >= 10_000
      ? `${Number((recommendation.intent.budget_yuan / 10_000).toFixed(2))}万元`
      : `${recommendation.intent.budget_yuan}元`;
  const intentItems = [
    ...recommendation.intent.use_cases.map((item) => `场景 · ${item}`),
    budgetDisplay ? `预算 · ${budgetDisplay}` : null,
    ...recommendation.intent.focus_tags.map((item) => `关注 · ${item}`),
    ...recommendation.intent.ignored_focus_tags.map((item) => `非重点 · ${item}`),
    ...recommendation.intent.excluded_focus_tags.map((item) => `排除 · ${item}`),
    ...recommendation.intent.inferred_categories.map((item) => `类目 · ${item}`),
    ...recommendation.intent.query_terms.map((item) => `搜索 · ${item}`),
    recommendation.intent.experience_level === "beginner" ? "用户 · 新手" : null,
  ].filter((item): item is string => Boolean(item));
  const demonstrated = recommendation.capability_coverage.filter((item) => item.status === "mock-demonstrated").length;

  return (
    <div className="recommendation-result">
      <div className="intent-strip"><span>需求识别结果</span><div>{intentItems.map((item) => <b key={item}>{item}</b>)}</div></div>
      {recommendation.intent.corrected_terms.length > 0 && <div className="correction-note"><span>搜索词纠错</span>{recommendation.intent.corrected_terms.map((item) => <b key={item.from}>{item.from} → {item.to}</b>)}</div>}
      <div className={`recommendation-band ${recommendation.recommendation.primary_id ? "success" : "review"}`}>
        <span>{recommendation.recommendation.primary_id ? "首选建议" : "约束结论"}</span>
        <strong>{recommendation.recommendation.primary_name ?? "当前无满足全部条件的候选"}</strong>
        <p>{recommendation.recommendation.reason}</p>
      </div>
      <section className="candidate-section">
        <header><strong>{recommendation.mode === "scenario_solution" ? "场景方案候选" : "商品候选"}</strong><small>优先满足必要条件，再综合评估相关性</small></header>
        <div>{candidates.map((candidate, index) => (
          <article className={candidate.eligible ? "eligible" : "ineligible"} key={candidate.id}>
            <div className="candidate-rank"><span>{String(index + 1).padStart(2, "0")}</span><b>{candidate.score}<small>/100</small></b></div>
            <div className="candidate-copy"><small>{candidate.id} · {candidate.category}{recommendation.intent.requested_product_ids.length ? ` · ${candidate.request_match ? "目标匹配" : "替代候选"}` : ""}</small><strong>{candidate.name}</strong><p>{candidate.reason}</p>
              <div>{candidate.matched_tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <p className="condition-assessment">{candidate.condition_assessment}</p>
              {candidate.suitable_conditions.length > 0 && <p className="suitable-conditions">适用条件：{candidate.suitable_conditions.join("；")}</p>}
              <em>样例价 ¥{candidate.price_yuan.toLocaleString("zh-CN")} · {candidate.eligible ? "符合必要条件与适用范围" : "不符合当前条件"}</em>
            </div>
          </article>
        ))}</div>
      </section>
      {[...new Set([...recommendation.gaps, ...recommendation.missing_data])].length > 0 && <div className="recommendation-gaps"><strong>差距与待确认事项</strong>{[...new Set([...recommendation.gaps, ...recommendation.missing_data])].slice(0, 6).map((item) => <p key={item}>! {item}</p>)}</div>}
      <div className="manual-coverage"><span><b>{recommendation.capability_coverage.length}</b>项需求功能已关联</span><p>其中{demonstrated}项可在当前样例中运行，覆盖需求识别、条件筛选和推荐依据；图片找货与二手交易尚未接入正式服务。</p></div>
      <p className="data-notice">当前展示使用演示样例方案、产品与价格，不代表真实商城信息、正式报价或采购建议。</p>
    </div>
  );
}

function QuoteComparisonPanel({ quoteComparison }: { quoteComparison: AgentQuoteComparisonOutput }) {
  return <div className="recommendation-result">
    <div className="intent-strip"><span>询价理解</span><div><b>对象 · {quoteComparison.intent.object_name ?? "待确认"}</b><b>数量 · {quoteComparison.intent.quantity}</b>{quoteComparison.intent.required_delivery_days && <b>交付 · {quoteComparison.intent.required_delivery_days}天内</b>}</div></div>
    <div className={`recommendation-band ${quoteComparison.result.recommended_quote_id ? "success" : "review"}`}><span>采购辅助结论</span><strong>{quoteComparison.result.recommended_quote_id ?? "当前不形成首选"}</strong><p>{quoteComparison.result.recommendation}</p></div>
    <section className="candidate-section"><header><strong>供应商报价候选</strong><small>已统一含税、运费、优惠、交付与质保口径</small></header><div>{quoteComparison.quotes.map((quote, index) => <article className={quote.status === "valid" && quote.comparable ? "eligible" : "ineligible"} key={quote.quote_id}>
      <div className="candidate-rank"><span>{String(index + 1).padStart(2, "0")}</span><b>{quote.score}<small>/100</small></b></div>
      <div className="candidate-copy"><small>{quote.quote_id} · 有效至 {quote.valid_until}</small><strong>{quote.supplier_name}</strong><p>{quote.object_name}</p><div><span>综合成本 ¥{quote.total_cost_yuan.toLocaleString("zh-CN")}</span><span>交付 {quote.delivery_days}天</span><span>质保 {quote.warranty_months}个月</span></div><p className="suitable-conditions">优势：{quote.advantages.join("；") || "暂无明显优势项"}</p>{quote.concerns.length > 0 && <em>关注：{quote.concerns.join("；")}</em>}</div>
    </article>)}</div></section>
    {quoteComparison.warnings.length > 0 && <div className="recommendation-gaps"><strong>待确认事项</strong>{quoteComparison.warnings.map((item) => <p key={item}>! {item}</p>)}</div>}
    <div className="manual-coverage"><span><b>{quoteComparison.capability_coverage.length}</b>项需求功能已关联</span><p>结果置信度 {Math.round(quoteComparison.confidence * 100)}% · {quoteComparison.review_required ? "需采购人员复核" : "当前无需强制复核"}</p></div>
    <p className="data-notice">{quoteComparison.data_notice}</p>
  </div>;
}

function LearningRecommendationPanel({ learning }: { learning: AgentLearningRecommendationOutput }) {
  return <div className="recommendation-result">
    <div className="intent-strip"><span>需求理解</span><div><b>类型 · {learning.mode === "training_video" ? "培训视频" : "线下活动"}</b>{learning.intent.topics.map((topic) => <b key={topic}>主题 · {topic}</b>)}{learning.intent.region && <b>地区 · {learning.intent.region}</b>}</div></div>
    <div className={`recommendation-band ${learning.result.primary_id ? "success" : "review"}`}><span>推荐结果</span><strong>{learning.result.primary_name ?? "当前无合适候选"}</strong><p>{learning.result.recommendation}</p></div>
    <section className="candidate-section"><header><strong>{learning.mode === "training_video" ? "培训视频候选" : "活动候选"}</strong><small>先核验有效状态，再评估主题、难度与时空条件</small></header><div>{learning.candidates.map((candidate, index) => <article className={candidate.eligible ? "eligible" : "ineligible"} key={candidate.id}>
      <div className="candidate-rank"><span>{String(index + 1).padStart(2, "0")}</span><b>{candidate.score}<small>/100</small></b></div>
      <div className="candidate-copy"><small>{candidate.id} · {candidate.format}</small><strong>{candidate.name}</strong><p>{candidate.reason}</p><div>{candidate.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>{candidate.location && <em>{candidate.location} · {candidate.starts_at?.slice(0, 10)}</em>}{candidate.limitations.length > 0 && <p className="condition-assessment">限制：{candidate.limitations.join("；")}</p>}</div>
    </article>)}</div></section>
    <div className="recommendation-gaps"><strong>反馈与边界</strong>{[...learning.feedback_notes, ...learning.warnings].map((item) => <p key={item}>! {item}</p>)}</div>
    <div className="manual-coverage"><span><b>{learning.capability_coverage.length}</b>项需求功能已关联</span><p>结果置信度 {Math.round(learning.confidence * 100)}% · 未执行报名或活动承诺</p></div>
    <p className="data-notice">{learning.data_notice}</p>
  </div>;
}

function AccessoryRecommendationPanel({ accessory }: { accessory: AgentAccessoryRecommendationOutput }) {
  return <div className="recommendation-result">
    <div className="intent-strip"><span>配件需求</span><div><b>整机 · {accessory.intent.aircraft_model ?? "待确认"}</b>{accessory.intent.scenario && <b>场景 · {accessory.intent.scenario}</b>}{accessory.intent.budget_yuan && <b>预算 · ¥{accessory.intent.budget_yuan.toLocaleString("zh-CN")}</b>}</div></div>
    <div className={`recommendation-band ${accessory.result.primary_accessory_id ? "success" : "review"}`}><span>适配辅助结论</span><strong>{accessory.result.primary_accessory_name ?? "当前不形成首选"}</strong><p>{accessory.result.recommendation}</p></div>
    <section className="candidate-section"><header><strong>配件候选</strong><small>整机 · 接口 · 软件/固件 · 场景 · 预算 · 供应条件</small></header><div>{accessory.candidates.map((candidate, index) => <article className={candidate.eligible ? "eligible" : "ineligible"} key={candidate.id}>
      <div className="candidate-rank"><span>{String(index + 1).padStart(2, "0")}</span><b>{candidate.score}<small>/100</small></b></div>
      <div className="candidate-copy"><small>{candidate.id} · {candidate.connector}</small><strong>{candidate.name}</strong><p>{candidate.reasons.join("；") || "未满足当前主要条件"}</p><div><span>样例价 ¥{candidate.price_yuan.toLocaleString("zh-CN")}</span><span>库存 {candidate.stock}</span><span>交付 {candidate.delivery_days}天</span></div>{candidate.risks.length > 0 && <em>风险与待核对：{candidate.risks.join("；")}</em>}</div>
    </article>)}</div></section>
    {accessory.installation_guidance.requested && <div className="recommendation-gaps"><strong>安装步骤与专业复核</strong>{accessory.installation_guidance.steps.map((item, index) => <p key={item}>{index + 1}. {item}</p>)}{accessory.installation_guidance.cautions.map((item) => <p key={item}>! {item}</p>)}</div>}
    {[...accessory.combination_conflicts, ...accessory.warnings].length > 0 && <div className="recommendation-gaps"><strong>冲突与待确认事项</strong>{[...new Set([...accessory.combination_conflicts, ...accessory.warnings])].slice(0, 8).map((item) => <p key={item}>! {item}</p>)}</div>}
    <div className="manual-coverage"><span><b>{accessory.capability_coverage.length}</b>项需求功能已关联</span><p>结果置信度 {Math.round(accessory.confidence * 100)}% · 未执行采购或安装</p></div><p className="data-notice">{accessory.data_notice}</p>
  </div>;
}

function DeduplicationPanel({ deduplication }: { deduplication: AgentDeduplicationOutput }) {
  const labels = { unique: "未发现阈值内重复", possible_duplicate: "可能重复", high_similarity: "高度相似", insufficient_data: "材料不足" } as const;
  return <div className="recommendation-result">
    <div className="intent-strip"><span>查重范围</span><div><b>类型 · {deduplication.intent.content_type === "news" ? "资讯" : deduplication.intent.content_type === "tender" ? "标讯" : "社区帖子"}</b><b>样例库 · 跨来源比较</b></div></div>
    <div className={`recommendation-band ${deduplication.result.classification === "unique" ? "success" : "review"}`}><span>相似性结论</span><strong>{labels[deduplication.result.classification]}</strong><p>{deduplication.result.recommendation}</p></div>
    <section className="candidate-section"><header><strong>重复候选</strong><small>标题、正文、主题和内容类型综合线索</small></header><div>{deduplication.matches.map((match, index) => <article className={match.similarity >= 0.45 ? "ineligible" : "eligible"} key={match.id}>
      <div className="candidate-rank"><span>{String(index + 1).padStart(2, "0")}</span><b>{Math.round(match.similarity * 100)}<small>%</small></b></div>
      <div className="candidate-copy"><small>{match.id} · {match.version}</small><strong>{match.title}</strong><p>{match.signals.join("；") || "弱相似线索"}</p><div><span>{match.subject}</span><span>{match.region}</span><span>{match.published_at.slice(0, 10)}</span></div><em>{presentEvidenceLabel(match.source)}</em></div>
    </article>)}</div></section>
    {deduplication.warnings.length > 0 && <div className="recommendation-gaps"><strong>审核边界</strong>{deduplication.warnings.map((item) => <p key={item}>! {item}</p>)}</div>}
    <div className="manual-coverage"><span><b>{deduplication.capability_coverage.length}</b>项需求功能已关联</span><p>结果置信度 {Math.round(deduplication.confidence * 100)}% · 未执行删除、下架或抄袭认定</p></div><p className="data-notice">{deduplication.data_notice}</p>
  </div>;
}

function PolicyPanel({ policy }: { policy: AgentPolicyOutput }) {
  const statusLabels = { effective: "当前有效", upcoming: "待生效", expired: "已失效" } as const;
  const modeLabels = { policy_summary: "政策摘要", policy_qa: "依据问答", version_compare: "版本对比", applicability: "适用判断", business_impact: "影响分析", airworthiness: "适航咨询" } as const;
  const assessmentLabels = { matched: "条件匹配", not_matched: "暂不匹配", unknown: "信息待补" } as const;
  const evidenceStatusLabels = { sufficient: "证据充分", partial: "证据待补充", missing: "指定依据缺失", source_conflict: "来源对象冲突" } as const;
  const demonstrated = policy.capability_coverage.filter((item) => item.status === "mock-demonstrated").length;
  const currentDocument = policy.current_version ? policy.documents.find((document) => document.id === policy.current_version?.document_id) : undefined;
  const documentTypes = new Set(policy.intent.document_types);
  const citationTitle = documentTypes.has("standard") && !documentTypes.has("policy") ? "标准依据" : documentTypes.has("policy") && !documentTypes.has("standard") ? "政策依据" : "政策与标准依据";
  const requirementKindLabels = {
    registration: "实名登记", airspace_restriction: "空域限制", safety_responsibility: "安全责任",
    application_timing: "申请时限", application_materials: "申请材料", filing: "活动报备",
    record_retention: "记录保存", operational_safety: "运行安全", scope: "适用范围", other: "其他要求",
  } as const;
  const intentItems = [
    `模式 · ${modeLabels[policy.mode]}`,
    `时点 · ${policy.intent.as_of_date}`,
    ...policy.intent.subject_types.map((item) => `主体 · ${item}`),
    ...policy.intent.scenarios.map((item) => `场景 · ${item}`),
    ...policy.intent.topics.map((item) => `主题 · ${policyTopicLabels[item]}`),
    ...policy.intent.requested_locators.map((item) => `指定条款 · ${item}`),
  ];

  return (
    <div className="policy-result">
      <div className="intent-strip"><span>问题理解</span><div>{intentItems.map((item) => <b key={item}>{item}</b>)}</div></div>
      {policy.current_version && <div className="policy-current-band">
        <span>截至 {policy.current_version.as_of_date}</span>
        <div><small>{currentDocument ? presentEvidenceLabel(currentDocument.document_number) : "当前材料"}</small><strong>{policy.current_version.version}</strong><p>{policy.current_version.explanation}</p></div>
        <b className={`status-${policy.current_version.effective_status}`}>{statusLabels[policy.current_version.effective_status]}</b>
      </div>}
      <section className={`policy-evidence-status status-${policy.evidence_assessment.status}`}>
        <div><span>依据核对状态</span><strong>{evidenceStatusLabels[policy.evidence_assessment.status]}</strong></div>
        <p>{policy.evidence_assessment.explanation}</p>
        <small>来源范围：{policy.evidence_assessment.source_scope}</small>
        {policy.evidence_assessment.missing_referenced_locators.length > 0 && <small>尚缺被引用条款：{policy.evidence_assessment.missing_referenced_locators.join("、")}</small>}
      </section>
      <div className="manual-answer"><span>政策解读</span><p>{policy.answer}</p></div>

      <section className="policy-timeline">
        <header><strong>版本与材料状态</strong><small>按提问时点动态判断，不以最新发布日期替代当前有效版本</small></header>
        <div>{policy.documents.map((document) => (
          <article key={document.id} className={`status-${document.effective_status}`}>
            <span>{document.effective_from}</span><div><small>{presentEvidenceLabel(document.document_number)} · {document.source_type}</small><strong>{document.title}</strong><p>{document.issuer} · {document.jurisdiction}</p>{document.source_url && <a href={document.source_url} target="_blank" rel="noreferrer">查看发布原文 ↗</a>}</div><b>{statusLabels[document.effective_status]}</b>
          </article>
        ))}</div>
      </section>

      {policy.changes.length > 0 && <section className="policy-changes">
        <header><strong>新旧版本主要变化</strong><small>逐项保留新旧条款定位</small></header>
        <div>{policy.changes.map((change, index) => (
          <article key={change.id}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{policyChangeLabels[change.change_type]} · {change.topic}</small><strong>{change.explanation}</strong><p>{change.business_impact}</p><em>{change.old_source_ref} → {change.new_source_ref}</em></div></article>
        ))}</div>
      </section>}

      {policy.applicability.length > 0 && <section className="policy-applicability">
        <header><strong>适用条件拆解</strong><small>辅助判断，不替代主管部门或专业人员确认</small></header>
        <div>{policy.applicability.map((item) => (
          <article className={`assessment-${item.assessment}`} key={item.condition}><span>{assessmentLabels[item.assessment]}</span><strong>{item.condition}</strong><p>{item.explanation}</p><small>{item.source_ref}</small></article>
        ))}</div>
      </section>}

      {policy.requirement_items.length > 0 && <section className="policy-requirements">
        <header><strong>当前要求清单</strong><small>按主体、场景、期限和条款逐项整理</small></header>
        <div>{policy.requirement_items.map((item, index) => <article key={`${item.source_ref}-${index}`}>
          <span>{String(index + 1).padStart(2, "0")}</span><div><small>{requirementKindLabels[item.kind]} · {statusLabels[item.effective_status]}</small><strong>{item.title}</strong><p>{item.requirement}</p><em>{item.applies_to.join("、") || "适用主体待确认"}{item.scenarios.length ? ` · ${item.scenarios.join("、")}` : ""}{item.deadline ? ` · ${item.deadline}` : ""}</em><b>{item.source_ref}</b></div>
        </article>)}</div>
      </section>}

      {policy.verification_steps.length > 0 && <section className="policy-verification-steps">
        <header><strong>后续核对步骤</strong><small>区分内部资料核对与外部确认事项</small></header>
        <div>{policy.verification_steps.map((step) => <article key={`${step.order}-${step.action}`}>
          <span>{String(step.order).padStart(2, "0")}</span><div><strong>{step.action}</strong><p>{step.reason}</p><small>{step.source_ref}</small></div><b className={step.external_confirmation ? "external" : "internal"}>{step.external_confirmation ? "需外部确认" : "可内部核对"}</b>
        </article>)}</div>
      </section>}

      {policy.key_points.length > 0 && <section className="policy-key-points"><header><strong>条款要点</strong></header><div>{policy.key_points.map((item, index) => <p key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</p>)}</div></section>}
      {policy.claim_evidence.length > 0 && <section className="policy-claim-evidence"><header><strong>结论与依据逐项对应</strong><small>每项结论只绑定本次已核验条款</small></header><div>{policy.claim_evidence.map((item, index) => <article key={`${item.claim}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><p>{item.claim}</p>{item.source_refs.map((source) => <small key={source}>{source}</small>)}</div></article>)}</div></section>}
      <section className="manual-citations policy-citations"><header><strong>{citationTitle}</strong><small>文号 · 版本 · 条款 · 生效状态</small></header><div>{policy.citations.map((citation, index) => <article key={`${citation.document_id}-${citation.locator}`}><span>依据 {String(index + 1).padStart(2, "0")}</span><div><strong>{presentEvidenceLabel(citation.document_number)} · {citation.version} · {citation.locator} · {statusLabels[citation.effective_status]}</strong><p>{citation.excerpt}</p>{citation.source_url && <a href={citation.source_url} target="_blank" rel="noreferrer">查看发布原文 ↗</a>}</div></article>)}</div></section>
      {policy.review_items.length > 0 && <div className="policy-review-items"><strong>待核实与复核事项</strong>{policy.review_items.map((item) => <p key={item}>! {item}</p>)}</div>}
      <div className="manual-coverage"><span><b>{policy.capability_coverage.length}</b>项需求功能已关联</span><p>其中{demonstrated}项可在当前样例中运行，覆盖版本核验、条款引用、适用条件、办理核对步骤和交叉引用缺口；未收录的地方政策与专业材料不作推测。</p></div>
      <p className="data-notice">{policy.data_notice}</p>
    </div>
  );
}

function CustomerServicePanel({ customerService }: { customerService: AgentCustomerServiceOutput }) {
  const routeLabels = { knowledge_answer: "知识答复", business_data: "业务信息查询", specialist_agent: "专业能力协同", human_handoff: "人工协同", clarification: "补充信息" } as const;
  const domainLabels = { platform: "平台", product_mall: "产品商城", flight_service: "飞行服务", technical_service: "技术服务", commercial_service: "商业服务", unknown: "待识别" } as const;
  const issueLabels = { general_rule: "平台规则", product: "商品咨询", order: "订单问题", after_sales: "售后问题", service: "服务咨询", complaint: "投诉", finance: "投融资", credit: "信贷", analytics: "运营问数", violation: "违规风险", unknown: "待识别" } as const;
  const priorityLabels = { normal: "常规", high: "优先", urgent: "紧急" } as const;
  const specialistLabels = { "AG-001": "型号比较", "AG-012": "政策标准解读", "AG-027": "运营问数" } as const;
  const evidenceLabels = { sufficient: "证据充分", partial: "证据待补充", missing: "缺少直接依据" } as const;
  const coverageLabels = { complete: "问题已完整回答", partial: "问题仅部分回答", missing: "当前无法直接回答" } as const;
  const freshnessLabels = { current: "时效正常", stale: "数据已陈旧", unknown: "时效待核验" } as const;
  const anomalyLabels = { none: "未发现异常", potential: "存在潜在异常", confirmed: "已记录异常" } as const;
  const resolutionLabels = { resolved: "本轮答复完整", partially_resolved: "本轮部分答复", unresolved: "本轮尚未解决", requires_human: "需要人工继续处理" } as const;
  const feedbackLabels = { not_provided: "尚无用户反馈", positive: "用户反馈积极", negative: "用户反馈未解决", unclear: "用户反馈不明确" } as const;
  const guidanceCategoryLabels = { complaint: "投诉受理信息", finance: "投融资沟通准备", credit: "企业信贷申请准备" } as const;
  const checklistStatusLabels = { provided: "本轮已识别", missing: "建议补充", to_confirm: "需要核对" } as const;
  const riskLevelLabels = { none: "未发现预设风险", low: "低风险线索", medium: "一般风险线索", high: "优先复核", urgent: "紧急复核" } as const;
  const specialistId = customerService.intent.specialist_agent_id;
  const specialistLabel = specialistId ? specialistLabels[specialistId as keyof typeof specialistLabels] ?? "专业能力" : null;
  const demonstrated = customerService.capability_coverage.filter((item) => item.status === "mock-demonstrated").length;
  const intentItems = [
    `路径 · ${routeLabels[customerService.intent.route]}`,
    ...customerService.intent.domains.map((item) => `板块 · ${domainLabels[item]}`),
    ...customerService.intent.issue_types.map((item) => `问题 · ${issueLabels[item]}`),
    ...(specialistId ? [`协同 · ${specialistId} ${specialistLabel}`] : []),
    ...(customerService.intent.prior_context_used ? ["上下文 · 已复用前序会话"] : []),
  ];
  const complaint = customerService.intent.complaint_elements;
  const complaintItems = complaint ? [
    complaint.topic && `问题主题：${complaint.topic}`,
    complaint.related_object && `涉及对象：${complaint.related_object}`,
    complaint.occurred_at && `发生时间：${complaint.occurred_at}`,
    complaint.core_request && `核心诉求：${complaint.core_request}`,
  ].filter((item): item is string => Boolean(item)) : [];
  return (
    <div className="customer-service-result">
      <div className="intent-strip"><span>客服理解</span><div>{intentItems.map((item) => <b key={item}>{item}</b>)}</div></div>
      <div className="customer-answer"><span>{routeLabels[customerService.intent.route]}</span><p>{customerService.answer}</p></div>
      <section className={`customer-evidence evidence-${customerService.evidence_assessment.status}`}>
        <header><strong>{evidenceLabels[customerService.evidence_assessment.status]}</strong><b>{coverageLabels[customerService.answer_coverage.status]}</b></header>
        <p>{customerService.evidence_assessment.explanation}</p>
        <div><article><span>用户所问</span><strong>{customerService.answer_coverage.requested_questions.join("、") || "当前咨询问题"}</strong></article><article><span>已有回答</span><strong>{customerService.answer_coverage.answered_questions.join("、") || "暂无"}</strong></article><article><span>仍待核实</span><strong>{customerService.answer_coverage.unanswered_questions.join("、") || "无"}</strong></article></div>
      </section>
      <section className={`customer-resolution resolution-${customerService.resolution_assessment.status}`}>
        <header><strong>{resolutionLabels[customerService.resolution_assessment.status]}</strong><b>{feedbackLabels[customerService.resolution_assessment.user_feedback]}</b></header>
        <p>{customerService.resolution_assessment.explanation}</p>
        {customerService.resolution_assessment.unresolved_reason_codes.length > 0 && <div>{customerService.resolution_assessment.unresolved_reason_codes.map((item) => <span key={item}>{({ evidence_gap: "答复依据不足", stale_business_data: "业务资料已过时", missing_business_data: "缺少业务记录", missing_user_information: "用户信息待补充", specialist_review: "专业结果待复核", user_requested_human: "用户要求人工", complaint_handling: "投诉需人工承接", risk_review: "风险线索需复核", professional_judgment: "专业条件需确认" } as const)[item]}</span>)}</div>}
      </section>
      {customerService.order_assessment && <section className={`customer-order-assessment freshness-${customerService.order_assessment.freshness}`}>
        <header><div><span>订单资料时效</span><strong>{customerService.order_assessment.order_id}</strong></div><b>{freshnessLabels[customerService.order_assessment.freshness]}</b></header>
        <div><article><span>数据更新时间</span><strong>{customerService.order_assessment.data_updated_at}</strong></article><article><span>距查询时点</span><strong>{customerService.order_assessment.staleness_days === null ? "无法计算" : `${customerService.order_assessment.staleness_days} 天`}</strong></article><article><span>承诺时限</span><strong>{customerService.order_assessment.promised_deadline_available ? "已有记录" : "未提供"}</strong></article><article><span>异常判断</span><strong>{anomalyLabels[customerService.order_assessment.anomaly]}</strong></article></div>
        <p>{customerService.order_assessment.explanation}</p>
      </section>}
      {complaintItems.length > 0 && <section className="customer-tools"><header><strong>投诉要素理解</strong><small>主题 · 对象 · 时间 · 核心诉求</small></header><div>{complaintItems.map((item) => <article key={item}><span>已识别</span><p>{item}</p></article>)}</div></section>}
      {customerService.service_guidance && <section className="customer-guidance">
        <header><div><span>{guidanceCategoryLabels[customerService.service_guidance.category]}</span><strong>{customerService.service_guidance.stage}</strong></div><small>{customerService.service_guidance.summary}</small></header>
        <div>{customerService.service_guidance.checklist.map((item) => <article className={`checklist-${item.status}`} key={item.item}><span>{checklistStatusLabels[item.status]}</span><strong>{item.item}</strong><p>{item.explanation}</p><small>{item.source_ref}</small></article>)}</div>
        <p>{customerService.service_guidance.scope_notice}</p>
      </section>}
      {customerService.conversation.session_id && <section className="customer-knowledge"><header><strong>连续会话摘要</strong><small>{customerService.conversation.turn_count} 轮 · {customerService.conversation.prior_context_used ? "已结合前序信息" : "当前为独立问题"}</small></header><div><article><span>{String(customerService.conversation.turn_count).padStart(2, "0")}</span><div><strong>{customerService.conversation.user_problem_summary}</strong><p>持续保留已确认的关键信息，减少重复说明。</p></div></article></div></section>}
      {customerService.tool_results.length > 0 && <section className="customer-tools"><header><strong>资料查询与专业协同</strong><small>本次处理使用的资料和专业智能体结果</small></header><div>{customerService.tool_results.map((item) => <article className={`tool-${item.status}`} key={`${item.tool}-${item.label}`}><span>{item.tool === "agent_collaboration" ? "已调用" : item.status === "found" ? "已找到" : "未找到"}</span><strong>{item.label}</strong><p>{item.value}</p></article>)}</div></section>}
      {customerService.knowledge_matches.length > 0 && <section className="customer-knowledge"><header><strong>答复依据</strong><small>演示用知识与规则样例</small></header><div>{customerService.knowledge_matches.map((item, index) => <article key={item.id}><span>依据 {String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{item.excerpt}</p></div></article>)}</div></section>}
      {customerService.risk_review.review_required && <section className={`customer-risk risk-${customerService.risk_review.level}`}>
        <header><div><span>{riskLevelLabels[customerService.risk_review.level]}</span><strong>沟通风险线索</strong></div><b>{customerService.risk_review.repeated_signal ? "前序会话有同类线索" : "本轮首次识别"}</b></header>
        <p>{customerService.risk_review.context_summary}</p>
        <div>{customerService.risk_review.signals.map((item) => <article key={`${item.type}-${item.evidence_excerpt}`}><span>{item.label}</span><strong>{item.evidence_excerpt}</strong><p>{item.explanation}</p></article>)}</div>
        <footer>{customerService.risk_review.handling_recommendation}<b>仅提供风险线索，未作处置</b></footer>
      </section>}
      {customerService.handoff.required && <section className="handoff-card"><header><span>{priorityLabels[customerService.handoff.priority]}</span><strong>建议转接：{customerService.handoff.target_team}</strong><b>尚未执行</b></header><p>{customerService.handoff.reason}</p><div><article><strong>已确认信息</strong>{customerService.handoff.confirmed_information.length ? customerService.handoff.confirmed_information.map((item) => <span key={item}>{item}</span>) : <span>暂无已确认业务实体</span>}</article><article><strong>待处理事项</strong>{customerService.handoff.pending_items.map((item) => <span key={item}>{item}</span>)}</article><article><strong>接续依据</strong>{customerService.handoff.evidence_summary.map((item) => <span key={item}>{item}</span>)}</article></div>{customerService.handoff.suggested_reply && <aside><strong>人工答复建议</strong><p>{customerService.handoff.suggested_reply}</p></aside>}</section>}
      <div className="manual-coverage"><span><b>{customerService.capability_coverage.length}</b>项需求功能已关联</span><p>其中{demonstrated}项可在当前样例中运行，覆盖多类问题判断、业务答复和专业智能体协同；人工转接仍由业务系统执行。</p></div>
      <p className="data-notice">当前展示使用演示样例业务资料，不执行退款、转单、信用处理或人工转接等真实业务操作。</p>
    </div>
  );
}

function DataAnalysisPanel({ analysis }: { analysis: AgentDataAnalysisOutput }) {
  const formatValue = (value: number) => analysis.metric?.unit === "ratio"
    ? `${(value * 100).toFixed(1)}%`
    : analysis.metric?.unit === "CNY"
      ? `${value.toLocaleString("zh-CN")} 元`
      : value.toLocaleString("zh-CN");
  const qualityLabels = { passed: "质量校验通过", limited: "数据质量受限", failed: "数据质量未通过" } as const;
  const comparisonLabels = { none: "未设置", period_over_period: "环比/较前期", year_over_year: "同比" } as const;
  const chartMaximum = Math.max(1, ...(analysis.chart?.series.flatMap((series) => series.points.map((point) => point.value)) ?? [1]));
  return <div className="data-analysis-result">
    <section className="analysis-metric-band">
      <span>本次指标口径</span>
      <div><small>{analysis.metric?.metric_id ?? "指标待确认"} · {analysis.metric?.version ?? "—"} · {analysis.metric?.owner ?? "待确认责任方"}</small><strong>{analysis.metric?.name ?? "需要确认指标口径"}</strong><p>{analysis.metric?.definition ?? "存在多个同名指标，未自动选择口径。"}</p>{analysis.metric?.formula && <em>{analysis.metric.formula}</em>}</div>
      <b>{analysis.metric?.grain ?? "待确认"}</b>
    </section>
    <section className="analysis-scope-grid">
      <article><span>分析周期</span><strong>{analysis.query_scope.period}</strong></article>
      <article><span>比较方式</span><strong>{comparisonLabels[analysis.query_scope.comparison_mode]}{analysis.query_scope.baseline_period ? ` · ${analysis.query_scope.baseline_period}` : ""}</strong></article>
      <article><span>分析维度</span><strong>{analysis.query_scope.dimensions.join("、") || "汇总口径"}</strong></article>
      <article><span>数据截止</span><strong>{analysis.query_scope.data_cutoff}</strong></article>
    </section>
    {analysis.clarification && <section className="analysis-clarification"><strong>{analysis.clarification.message}</strong><div>{analysis.clarification.options.map((item) => <article key={item.metric_id}><span>{item.metric_id}</span><b>{item.label}</b><p>{item.definition}</p></article>)}</div></section>}
    <section className="analysis-query-plan"><header><strong>指标查询计划</strong><small>{analysis.query_plan.query_id} · {analysis.query_plan.status === "executed" ? "已执行" : analysis.query_plan.status === "blocked" ? "已停止" : "待确认"}</small></header><div>{analysis.query_plan.steps.map((step, index) => <article key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></article>)}</div></section>
    {analysis.chart && <section className="analysis-chart"><header><strong>{analysis.chart.title}</strong><small>{analysis.chart.type === "line" ? "趋势视图" : analysis.chart.type === "bar" ? "柱状视图" : "表格视图"} · 来源点位可追溯</small></header><div className="analysis-chart-legend">{analysis.chart.series.map((series) => <span key={series.name}>{series.name}</span>)}</div><div className="analysis-chart-series">{analysis.chart.series.map((series) => <article key={series.name}><b>{series.name}</b><div>{series.points.map((point) => <span key={`${series.name}-${point.label}`} title={`${point.label}：${formatValue(point.value)} · ${point.source_id}`}><i style={{ height: `${Math.max(8, point.value / chartMaximum * 100)}%` }} /><small>{point.label.replace("基准", "")}</small></span>)}</div></article>)}</div></section>}
    {analysis.comparison && <section className="analysis-comparison"><article><span>本期聚合值</span><strong>{formatValue(analysis.comparison.current_value)}</strong></article><article><span>对比基准</span><strong>{formatValue(analysis.comparison.baseline_value)}</strong></article><article><span>{analysis.comparison.label}变动</span><strong className={`direction-${analysis.comparison.direction}`}>{analysis.comparison.change_rate == null ? "不可计算" : `${analysis.comparison.change_rate >= 0 ? "+" : ""}${(analysis.comparison.change_rate * 100).toFixed(1)}%`}</strong></article></section>}
    {analysis.breakdown.length > 0 && <section className="analysis-breakdown"><header><strong>维度下钻</strong><small>{analysis.breakdown[0]?.dimension} · 贡献与变动</small></header><div>{analysis.breakdown.map((item) => <article key={`${item.dimension}-${item.value}`}><div><strong>{item.value}</strong><span>{formatValue(item.metric_value)}</span></div><p><i style={{ width: `${item.share * 100}%` }} /></p><small>贡献 {(item.share * 100).toFixed(1)}%{item.change_rate == null ? "" : ` · 较前期 ${item.change_rate >= 0 ? "+" : ""}${(item.change_rate * 100).toFixed(1)}%`}</small></article>)}</div></section>}
    {analysis.insights.length > 0 && <section className="analysis-insights"><header><strong>分析发现</strong><small>不将相关性表述为因果</small></header>{analysis.insights.map((item, index) => <p key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</p>)}</section>}
    {analysis.anomaly_signals.length > 0 && <section className="analysis-anomalies"><strong>异常线索</strong>{analysis.anomaly_signals.map((item) => <p key={item.label}>{item.label}：当前阈值 {formatValue(item.threshold)}（{item.threshold_version}）<small>{item.source_id}</small></p>)}</section>}
    {analysis.hypotheses_to_verify.length > 0 && <section className="analysis-hypotheses"><strong>待验证假设</strong>{analysis.hypotheses_to_verify.map((item) => <p key={item}>{item}</p>)}</section>}
    <section className={`analysis-quality quality-${analysis.quality.status}`}><div><span>{qualityLabels[analysis.quality.status]}</span><strong>完整率 {Math.round(analysis.quality.completeness_rate * 100)}% · 一致率 {Math.round(analysis.quality.consistency_rate * 100)}%</strong></div><p>{analysis.quality.row_count.toLocaleString("zh-CN")} 行 · 最新 {analysis.quality.freshness_at}</p></section>
    {analysis.lineage.length > 0 && <section className="analysis-lineage"><header><strong>指标来源关系</strong><small>指标口径 → 业务口径模型 → 汇总数据</small></header><div>{analysis.lineage.map((item, index) => <article key={item.asset_id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.asset_name}</strong><small>{({ metric: "指标口径", semantic: "业务口径模型", aggregate: "汇总数据", source: "来源数据" } as Record<string, string>)[item.layer] ?? item.layer} · {item.asset_id} · {item.version}</small></div></article>)}</div></section>}
    {analysis.next_questions.length > 0 && <section className="analysis-next"><strong>建议继续追问</strong><div>{analysis.next_questions.map((item) => <span key={item}>{item}</span>)}</div></section>}
    {analysis.warnings.length > 0 && <section className="analysis-warnings"><strong>使用边界</strong>{analysis.warnings.map((item) => <p key={item}>{item}</p>)}</section>}
    <section className="analysis-conversation"><span>连续分析记录</span><strong>{analysis.conversation.turn_count} 轮 · {analysis.conversation.prior_context_used ? "已沿用前序口径与范围" : "独立问题"}</strong><small>结果置信度 {Math.round(analysis.confidence * 100)}% · {analysis.conversation.context_summary}</small></section>
    <p className="data-notice">{analysis.data_notice}</p>
  </div>;
}

export default function AgentExperience() {
  const [selectedId, setSelectedId] = useState<AgentId>(SHOWCASE_AGENTS[0].id);
  const [input, setInput] = useState(SHOWCASE_AGENTS[0].prompts[0]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Awaited<ReturnType<typeof invokeAgent>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DemoHistoryItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const selected = useMemo(() => SHOWCASE_AGENTS.find((agent) => agent.id === selectedId) ?? SHOWCASE_AGENTS[0], [selectedId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setHistory(loadDemoHistory());
      setSessionId(getOrCreateSessionId());
    });
    return () => {
      cancelAnimationFrame(frame);
      activeController.current?.abort();
    };
  }, []);

  function chooseAgent(agent: AgentDefinition) {
    requestSequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setSelectedId(agent.id);
    setInput(agent.prompts[0]);
    setResponse(null);
    setError(null);
    setLoading(false);
  }

  async function runAgent(event?: FormEvent) {
    event?.preventDefault();
    if (!input.trim() || loading) return;
    setLoading(true);
    setResponse(null);
    setError(null);
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const selectedAtStart = selected;
    try {
      const result = await invokeAgent({
        agent_id: selectedAtStart.id,
        input: input.trim(),
        session_id: sessionId || getOrCreateSessionId(),
        context: undefined,
      }, { signal: controller.signal });
      if (requestSequence.current !== sequence || result.agent_id !== selectedAtStart.id) return;
      setResponse(result);
      if (selectedAtStart.id === "AG-001" && result.output.comparison) {
        const item: DemoHistoryItem = {
          requestId: result.request_id,
          input: input.trim(),
          summary: result.output.comparison.recommendation.primary_product_name ?? "条件冲突，未形成推荐",
          createdAt: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        };
        setHistory((current) => {
          const next = [item, ...current.filter((entry) => entry.input !== item.input)].slice(0, 5);
          persistDemoHistory(next);
          return next;
        });
      }
    }
    catch (caught) {
      if (requestSequence.current !== sequence || controller.signal.aborted) return;
      const message = caught instanceof AgentGatewayError && caught.code === "DEPENDENCY_UNAVAILABLE"
        ? "依赖服务暂时不可用，请稍后重试。"
        : "当前服务暂时无法完成处理，请稍后重试或更换体验问题。";
      setError(message);
    }
    finally {
      if (requestSequence.current === sequence) {
        activeController.current = null;
        setLoading(false);
      }
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!input.trim() || loading) return;
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <main className="experience-page">
      <header className="site-header experience-header">
        <Link className="brand" href="/" aria-label="返回项目介绍">
          <span className="brand-seal">JDZ</span>
          <span><strong>景德镇低空商业服务网</strong><small>业务智能体场景体验</small></span>
        </Link>
        <nav aria-label="体验页导航"><Link href="/">项目介绍</Link><a href="#workbench">样例体验</a><Link href="/knowledge-admin">知识管理</Link><Link href="/evaluation-center">质量评测</Link><a href="#experience-boundary">使用说明</a></nav>
        <div className="environment-pill"><i /> 样例环境</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>业务智能体场景体验</span></div>
          <h1>四类重点业务场景，<br /><em>查看问题如何处理、结论依据何在。</em></h1>
          <p className="hero-lead">涵盖经营问数、政策与文档查询、客户服务，以及多条件下的产品比较与推荐。</p>
          <p className="hero-note">当前为演示环境：政策样例含1项国务院官网公开条例摘录；其他产品、指标、政策版本、订单和业务信息均为虚构数据。</p>
          <div className="hero-actions">
            <a className="primary-button" href="#workbench">开始体验 <span>→</span></a>
            <a className="text-button" href="#agents">查看场景说明 <span>↓</span></a>
          </div>
          <div className="stats-row">{capabilityStats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
        </div>

        <div className="project-brief" aria-label="样例建设概况">
          <div className="brief-head"><span>当前建设成果</span><b><i />4个样例可运行</b></div>
          <div className="brief-body">
            <div className="brief-row owned"><span>01</span><div><small>当前成果</small><strong>4个可运行工程样例</strong><p>覆盖经营问数、政策解读、客户服务和产品型号决策</p></div><b>可体验</b></div>
            <div className="brief-row"><span>02</span><div><small>共用规范</small><strong>输入、结果和复核方式保持一致</strong><p>统一记录问题、处理过程、引用依据和需要复核的事项</p></div><b>已应用</b></div>
            <div className="brief-row"><span>03</span><div><small>总体范围</small><strong>28个业务智能体</strong><p>其余业务智能体根据后续研发计划分批建设</p></div><b>规划中</b></div>
          </div>
          <div className="brief-foot"><span>展示内容</span><strong>业务用途 · 结果依据 · 适用范围</strong><p>说明每个业务智能体解决的问题、采用的依据以及需要人工确认的事项。</p></div>
        </div>
      </section>

      <section className="agents-section" id="agents">
        <div className="section-heading"><div><span>场景样例</span><h2>当前可体验的四类业务场景</h2></div><p>分别用于经营问数、政策解读、客户服务和型号比较。</p></div>
        <div className="agent-grid">
          {SHOWCASE_AGENTS.map((agent, index) => (
            <article className={`agent-card tone-${agent.tone}`} key={agent.id}>
              <div className="card-top"><span>场景 {String(index + 1).padStart(2, "0")}</span><i>{agent.availability === "runnable" ? "可体验" : "功能说明"}</i></div>
              <div className="agent-card-head"><AgentMark agent={agent} /><div><span className="agent-id">{agent.id}</span><h3>{agent.name}</h3></div></div>
              <p>{agent.description}</p>
              <dl className="agent-facts">
                <div><dt>适用场景</dt><dd>{agentPresentation[agent.id].scene}</dd></div>
                <div><dt>主要输入</dt><dd>{agentPresentation[agent.id].input}</dd></div>
                <div><dt>输出结果</dt><dd>{agentPresentation[agent.id].output}</dd></div>
              </dl>
              <div className="capability-line"><span>主要内容</span><p>{agent.capabilities.join("、")}</p></div>
              <button type="button" onClick={() => { chooseAgent(agent); location.hash = "workbench"; }}>进入体验 <span>→</span></button>
            </article>
          ))}
        </div>
      </section>

      <section className="workbench-section experience-workbench-section" id="workbench">
        <div className="experience-page-title"><div><span>业务场景体验</span><h1>选择场景，提交一个实际问题</h1></div><p>当前提供4个样例，可查看问题处理过程、结果、引用依据和复核事项。</p></div>
        <div className="workbench-shell">
          <aside className="agent-sidebar">
            <div className="panel-title"><span>选择场景</span><b>{runnableCount}个可体验</b></div>
            {SHOWCASE_AGENTS.map((agent) => (
              <button type="button" key={agent.id} onClick={() => chooseAgent(agent)} className={selected.id === agent.id ? "active" : ""} aria-label={`选择 ${agent.id} ${agent.shortName}`}>
                <AgentMark agent={agent} compact /><span><small>{agent.id}</small><strong>{agent.shortName}</strong></span><i />
              </button>
            ))}
            <div className="sidebar-foot"><span>使用方式</span><strong>输入问题，查看结果与依据</strong></div>
          </aside>

          <div className="conversation-panel">
            <div className="conversation-head"><div><AgentMark agent={selected} compact /><span><small>{selected.id}</small><strong>{selected.name}</strong></span></div><span className="mock-badge">{selected.availability === "runnable" ? "样例运行 · 演示数据" : "功能说明"}</span></div>
            <div className="conversation-body">
              <div className="welcome-copy"><span className={`mini-symbol tone-${selected.tone}`}>{selected.symbol}</span><h3>{selected.welcome}</h3><p>{selected.demoHint}</p></div>
              {!response && !loading && knowledgePresentation[selected.id] && <div className="formal-knowledge-chip"><span>{knowledgePresentation[selected.id].label}</span><strong>{knowledgePresentation[selected.id].title}</strong><small>{knowledgePresentation[selected.id].detail}</small></div>}
              {selected.id === "AG-012" && !response && !loading && <div className="policy-source-chip"><span>公开资料与版本示例</span><strong>1 项国务院条例摘录 · 2 个虚构政策版本 · 1 份虚构标准</strong><small>公开条例标明发布来源；虚构材料仅用于演示版本比较</small></div>}
              {selected.id === "AG-027" && !response && !loading && <div className="recommendation-source-chip"><span>演示指标资料</span><strong>4项指标口径 · 两个对比周期 · 维度汇总 · 指标来源关系</strong><small>支持连续问数、查询计划、趋势对比、维度分析、质量检查和原因线索分析</small></div>}
              {selected.id === "AG-025" && !response && !loading && <div className="customer-service-source-chip"><span>演示用业务资料</span><strong>13 条 FAQ · 2 个订单 · 2 个商品 · 3 项服务</strong><small>用于展示咨询理解、业务答复、风险线索整理与人工接续建议</small></div>}
              {!response && !loading && <div className="prompt-list"><span>建议体验问题</span>{selected.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => setInput(prompt)}>{prompt}<i>选择</i></button>)}</div>}
              {loading && <div className="thinking-card"><div className="thinking-head"><span className="loading-dots"><i /><i /><i /></span> 正在处理问题</div><div className="loading-line"><span /></div><p>请稍候，完成后将展示处理结果、引用依据和适用说明。</p></div>}
              {error && <div className="error-card"><strong>运行未完成</strong><p>{error}</p></div>}
              {response && (
                <div className="result-card">
                  <div className="result-kicker"><span>{response.status === "preview" ? "功能说明" : response.status === "needs_review" ? "处理结果 · 待复核" : response.status === "needs_clarification" ? "需要补充信息" : "处理结果"}</span><b>结果编号 {response.request_id}</b></div><h3>{response.output.title}</h3><p>{response.output.summary}</p>
                  <ReviewRequestPanel response={response} />
                  <ActualExecutionPanel response={response} />
                  {response.output.comparison ? <ComparisonPanel comparison={response.output.comparison} /> : response.output.manual ? <ManualPanel manual={response.output.manual} /> : response.output.recommendation ? <RecommendationPanel recommendation={response.output.recommendation} /> : response.output.accessory_recommendation ? <AccessoryRecommendationPanel accessory={response.output.accessory_recommendation} /> : response.output.quote_comparison ? <QuoteComparisonPanel quoteComparison={response.output.quote_comparison} /> : response.output.learning_recommendation ? <LearningRecommendationPanel learning={response.output.learning_recommendation} /> : response.output.policy ? <PolicyPanel policy={response.output.policy} /> : response.output.deduplication ? <DeduplicationPanel deduplication={response.output.deduplication} /> : response.output.customer_service ? <CustomerServicePanel customerService={response.output.customer_service} /> : response.output.data_analysis ? <DataAnalysisPanel analysis={response.output.data_analysis} /> : <div className="result-points">{response.output.points.map((point, index) => <div key={point}><span>{String(index + 1).padStart(2, "0")}</span><p>{point}</p></div>)}</div>}
                  <RagEvidencePanel rag={extractRagRuntime(response.output)} />
                  <div className="evidence-row"><span>依据</span>{presentEvidenceLabels(response.output.evidence).map((item) => <b key={item}>{item}</b>)}</div>
                  <small>本结果依据当前演示资料生成，仅供样例验证，不作为正式业务结论。</small>
                </div>
              )}
              {selected.id === "AG-001" && history.length > 0 && (
                <div className="comparison-history">
                  <header><div><strong>本地演示记录</strong><small>仅保存在当前浏览器，可点击复用</small></div><button type="button" onClick={() => { clearDemoHistory(); setHistory([]); }}>清空</button></header>
                  <div>{history.map((item) => (
                    <button type="button" key={item.requestId} onClick={() => { setInput(item.input); setResponse(null); setError(null); }}>
                      <span><strong>{item.summary}</strong><small>{item.input}</small></span><time>{item.createdAt}</time>
                    </button>
                  ))}</div>
                </div>
              )}
            </div>
            <form className="composer" onSubmit={runAgent}>
              <button type="button" className="attach-button" title="演示阶段使用预置样例材料，暂不接收文件上传" aria-label="样例材料上传暂未开放" disabled>＋</button>
              <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleComposerKeyDown} aria-label="输入业务问题" placeholder="输入一个业务问题…" />
              <button type="submit" className="send-button" disabled={loading || !input.trim()} aria-label="运行样例">运行</button>
              <div className="composer-meta"><span>按 Enter 运行</span><b>样例服务可用</b></div>
            </form>
          </div>

          <LiveTracePanel agent={selected} response={response} loading={loading} />
        </div>
      </section>

      <section className="architecture-section" id="architecture">
        <div className="architecture-copy"><span>共用建设规范</span><h2>四个样例采用一致的处理和复核方式</h2><p>各业务智能体通过统一接口使用模型、知识资料和业务数据，并按统一格式返回结果、引用依据和复核事项。</p><div className="contract-chips"><span>统一输入</span><span>结果格式</span><span>处理记录</span><span>依据编号</span></div></div>
        <div className="architecture-map">
          <div className="layer"><small>使用入口</small><strong>业务场景体验</strong><span>问题输入、结果呈现和本地体验记录</span></div><i>↓</i>
          <div className="layer accent"><small>业务处理</small><strong>问题理解、辅助分析与结果说明</strong><span>问题理解 · 条件判断 · 内容整理 · 依据说明 · 复核提示</span></div><i>↓</i>
          <div className="adapter-row"><div className="layer"><small>AI能力接口</small><strong>模型与知识服务</strong><span>语言理解、知识检索、文档识别、多模态和工具调用</span></div><div className="layer"><small>业务信息接口</small><strong>数据与业务服务</strong><span>业务数据、文档材料、政策信息、流程状态和执行结果</span></div></div>
        </div>
      </section>

      <section className="experience-boundary" id="experience-boundary"><strong>使用说明</strong><p>当前体验主要使用虚构样例数据，用于核对业务问题的处理方式、资料引用和结果说明。页面结果不会触发发布、交易、审批、调度、处罚或其他正式业务操作。</p></section>
      <footer><div className="brand"><span className="brand-seal">JDZ</span><span><strong>景德镇低空商业服务网</strong><small>业务智能体场景体验</small></span></div><p>4个业务智能体样例 · 经营问数 · 政策解读 · 客户服务 · 产品决策</p><span>样例环境 · 虚构数据 · 结果仅供展示验证</span></footer>
    </main>
  );
}
