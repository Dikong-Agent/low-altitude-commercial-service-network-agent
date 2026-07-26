"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AGENTS } from "./lib/agent-registry";
import type { AgentComparisonOutput, AgentCustomerServiceOutput, AgentDefinition, AgentId, AgentManualOutput, AgentPolicyOutput, AgentRecommendationOutput } from "./lib/contracts";
import { AgentGatewayError, invokeAgent } from "./lib/agent-gateway";

const capabilityStats = [
  { value: "05", label: "可运行 Agent" },
  { value: "178", label: "已映射能力点" },
  { value: "05", label: "服务端适配端口" },
];

const runnableCount = AGENTS.filter((agent) => agent.availability === "runnable").length;

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

function ComparisonPanel({ comparison }: { comparison: AgentComparisonOutput }) {
  const [tableView, setTableView] = useState<"horizontal" | "vertical">("horizontal");
  const productById = new Map(comparison.products.map((product) => [product.id, product]));
  const intentItems = [
    ...(comparison.intent.use_cases.length
      ? comparison.intent.use_cases.map((useCase) => `场景 · ${useCase}`)
      : comparison.intent.use_case ? [`场景 · ${comparison.intent.use_case}`] : []),
    comparison.intent.budget_yuan ? `预算 · ${Math.round(comparison.intent.budget_yuan / 10000)}万元` : null,
    ...comparison.intent.focus_dimensions.map((item) => `关注 · ${item}`),
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="comparison-result">
      <div className="intent-strip">
        <span>识别条件</span>
        <div>{intentItems.length ? intentItems.map((item) => <b key={item}>{item}</b>) : <b>通用型号比较</b>}</div>
      </div>

      <div className={`recommendation-band ${comparison.recommendation.primary_product_id ? "success" : "review"}`}>
        <span>{comparison.recommendation.primary_product_id ? "首选建议" : "约束结论"}</span>
        <strong>{comparison.recommendation.primary_product_name ?? "当前无满足全部条件的候选"}</strong>
        <p>{comparison.recommendation.reason}</p>
      </div>

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
                    {value?.display ?? "未提供"}{isBest && <small>优势项</small>}
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
                  return <p key={row.key}><span>{row.label}</span><b className={row.best_product_ids.includes(product.id) ? "best" : ""}>{value?.display ?? "未提供"}</b></p>;
                })}</div>
              </article>
            ))}
          </div>
        )}
      </>}

      <div className="product-evaluations">
        {comparison.products.map((product) => (
          <article key={product.id} className={product.eligible ? "eligible" : "ineligible"}>
            <header><div><small>{product.id}</small><strong>{product.name}</strong></div><b>{product.score}<small>/100 · {product.eligible ? "可推荐" : "未通过硬约束"}</small></b></header>
            <p>{product.scenario_fit}</p>
            <div className="evaluation-columns">
              <div><span>优势</span>{product.advantages.length ? product.advantages.map((item) => <p key={item}>＋ {item}</p>) : <p>暂无明显优势项</p>}</div>
              <div><span>限制</span>{product.limitations.length ? product.limitations.map((item) => <p key={item}>－ {item}</p>) : <p>未发现硬约束冲突</p>}</div>
            </div>
          </article>
        ))}
      </div>

      {comparison.conflicts.length > 0 && <div className="conflict-box"><strong>条件冲突</strong>{comparison.conflicts.map((item) => <p key={item}>! {item}</p>)}</div>}
      <p className="data-notice">{comparison.data_notice}</p>
      <span className="engine-label">ENGINE · {comparison.engine.toUpperCase()} · {productById.size} PRODUCTS</span>
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
          {manual.intent.topics.map((topic) => <b key={topic}>主题 · {topic}</b>)}
          {manual.intent.scenarios.map((scenario) => <b key={scenario}>场景 · {scenario}</b>)}
          {manual.intent.terms.map((term) => <b key={term}>术语 · {term}</b>)}
        </div>
      </div>

      <div className="manual-answer"><span>通俗解读</span><p>{manual.answer}</p></div>

      {manual.steps.length > 0 && <section className="manual-steps">
        <header><strong>场景化操作指引</strong><small>按说明书原有条件与先后关系整理</small></header>
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

      {manual.glossary.length > 0 && <section className="manual-glossary"><header><strong>专业术语通俗化</strong></header><div>{manual.glossary.map((item) => <article key={item.term}><b>{item.term}</b><p>{item.plain_explanation}</p><small>{item.source_ref}</small></article>)}</div></section>}

      <section className="manual-citations">
        <header><strong>原文定位</strong><small>相关度按样例文档语义检索结果展示</small></header>
        <div>{manual.citations.map((citation) => <article key={citation.section_id}><span>{Math.round(citation.relevance * 100)}%</span><div><strong>{citation.location}</strong><p>{citation.excerpt}</p></div></article>)}</div>
      </section>

      <div className="manual-coverage"><span><b>{manual.capability_coverage.length}</b>项现行能力已对齐</span><p>场景语义检索、图示含义解读和章节图表关系理解等待正式 AI 中台适配；当前仅演示规则检索与预解析样例文档。</p></div>
      <p className="data-notice">{manual.data_notice}</p>
      <span className="engine-label">ENGINE · {manual.engine.toUpperCase()} · {manual.rule_version}</span>
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
      <div className="intent-strip"><span>导购理解</span><div>{intentItems.map((item) => <b key={item}>{item}</b>)}</div></div>
      {recommendation.intent.corrected_terms.length > 0 && <div className="correction-note"><span>搜索词纠错</span>{recommendation.intent.corrected_terms.map((item) => <b key={item.from}>{item.from} → {item.to}</b>)}</div>}
      <div className={`recommendation-band ${recommendation.recommendation.primary_id ? "success" : "review"}`}>
        <span>{recommendation.recommendation.primary_id ? "首选建议" : "约束结论"}</span>
        <strong>{recommendation.recommendation.primary_name ?? "当前无满足全部条件的候选"}</strong>
        <p>{recommendation.recommendation.reason}</p>
      </div>
      <section className="candidate-section">
        <header><strong>{recommendation.mode === "scenario_solution" ? "场景方案候选" : "商品候选"}</strong><small>先执行硬条件，再按相关性排序</small></header>
        <div>{candidates.map((candidate, index) => (
          <article className={candidate.eligible ? "eligible" : "ineligible"} key={candidate.id}>
            <div className="candidate-rank"><span>0{index + 1}</span><b>{candidate.score}<small>/100</small></b></div>
            <div className="candidate-copy"><small>{candidate.id} · {candidate.category}{recommendation.intent.requested_product_ids.length ? ` · ${candidate.request_match ? "目标匹配" : "替代候选"}` : ""}</small><strong>{candidate.name}</strong><p>{candidate.reason}</p>
              <div>{candidate.matched_tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <p className="condition-assessment">{candidate.condition_assessment}</p>
              {candidate.suitable_conditions.length > 0 && <p className="suitable-conditions">适用条件：{candidate.suitable_conditions.join("；")}</p>}
              <em>样例价 ¥{candidate.price_yuan.toLocaleString("zh-CN")} · {candidate.eligible ? "通过硬条件与适用条件" : "未通过当前条件"}</em>
            </div>
          </article>
        ))}</div>
      </section>
      {[...new Set([...recommendation.gaps, ...recommendation.missing_data])].length > 0 && <div className="recommendation-gaps"><strong>差距与待确认事项</strong>{[...new Set([...recommendation.gaps, ...recommendation.missing_data])].slice(0, 6).map((item) => <p key={item}>! {item}</p>)}</div>}
      <div className="manual-coverage"><span><b>{recommendation.capability_coverage.length}</b>项现行能力已对齐</span><p>{demonstrated}项使用 Mock 目录演示；其余图片找货与 C2C 个性化能力仅预留正式 AI 中台和业务数据适配接口。</p></div>
      <p className="data-notice">{recommendation.data_notice}</p>
      <span className="engine-label">ENGINE · {recommendation.engine.toUpperCase()} · {recommendation.rule_version}</span>
    </div>
  );
}

