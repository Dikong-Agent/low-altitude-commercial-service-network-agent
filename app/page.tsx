"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { AGENTS } from "./lib/agent-registry";
import type { AgentComparisonOutput, AgentCustomerServiceOutput, AgentDefinition, AgentId, AgentManualOutput, AgentPolicyOutput, AgentRecommendationOutput, ManualTopic } from "./lib/contracts";
import { AgentGatewayError, invokeAgent } from "./lib/agent-gateway";

const capabilityStats = [
  { value: "28", label: "业务智能体总体范围" },
  { value: "5", label: "可运行标杆Agent" },
  { value: "1", label: "套可复用建设方法" },
];

const agentPresentation = {
  "AG-001": { scene: "产品选型与参数比较", input: "候选型号、使用场景与约束条件", output: "结构化对比、约束校验与选型建议" },
  "AG-002": { scene: "产品说明书咨询", input: "说明书材料、问题与操作场景", output: "原文定位、通俗解读与安全提示" },
  "AG-003": { scene: "分类导购与方案推荐", input: "用途、预算、偏好与排除条件", output: "候选方案、推荐依据与差距说明" },
  "AG-012": { scene: "政策与标准咨询", input: "政策材料、查询时点与适用条件", output: "版本核验、条款依据与适用解释" },
  "AG-025": { scene: "商品、订单与售后咨询", input: "用户问题、业务实体与会话上下文", output: "答复、业务路由与人工协同摘要" },
} satisfies Record<AgentId, { scene: string; input: string; output: string }>;

const runnableCount = AGENTS.filter((agent) => agent.availability === "runnable").length;

function presentEvidenceLabel(value: string): string {
  if (/^AG-?\d{3}(?:\s|-).*(?:rule|规则|port|边界)/i.test(value)) return "能力规则依据";
  return value.replaceAll("Mock", "演示样例").replaceAll("DEMO", "样例");
}

const manualTopicLabels: Record<ManualTopic, string> = {
  overview: "产品概况",
  operation: "操作指引",
  safety: "安全事项",
  troubleshooting: "故障排查",
  terminology: "术语解释",
  compliance: "合规要求",
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
        <header><strong>原文定位</strong><small>按与当前问题的相关程度展示</small></header>
        <div>{manual.citations.map((citation) => <article key={citation.section_id}><span>{Math.round(citation.relevance * 100)}%</span><div><strong>{citation.location}</strong><p>{citation.excerpt}</p></div></article>)}</div>
      </section>

      <div className="manual-coverage"><span><b>{manual.capability_coverage.length}</b>项能力纳入当前样板</span><p>本次重点展示问题理解、原文定位、通俗解读和安全提示等核心能力。</p></div>
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
      <div className="intent-strip"><span>导购理解</span><div>{intentItems.map((item) => <b key={item}>{item}</b>)}</div></div>
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
      <div className="manual-coverage"><span><b>{recommendation.capability_coverage.length}</b>项能力纳入当前样板</span><p>其中{demonstrated}项已形成可运行展示，重点呈现场景理解、条件筛选与推荐依据。</p></div>
      <p className="data-notice">当前展示使用演示样例方案、产品与价格，不代表真实商城信息、正式报价或采购建议。</p>
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
      <div className="manual-coverage"><span><b>{policy.capability_coverage.length}</b>项能力纳入当前样板</span><p>其中{demonstrated}项已形成可运行展示，重点呈现版本核验、条款依据和适用条件解释。</p></div>
      <p className="data-notice">当前展示使用演示样例政策与标准；真实申报、合规及适航判断应以权威资料和主管部门口径为准。</p>
    </div>
  );
}