function PolicyPanel({ policy }: { policy: AgentPolicyOutput }) {
  const statusLabels = { effective: "当前有效", upcoming: "待生效", expired: "已失效" } as const;
  const modeLabels = { policy_summary: "政策摘要", policy_qa: "依据问答", version_compare: "版本对比", applicability: "适用判断", business_impact: "影响分析", airworthiness: "适航咨询" } as const;
  const assessmentLabels = { matched: "条件匹配", not_matched: "暂不匹配", unknown: "信息待补" } as const;
  const demonstrated = policy.capability_coverage.filter((item) => item.status === "mock-demonstrated").length;
  const intentItems = [
    `模式 · ${modeLabels[policy.mode]}`,
    `时点 · ${policy.intent.as_of_date}`,
    ...policy.intent.subject_types.map((item) => `主体 · ${item}`),
    ...policy.intent.scenarios.map((item) => `场景 · ${item}`),
    ...policy.intent.topics.map((item) => `主题 · ${item}`),
  ];

  return (
    <div className="policy-result">
      <div className="intent-strip"><span>问题理解</span><div>{intentItems.map((item) => <b key={item}>{item}</b>)}</div></div>
      {policy.current_version && <div className="policy-current-band">
        <span>截至 {policy.current_version.as_of_date}</span>
        <div><small>{policy.current_version.document_id}</small><strong>{policy.current_version.version}</strong><p>{policy.current_version.explanation}</p></div>
        <b className={`status-${policy.current_version.effective_status}`}>{statusLabels[policy.current_version.effective_status]}</b>
      </div>}
      <div className="manual-answer"><span>政策解读</span><p>{policy.answer}</p></div>

      <section className="policy-timeline">
        <header><strong>版本与材料状态</strong><small>按提问时点动态判断，不以最新发布日期替代当前有效版本</small></header>
        <div>{policy.documents.map((document) => (
          <article key={document.id} className={`status-${document.effective_status}`}>
            <span>{document.effective_from}</span><div><small>{document.document_number} · {document.source_type}</small><strong>{document.title}</strong><p>{document.issuer} · {document.jurisdiction}</p></div><b>{statusLabels[document.effective_status]}</b>
          </article>
        ))}</div>
      </section>

      {policy.changes.length > 0 && <section className="policy-changes">
        <header><strong>新旧版本主要变化</strong><small>逐项保留新旧条款定位</small></header>
        <div>{policy.changes.map((change, index) => (
          <article key={change.id}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{change.change_type.toUpperCase()} · {change.topic}</small><strong>{change.explanation}</strong><p>{change.business_impact}</p><em>{change.old_source_ref} → {change.new_source_ref}</em></div></article>
        ))}</div>
      </section>}

      {policy.applicability.length > 0 && <section className="policy-applicability">
        <header><strong>适用条件拆解</strong><small>辅助判断，不替代主管部门或专业人员确认</small></header>
        <div>{policy.applicability.map((item) => (
          <article className={`assessment-${item.assessment}`} key={item.condition}><span>{assessmentLabels[item.assessment]}</span><strong>{item.condition}</strong><p>{item.explanation}</p><small>{item.source_ref}</small></article>
        ))}</div>
      </section>}

      {policy.key_points.length > 0 && <section className="policy-key-points"><header><strong>条款要点</strong></header><div>{policy.key_points.map((item, index) => <p key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</p>)}</div></section>}
      <section className="manual-citations policy-citations"><header><strong>政策依据</strong><small>文号 · 版本 · 条款 · 生效状态</small></header><div>{policy.citations.map((citation) => <article key={`${citation.document_id}-${citation.locator}`}><span>{Math.round(citation.relevance * 100)}%</span><div><strong>{citation.document_number} · {citation.version} · {citation.locator} · {statusLabels[citation.effective_status]}</strong><p>{citation.excerpt}</p></div></article>)}</div></section>
      {policy.review_items.length > 0 && <div className="policy-review-items"><strong>待核实与复核事项</strong>{policy.review_items.map((item) => <p key={item}>! {item}</p>)}</div>}
      <div className="manual-coverage"><span><b>{policy.capability_coverage.length}</b>项现行能力已对齐</span><p>{demonstrated}项以虚构政策和标准样例演示；适航咨询与内容生成能力保留正式权威资料、AI 中台和专业复核适配边界。</p></div>
      <p className="data-notice">{policy.data_notice}</p>
      <span className="engine-label">ENGINE · {policy.engine.toUpperCase()} · {policy.rule_version}</span>
    </div>
  );
}

function CustomerServicePanel({ customerService }: { customerService: AgentCustomerServiceOutput }) {
  const routeLabels = { knowledge_answer: "知识答复", business_data: "业务数据查询", specialist_agent: "专业 Agent 路由", human_handoff: "人工协同", clarification: "补充信息" } as const;
  const domainLabels = { platform: "平台", product_mall: "产品商城", flight_service: "飞行服务", technical_service: "技术服务", commercial_service: "商业服务", unknown: "待识别" } as const;
  const issueLabels = { general_rule: "平台规则", product: "商品咨询", order: "订单问题", after_sales: "售后问题", service: "服务咨询", complaint: "投诉", finance: "投融资", credit: "信贷", analytics: "运营问数", violation: "违规风险", unknown: "待识别" } as const;
  const demonstrated = customerService.capability_coverage.filter((item) => item.status === "mock-demonstrated").length;
  const intentItems = [
    `路径 · ${routeLabels[customerService.intent.route]}`,
    `置信度 · ${Math.round(customerService.intent.confidence * 100)}%`,
    ...customerService.intent.domains.map((item) => `板块 · ${domainLabels[item]}`),
    ...customerService.intent.issue_types.map((item) => `问题 · ${issueLabels[item]}`),
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
      {complaintItems.length > 0 && <section className="customer-tools"><header><strong>投诉要素理解</strong><small>主题 · 对象 · 时间 · 核心诉求</small></header><div>{complaintItems.map((item) => <article key={item}><span>已识别</span><p>{item}</p></article>)}</div></section>}
      {customerService.conversation.session_id && <section className="customer-knowledge"><header><strong>会话上下文摘要</strong><small>{customerService.conversation.turn_count} 轮 · {customerService.conversation.prior_context_used ? "本轮已复用前序信息" : "本轮未复用前序实体"}</small></header><div><article><span>{String(customerService.conversation.turn_count).padStart(2, "0")}</span><div><strong>{customerService.conversation.user_problem_summary}</strong><p>{customerService.conversation.processing_trace_summary}</p></div></article></div></section>}
      {customerService.tool_results.length > 0 && <section className="customer-tools"><header><strong>业务工具结果</strong><small>只按明确实体查询，不扩展读取其他记录</small></header><div>{customerService.tool_results.map((item) => <article className={`tool-${item.status}`} key={`${item.tool}-${item.label}`}><span>{item.status === "found" ? "已找到" : "未找到"}</span><strong>{item.label}</strong><p>{item.value}</p><small>{item.source_ref}</small></article>)}</div></section>}
      {customerService.knowledge_matches.length > 0 && <section className="customer-knowledge"><header><strong>答复依据</strong><small>虚构 FAQ 与规则样例</small></header><div>{customerService.knowledge_matches.map((item) => <article key={item.id}><span>{Math.round(item.relevance * 100)}%</span><div><strong>{item.title}</strong><p>{item.excerpt}</p><small>{item.source_ref}</small></div></article>)}</div></section>}
      {customerService.handoff.required && <section className="handoff-card"><header><span>{customerService.handoff.priority.toUpperCase()}</span><strong>建议转接：{customerService.handoff.target_team}</strong><b>尚未执行</b></header><p>{customerService.handoff.reason}</p><div><article><strong>已确认信息</strong>{customerService.handoff.confirmed_information.length ? customerService.handoff.confirmed_information.map((item) => <span key={item}>{item}</span>) : <span>暂无已确认业务实体</span>}</article><article><strong>待处理事项</strong>{customerService.handoff.pending_items.map((item) => <span key={item}>{item}</span>)}</article></div></section>}
      <div className="manual-coverage"><span><b>{customerService.capability_coverage.length}</b>项现行能力已对齐</span><p>{demonstrated}项使用虚构 FAQ、订单、商品和服务资料演示；高风险判断、跨板块协同、运营问数及真实转接保留正式 AI 中台和业务系统适配边界。</p></div>
      <p className="data-notice">{customerService.data_notice}</p>
      <span className="engine-label">ENGINE · {customerService.engine.toUpperCase()} · {customerService.rule_version}</span>
    </div>
  );
}