function CustomerServicePanel({ customerService }: { customerService: AgentCustomerServiceOutput }) {
  const routeLabels = { knowledge_answer: "知识答复", business_data: "业务信息查询", specialist_agent: "专业能力协同", human_handoff: "人工协同", clarification: "补充信息" } as const;
  const domainLabels = { platform: "平台", product_mall: "产品商城", flight_service: "飞行服务", technical_service: "技术服务", commercial_service: "商业服务", unknown: "待识别" } as const;
  const issueLabels = { general_rule: "平台规则", product: "商品咨询", order: "订单问题", after_sales: "售后问题", service: "服务咨询", complaint: "投诉", finance: "投融资", credit: "信贷", analytics: "运营问数", violation: "违规风险", unknown: "待识别" } as const;
  const demonstrated = customerService.capability_coverage.filter((item) => item.status === "mock-demonstrated").length;
  const intentItems = [
    `路径 · ${routeLabels[customerService.intent.route]}`,
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
      {customerService.conversation.session_id && <section className="customer-knowledge"><header><strong>连续会话摘要</strong><small>{customerService.conversation.turn_count} 轮 · {customerService.conversation.prior_context_used ? "已结合前序信息" : "当前为独立问题"}</small></header><div><article><span>{String(customerService.conversation.turn_count).padStart(2, "0")}</span><div><strong>{customerService.conversation.user_problem_summary}</strong><p>持续保留已确认的关键信息，减少重复说明。</p></div></article></div></section>}
      {customerService.tool_results.length > 0 && <section className="customer-tools"><header><strong>业务信息</strong><small>根据已确认的信息返回对应结果</small></header><div>{customerService.tool_results.map((item) => <article className={`tool-${item.status}`} key={`${item.tool}-${item.label}`}><span>{item.status === "found" ? "已找到" : "未找到"}</span><strong>{item.label}</strong><p>{item.value}</p></article>)}</div></section>}
      {customerService.knowledge_matches.length > 0 && <section className="customer-knowledge"><header><strong>答复依据</strong><small>演示用知识与规则样例</small></header><div>{customerService.knowledge_matches.map((item) => <article key={item.id}><span>{Math.round(item.relevance * 100)}%</span><div><strong>{item.title}</strong><p>{item.excerpt}</p></div></article>)}</div></section>}
      {customerService.handoff.required && <section className="handoff-card"><header><span>{customerService.handoff.priority.toUpperCase()}</span><strong>建议转接：{customerService.handoff.target_team}</strong><b>尚未执行</b></header><p>{customerService.handoff.reason}</p><div><article><strong>已确认信息</strong>{customerService.handoff.confirmed_information.length ? customerService.handoff.confirmed_information.map((item) => <span key={item}>{item}</span>) : <span>暂无已确认业务实体</span>}</article><article><strong>待处理事项</strong>{customerService.handoff.pending_items.map((item) => <span key={item}>{item}</span>)}</article></div></section>}
      <div className="manual-coverage"><span><b>{customerService.capability_coverage.length}</b>项能力纳入当前样板</span><p>其中{demonstrated}项已形成可运行展示，重点呈现多意图理解、业务答复与协同分流。</p></div>
      <p className="data-notice">当前展示使用演示样例业务资料，不执行退款、转单、信用处理或人工转接等真实业务操作。</p>
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

  function handleComposerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!input.trim() || loading) return;
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="返回首页">
          <span className="brand-seal">JDZ</span>
          <span><strong>景德镇低空商业服务网</strong><small>标杆智能体能力演示</small></span>
        </a>
        <nav aria-label="主导航"><a href="#agents">标杆Agent</a><a href="#workbench">现场演示</a><a href="#architecture">建设体系</a></nav>
        <div className="environment-pill"><i /> 能力演示</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>企业级业务智能体解决方案</span></div>
          <h1>以五个标杆Agent，<br /><em>展现可复制、可扩展的业务智能化能力。</em></h1>
          <p className="hero-lead">围绕五类典型业务场景，形成从问题理解、业务判断到结果依据呈现的完整能力，为后续Agent建设提供统一、可复用的实施路径。</p>
          <p className="hero-note">当前为能力演示环境，页面中的商品、政策、订单和业务信息均为演示样例。</p>
          <div className="hero-actions">
            <a className="primary-button" href="#workbench">进入现场演示 <span>→</span></a>
            <a className="text-button" href="#agents">查看五个标杆Agent <span>↓</span></a>
          </div>
          <div className="stats-row">{capabilityStats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
        </div>

        <div className="project-brief" aria-label="标杆建设成果">
          <div className="brief-head"><span>标杆建设成果</span><b><i />5个Agent均可运行</b></div>
          <div className="brief-body">
            <div className="brief-row owned"><span>01</span><div><small>可运行成果</small><strong>五个标杆Agent</strong><p>覆盖产品比较、说明书解读、分类导购、政策咨询和智能客服</p></div><b>已具备</b></div>
            <div className="brief-row"><span>02</span><div><small>标准化方法</small><strong>统一能力设计</strong><p>贯通问题理解、业务判断、结果呈现、依据说明与效果评估</p></div><b>可复用</b></div>
            <div className="brief-row"><span>03</span><div><small>规模化基础</small><strong>28个业务智能体</strong><p>为后续智能体建设提供一致的能力规范与扩展路径</p></div><b>持续建设</b></div>
          </div>
          <div className="brief-foot"><span>展示重点</span><strong>业务价值 + 可信依据 + 清晰边界</strong><p>直观呈现Agent能够解决什么问题、如何形成结果，以及结果适用范围。</p></div>
        </div>
      </section>

      <section className="agents-section" id="agents">
        <div className="section-heading"><div><span>标杆能力</span><h2>五个Agent，一套可复用交付方法</h2></div><p>每个标杆Agent覆盖一种典型开发模式，重点展示输入理解、业务处理、结果依据和协作边界。</p></div>
        <div className="agent-grid">
          {AGENTS.map((agent, index) => (
            <article className={`agent-card tone-${agent.tone}`} key={agent.id}>
              <div className="card-top"><span>标杆样板 {String(index + 1).padStart(2, "0")}</span><i>{agent.availability === "runnable" ? "可运行" : "能力预览"}</i></div>
              <div className="agent-card-head"><AgentMark agent={agent} /><div><span className="agent-id">{agent.id}</span><h3>{agent.name}</h3></div></div>
              <p>{agent.description}</p>
              <dl className="agent-facts">
                <div><dt>适用场景</dt><dd>{agentPresentation[agent.id].scene}</dd></div>
                <div><dt>主要输入</dt><dd>{agentPresentation[agent.id].input}</dd></div>
                <div><dt>输出结果</dt><dd>{agentPresentation[agent.id].output}</dd></div>
              </dl>
              <div className="capability-line"><span>已演示能力</span><p>{agent.capabilities.join("、")}</p></div>
              <button type="button" onClick={() => { chooseAgent(agent); location.hash = "workbench"; }}>打开演示 <span>→</span></button>
            </article>
          ))}
        </div>
      </section>

      <section className="workbench-section" id="workbench">
        <div className="section-heading light"><div><span>现场演示</span><h2>可操作的Agent工作台</h2></div><p>选择标杆Agent并输入业务问题，查看业务理解、分析结果、参考依据与适用说明。</p></div>
        <div className="workbench-shell">
          <aside className="agent-sidebar">
            <div className="panel-title"><span>标杆Agent</span><b>{runnableCount}个可运行</b></div>
            {AGENTS.map((agent) => (
              <button type="button" key={agent.id} onClick={() => chooseAgent(agent)} className={selected.id === agent.id ? "active" : ""} aria-label={`选择 ${agent.id} ${agent.shortName}`}>
                <AgentMark agent={agent} compact /><span><small>{agent.id}</small><strong>{agent.shortName}</strong></span><i />
              </button>
            ))}
            <div className="sidebar-foot"><span>统一交互规范</span><strong>标准化输入与结果输出</strong></div>
          </aside>

          <div className="conversation-panel">
            <div className="conversation-head"><div><AgentMark agent={selected} compact /><span><small>{selected.id}</small><strong>{selected.name}</strong></span></div><span className="mock-badge">{selected.availability === "runnable" ? "能力演示 · 样例数据" : "能力预览"}</span></div>
            <div className="conversation-body">
              <div className="welcome-copy"><span className={`mini-symbol tone-${selected.tone}`}>{selected.symbol}</span><h3>{selected.welcome}</h3><p>{selected.demoHint}</p></div>
              {selected.id === "AG-002" && !response && !loading && <div className="manual-source-chip"><span>演示用文档</span><strong>云巡 X8 无人机用户手册</strong><small>支持内容解读、原文定位与安全提示展示</small></div>}
              {selected.id === "AG-003" && !response && !loading && <div className="recommendation-source-chip"><span>演示用目录</span><strong>7 个样例产品 · 3 套样例场景方案</strong><small>用于展示场景理解、条件筛选和推荐依据</small></div>}
              {selected.id === "AG-012" && !response && !loading && <div className="policy-source-chip"><span>演示用知识</span><strong>2 个样例政策版本 · 1 份样例行业标准</strong><small>用于展示版本核验、条款引用和适用条件解释</small></div>}
              {selected.id === "AG-025" && !response && !loading && <div className="customer-service-source-chip"><span>演示用业务资料</span><strong>6 条 FAQ · 2 个订单 · 2 个商品 · 3 项服务</strong><small>用于展示咨询理解、业务答复与人工协同建议</small></div>}
              {!response && !loading && <div className="prompt-list"><span>推荐演示问题</span>{selected.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => setInput(prompt)}>{prompt}<i>↗</i></button>)}</div>}
              {loading && <div className="thinking-card"><div className="thinking-head"><span className="loading-dots"><i /><i /><i /></span> 正在生成演示结果</div><div className="loading-line"><span /></div><p>请稍候，结果生成后将展示结论、依据与适用说明。</p></div>}
              {error && <div className="error-card"><strong>运行未完成</strong><p>{error}</p></div>}
              {response && (
                <div className="result-card">
                  <div className="result-kicker"><span>{response.status === "preview" ? "能力预览" : response.status === "needs_review" ? "演示结果 · 建议复核" : response.status === "needs_clarification" ? "需要补充信息" : "演示结果"}</span><b>结果编号 {response.request_id}</b></div><h3>{response.output.title}</h3><p>{response.output.summary}</p>
                  {response.output.comparison ? <ComparisonPanel comparison={response.output.comparison} /> : response.output.manual ? <ManualPanel manual={response.output.manual} /> : response.output.recommendation ? <RecommendationPanel recommendation={response.output.recommendation} /> : response.output.policy ? <PolicyPanel policy={response.output.policy} /> : response.output.customer_service ? <CustomerServicePanel customerService={response.output.customer_service} /> : <div className="result-points">{response.output.points.map((point, index) => <div key={point}><span>0{index + 1}</span><p>{point}</p></div>)}</div>}
                  <div className="evidence-row"><span>依据</span>{response.output.evidence.map((item) => <b key={item}>{presentEvidenceLabel(item)}</b>)}</div>
                  <small>本结果基于演示样例生成，仅用于能力展示，不作为正式业务结论。</small>
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
              <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleComposerKeyDown} aria-label="向 Agent 提问" placeholder="输入一个业务问题…" />
              <button type="submit" className="send-button" disabled={loading || !input.trim()} aria-label="发送">↑</button>
              <div className="composer-meta"><span>按 Enter 发送</span><b>演示服务正常</b></div>
            </form>
          </div>

          <aside className="trace-panel">
            <div className="panel-title"><span>业务流程</span><b>清晰可追踪</b></div>
            <div className="trace-status"><span className={`trace-symbol tone-${selected.tone}`}>{selected.symbol}</span><div><small>能力流程</small><strong>{selected.workflow}</strong></div></div>
            <div className="trace-list">
              {selected.trace.map((step, index) => (
                <div className={response || (!loading && index === 0) || (loading && index < 3) ? "done" : ""} key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span><p><strong>{step}</strong><small>{selected.traceNotes[index]}</small></p><i />
                </div>
              ))}
            </div>
            <div className="trace-metrics"><div><span>流程状态</span><strong>{selected.availability === "runnable" ? "可运行" : "能力预览"}</strong></div><div><span>数据范围</span><strong>演示样例</strong></div></div>
          </aside>
        </div>
      </section>

      <section className="architecture-section" id="architecture">
        <div className="architecture-copy"><span>规模化建设体系</span><h2>统一能力规范，<br />支撑持续扩展。</h2><p>通过标准化的交互方式连接智能能力、业务知识与业务数据，使不同Agent能够复用成熟方法，并根据后续建设需要持续扩展。</p><div className="contract-chips"><span>统一输入</span><span>结构化结果</span><span>过程可追踪</span><span>依据可核验</span></div></div>
        <div className="architecture-map">
          <div className="layer"><small>能力展示入口</small><strong>标杆Agent能力演示</strong><span>统一问题输入、结果呈现与使用记录</span></div><i>↓</i>
          <div className="layer accent"><small>业务智能体能力</small><strong>业务理解与智能辅助</strong><span>问题理解 · 业务判断 · 结果生成 · 依据说明 · 效果评估</span></div><i>↓</i>
          <div className="adapter-row"><div className="layer"><small>智能能力支撑</small><strong>模型与知识能力</strong><span>语言理解、知识检索、文档识别、多模态与工具能力</span></div><div className="layer"><small>业务信息支撑</small><strong>数据与业务服务</strong><span>业务数据、文档材料、政策信息、流程状态与执行结果</span></div></div>
        </div>
      </section>

      <footer><div className="brand"><span className="brand-seal">JDZ</span><span><strong>景德镇低空商业服务网</strong><small>标杆智能体能力演示</small></span></div><p>五个标杆Agent · V1.9</p><span>演示环境 · 样例数据 · 结果仅用于能力展示</span></footer>
    </main>
  );
}