export default function Home() {
  const [selectedId, setSelectedId] = useState<AgentId>("AG-001");
  const [input, setInput] = useState(AGENTS[0].prompts[0]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Awaited<ReturnType<typeof invokeAgent>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DemoHistoryItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const selected = useMemo(() => AGENTS.find((agent) => agent.id === selectedId) ?? AGENTS[0], [selectedId]);

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
        context: selectedAtStart.id === "AG-002" ? { document_id: "DEMO-MANUAL-X8" } : undefined,
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
        ? "Agent 依赖服务暂时不可用，请稍后重试。"
        : "Agent 暂时无法完成本次运行，请稍后重试或更换演示问题。";
      setError(message);
    }
    finally {
      if (requestSequence.current === sequence) {
        activeController.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="返回首页">
          <span className="brand-seal">JDZ</span>
          <span><strong>景德镇低空商业服务网</strong><small>AI AGENT LAB</small></span>
        </a>
        <nav aria-label="主导航"><a href="#agents">标杆能力</a><a href="#workbench">演示工作台</a><a href="#architecture">接口架构</a></nav>
        <div className="environment-pill"><i /> 演示环境</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>01</span> AI AGENT BENCHMARK</div>
          <h1>让每一个业务场景，<br /><em>都拥有可解释的智能决策。</em></h1>
          <p className="hero-lead">五个标杆 Agent，共用一套可复用技术底座。从知识检索、文档解析，到结构化比较、智能推荐与业务路由，完整呈现 Agent 的理解、推理与协同能力。</p>
          <div className="hero-actions">
            <a className="primary-button" href="#workbench">进入演示工作台 <span>↗</span></a>
            <a className="text-button" href="#agents">查看标杆能力 <span>↓</span></a>
          </div>
          <div className="stats-row">{capabilityStats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
        </div>

        <div className="hero-system" aria-label="Agent 技术能力关系图">
          <div className="system-topline"><span>LIVE SYSTEM MAP</span><b>运行正常</b></div>
          <div className="system-stage">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="core-node"><span className="core-pulse" /><small>AGENT</small><strong>CORE</strong><em>统一智能底座</em></div>
            {AGENTS.map((agent, index) => (
              <button type="button" key={agent.id} className={`satellite satellite-${index + 1} tone-${agent.tone}`} onClick={() => chooseAgent(agent)} aria-label={`选择 ${agent.name}`}>
                <b>{agent.symbol}</b><span>{agent.shortName}</span>
              </button>
            ))}
          </div>
          <div className="signal-strip"><span><i />模型能力适配</span><span><i />业务数据适配</span><span><i />全链路追踪</span></div>
        </div>
      </section>

      <section className="agents-section" id="agents">
        <div className="section-heading"><div><span>02 / BENCHMARK CASES</span><h2>五种模式，一套底座</h2></div><p>每个标杆 Agent 对应一种可复用开发模式，为后续 28 个业务智能体提供工程模板。</p></div>
        <div className="agent-grid">
          {AGENTS.map((agent, index) => (
            <article className={`agent-card tone-${agent.tone}`} key={agent.id}>
              <div className="card-top"><span>CASE 0{index + 1}</span><i>{agent.availability === "runnable" ? "RUNNABLE" : "PREVIEW"}</i></div>
              <AgentMark agent={agent} /><div className="agent-id">{agent.id}</div><h3>{agent.name}</h3><p>{agent.description}</p>
              <div className="tags">{agent.capabilities.map((item) => <span key={item}>{item}</span>)}</div>
              <button type="button" onClick={() => { chooseAgent(agent); location.hash = "workbench"; }}>启动演示 <span>↗</span></button>
            </article>
          ))}
        </div>
      </section>

      <section className="workbench-section" id="workbench">
        <div className="section-heading light"><div><span>03 / LIVE WORKBENCH</span><h2>Agent 演示工作台</h2></div><p>使用样例知识与演示数据运行。正式 AI 中台及业务数据将在接口确认后接入。</p></div>
        <div className="workbench-shell">
          <aside className="agent-sidebar">
            <div className="panel-title"><span>AGENTS</span><b>{runnableCount} RUNNABLE / {AGENTS.length - runnableCount} PREVIEW</b></div>
            {AGENTS.map((agent) => (
              <button type="button" key={agent.id} onClick={() => chooseAgent(agent)} className={selected.id === agent.id ? "active" : ""} aria-label={`选择 ${agent.id} ${agent.shortName}`}>
                <AgentMark agent={agent} compact /><span><small>{agent.id}</small><strong>{agent.shortName}</strong></span><i />
              </button>
            ))}
            <div className="sidebar-foot"><span>统一接口</span><strong>AgentRequest / Response</strong></div>
          </aside>

          <div className="conversation-panel">
            <div className="conversation-head"><div><AgentMark agent={selected} compact /><span><small>{selected.id}</small><strong>{selected.name}</strong></span></div><span className="mock-badge">{selected.availability === "runnable" ? "LangGraph · Mock数据" : "样例预览"}</span></div>
            <div className="conversation-body">
              <div className="welcome-copy"><span className={`mini-symbol tone-${selected.tone}`}>{selected.symbol}</span><h3>{selected.welcome}</h3><p>{selected.demoHint}</p></div>
              {selected.id === "AG-002" && !response && !loading && <div className="manual-source-chip"><span>当前样例文档</span><strong>云巡 X8 无人机用户手册</strong><small>v0.9-demo · 虚构预解析材料</small></div>}
              {selected.id === "AG-003" && !response && !loading && <div className="recommendation-source-chip"><span>当前样例目录</span><strong>7 个虚构产品 · 3 套虚构场景方案</strong><small>仅用于规则推荐与接口演示，不代表真实商城数据</small></div>}
              {selected.id === "AG-012" && !response && !loading && <div className="policy-source-chip"><span>当前样例知识</span><strong>2 个虚构政策版本 · 1 份虚构行业标准</strong><small>支持版本时效、条款引用和适用条件演示，不代表真实政策库</small></div>}
              {selected.id === "AG-025" && !response && !loading && <div className="customer-service-source-chip"><span>当前客服 Mock</span><strong>6 条 FAQ · 2 个订单 · 2 个商品 · 3 项服务</strong><small>仅用于多意图路由、查询与转人工建议，不执行真实业务操作</small></div>}
              {!response && !loading && <div className="prompt-list"><span>推荐演示问题</span>{selected.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => setInput(prompt)}>{prompt}<i>↗</i></button>)}</div>}
              {loading && <div className="thinking-card"><div className="thinking-head"><span className="loading-dots"><i /><i /><i /></span> Agent 正在处理</div><div className="loading-line"><span /></div><p>正在理解问题、调用演示工具并组织可解释结果…</p></div>}
              {error && <div className="error-card"><strong>运行未完成</strong><p>{error}</p></div>}
              {response && (
                <div className="result-card">
                  <div className="result-kicker"><span>{response.status === "preview" ? "能力预览" : response.status === "needs_review" ? "演示结果 · 需复核" : response.status === "needs_clarification" ? "需要补充或适配" : "演示结果"}</span><b title={response.trace_id}>{response.request_id} · TRACE</b></div><h3>{response.output.title}</h3><p>{response.output.summary}</p>
                  {response.output.comparison ? <ComparisonPanel comparison={response.output.comparison} /> : response.output.manual ? <ManualPanel manual={response.output.manual} /> : response.output.recommendation ? <RecommendationPanel recommendation={response.output.recommendation} /> : response.output.policy ? <PolicyPanel policy={response.output.policy} /> : response.output.customer_service ? <CustomerServicePanel customerService={response.output.customer_service} /> : <div className="result-points">{response.output.points.map((point, index) => <div key={point}><span>0{index + 1}</span><p>{point}</p></div>)}</div>}
                  <div className="evidence-row"><span>依据</span>{response.output.evidence.map((item) => <b key={item}>{item}</b>)}</div>
                  <small>本结果由样例知识与演示数据生成，不代表正式业务结论。</small>
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
              <button type="button" className="attach-button" title={selected.id === "AG-003" ? "图片找货需等待正式视觉能力与商品数据接入" : "演示阶段使用预置样例材料，暂不接收文件上传"} aria-label="样例材料上传暂未开放" disabled>＋</button>
              <input value={input} onChange={(event) => setInput(event.target.value)} aria-label="向 Agent 提问" placeholder="输入一个业务问题…" />
              <button type="submit" className="send-button" disabled={loading || !input.trim()} aria-label="发送">↑</button>
              <div className="composer-meta"><span>ENTER 发送</span><b>演示接口已连接</b></div>
            </form>
          </div>

          <aside className="trace-panel">
            <div className="panel-title"><span>EXECUTION TRACE</span><b>LIVE</b></div>
            <div className="trace-status"><span className={`trace-symbol tone-${selected.tone}`}>{selected.symbol}</span><div><small>当前工作流</small><strong>{selected.workflow}</strong></div></div>
            <div className="trace-list">
              {(response?.trace ?? selected.trace).map((step, index) => (
                <div className={response || (!loading && index === 0) || (loading && index < 3) ? "done" : ""} key={typeof step === "string" ? step : step.name}>
                  <span>{String(index + 1).padStart(2, "0")}</span><p><strong>{typeof step === "string" ? step : step.name}</strong><small>{typeof step === "string" ? selected.traceNotes[index] : step.detail}</small></p><i />
                </div>
              ))}
            </div>
            <div className="trace-metrics"><div><span>执行引擎</span><strong>{selected.availability === "runnable" ? "LANGGRAPH" : "PREVIEW"}</strong></div><div><span>数据源</span><strong>MOCK</strong></div></div>
          </aside>
        </div>
      </section>

      <section className="architecture-section" id="architecture">
        <div className="architecture-copy"><span>04 / ADAPTER READY</span><h2>今天可演示，<br />明天可接入。</h2><p>页面与 Agent 核心逻辑通过运行时契约解耦。正式接口明确后，可通过 Provider Registry 注入正式适配器，不改变核心业务流程。</p><div className="contract-chips"><span>AgentRequest</span><span>AgentResponse</span><span>trace_id</span><span>evidence</span></div></div>
        <div className="architecture-map">
          <div className="layer"><small>EXPERIENCE</small><strong>Agent 能力展厅</strong><span>统一交互工作台</span></div><i>↓</i>
          <div className="layer accent"><small>OUR CORE</small><strong>Agent 应用框架</strong><span>业务流程 · Prompt · 规则 · 评测</span></div><i>↓</i>
          <div className="adapter-row"><div className="layer"><small>AI PORT</small><strong>AIPlatformPort</strong><span>甲方 AI 中台、OCR与多模态适配</span></div><div className="layer"><small>DATA PORT</small><strong>Business / Document / Policy DataPort</strong><span>数据中台、业务系统、文档源与政策知识库适配</span></div></div>
        </div>
      </section>

      <footer><div className="brand"><span className="brand-seal">JDZ</span><span><strong>景德镇低空商业服务网</strong><small>AI AGENT LAB</small></span></div><p>标杆 Agent 能力演示 · V1.9</p><span>AG-001 / AG-002 / AG-003 / AG-012 / AG-025 全部可运行 · Mock数据</span></footer>
    </main>
  );
}
