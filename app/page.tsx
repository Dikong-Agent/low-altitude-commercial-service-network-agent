"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AGENTS, type AgentComparisonOutput, type AgentDefinition, type AgentId } from "./lib/contracts";
import { invokeAgent } from "./lib/agent-gateway";

const capabilityStats = [
  { value: "01", label: "可运行 Agent" },
  { value: "16", label: "AG-001 能力点" },
  { value: "02", label: "预留适配接口" },
];

interface DemoHistoryItem {
  requestId: string;
  input: string;
  summary: string;
  createdAt: string;
}

const HISTORY_KEY = "jdz-ag001-demo-history";

function AgentMark({ agent, compact = false }: { agent: AgentDefinition; compact?: boolean }) {
  return <span className={`agent-mark tone-${agent.tone} ${compact ? "compact" : ""}`} aria-hidden="true"><span>{agent.symbol}</span></span>;
}

function ComparisonPanel({ comparison }: { comparison: AgentComparisonOutput }) {
  const [tableView, setTableView] = useState<"horizontal" | "vertical">("horizontal");
  const productById = new Map(comparison.products.map((product) => [product.id, product]));
  const intentItems = [
    comparison.intent.use_case ? `场景 · ${comparison.intent.use_case}` : null,
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
                <tr key={row.key}><th>{row.label}</th>{row.values.map((value) => (
                  <td key={value.product_id} className={row.best_product_ids.includes(value.product_id) ? "best" : ""}>
                    {value.display}{row.best_product_ids.includes(value.product_id) && <small>优势项</small>}
                  </td>
                ))}</tr>
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
            <header><div><small>{product.id}</small><strong>{product.name}</strong></div><b>{product.score}<small>/100</small></b></header>
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

export default function Home() {
  const [selectedId, setSelectedId] = useState<AgentId>("AG-001");
  const [input, setInput] = useState(AGENTS[0].prompts[0]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Awaited<ReturnType<typeof invokeAgent>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DemoHistoryItem[]>([]);
  const selected = useMemo(() => AGENTS.find((agent) => agent.id === selectedId) ?? AGENTS[0], [selectedId]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as DemoHistoryItem[];
      if (Array.isArray(saved)) setHistory(saved.filter((item) => item && typeof item.input === "string").slice(0, 5));
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  function chooseAgent(agent: AgentDefinition) {
    setSelectedId(agent.id);
    setInput(agent.prompts[0]);
    setResponse(null);
    setError(null);
  }

  async function runAgent(event?: FormEvent) {
    event?.preventDefault();
    if (!input.trim() || loading) return;
    setLoading(true);
    setResponse(null);
    setError(null);
    try {
      const result = await invokeAgent({ agent_id: selected.id, input: input.trim(), session_id: "showroom-demo" });
      setResponse(result);
      if (selected.id === "AG-001" && result.output.comparison) {
        const item: DemoHistoryItem = {
          requestId: result.request_id,
          input: input.trim(),
          summary: result.output.comparison.recommendation.primary_product_name ?? "条件冲突，未形成推荐",
          createdAt: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        };
        setHistory((current) => {
          const next = [item, ...current.filter((entry) => entry.input !== item.input)].slice(0, 5);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
          return next;
        });
      }
    }
    catch { setError("Agent 暂时无法完成本次运行，请稍后重试或更换演示问题。"); }
    finally { setLoading(false); }
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
              <div className="card-top"><span>CASE 0{index + 1}</span><i>{agent.id === "AG-001" ? "RUNNABLE" : "PREVIEW"}</i></div>
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
            <div className="panel-title"><span>AGENTS</span><b>1 RUNNABLE / 4 PREVIEW</b></div>
            {AGENTS.map((agent) => (
              <button type="button" key={agent.id} onClick={() => chooseAgent(agent)} className={selected.id === agent.id ? "active" : ""}>
                <AgentMark agent={agent} compact /><span><small>{agent.id}</small><strong>{agent.shortName}</strong></span><i />
              </button>
            ))}
            <div className="sidebar-foot"><span>统一接口</span><strong>AgentRequest / Response</strong></div>
          </aside>

          <div className="conversation-panel">
            <div className="conversation-head"><div><AgentMark agent={selected} compact /><span><small>{selected.id}</small><strong>{selected.name}</strong></span></div><span className="mock-badge">{selected.id === "AG-001" ? "LangGraph · Mock数据" : "样例预览"}</span></div>
            <div className="conversation-body">
              <div className="welcome-copy"><span className={`mini-symbol tone-${selected.tone}`}>{selected.symbol}</span><h3>{selected.welcome}</h3><p>{selected.demoHint}</p></div>
              {!response && !loading && <div className="prompt-list"><span>推荐演示问题</span>{selected.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => setInput(prompt)}>{prompt}<i>↗</i></button>)}</div>}
              {loading && <div className="thinking-card"><div className="thinking-head"><span className="loading-dots"><i /><i /><i /></span> Agent 正在处理</div><div className="loading-line"><span /></div><p>正在理解问题、调用演示工具并组织可解释结果…</p></div>}
              {error && <div className="error-card"><strong>运行未完成</strong><p>{error}</p></div>}
              {response && (
                <div className="result-card">
                  <div className="result-kicker"><span>演示结果</span><b>{response.request_id}</b></div><h3>{response.output.title}</h3><p>{response.output.summary}</p>
                  {response.output.comparison ? <ComparisonPanel comparison={response.output.comparison} /> : <div className="result-points">{response.output.points.map((point, index) => <div key={point}><span>0{index + 1}</span><p>{point}</p></div>)}</div>}
                  <div className="evidence-row"><span>依据</span>{response.output.evidence.map((item) => <b key={item}>{item}</b>)}</div>
                  <small>本结果由样例知识与演示数据生成，不代表正式业务结论。</small>
                </div>
              )}
              {selected.id === "AG-001" && history.length > 0 && (
                <div className="comparison-history">
                  <header><div><strong>本地演示记录</strong><small>仅保存在当前浏览器，可点击复用</small></div><button type="button" onClick={() => { localStorage.removeItem(HISTORY_KEY); setHistory([]); }}>清空</button></header>
                  <div>{history.map((item) => (
                    <button type="button" key={item.requestId} onClick={() => { setInput(item.input); setResponse(null); setError(null); }}>
                      <span><strong>{item.summary}</strong><small>{item.input}</small></span><time>{item.createdAt}</time>
                    </button>
                  ))}</div>
                </div>
              )}
            </div>
            <form className="composer" onSubmit={runAgent}>
              <button type="button" className="attach-button" title="演示阶段使用预置样例材料" aria-label="样例材料">＋</button>
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
            <div className="trace-metrics"><div><span>执行引擎</span><strong>{selected.id === "AG-001" ? "LANGGRAPH" : "PREVIEW"}</strong></div><div><span>数据源</span><strong>MOCK</strong></div></div>
          </aside>
        </div>
      </section>

      <section className="architecture-section" id="architecture">
        <div className="architecture-copy"><span>04 / ADAPTER READY</span><h2>今天可演示，<br />明天可接入。</h2><p>页面与 Agent 核心逻辑通过统一契约解耦。正式接口明确后，仅替换适配器，不改变用户体验与业务流程。</p><div className="contract-chips"><span>AgentRequest</span><span>AgentResponse</span><span>trace_id</span><span>evidence</span></div></div>
        <div className="architecture-map">
          <div className="layer"><small>EXPERIENCE</small><strong>Agent 能力展厅</strong><span>统一交互工作台</span></div><i>↓</i>
          <div className="layer accent"><small>OUR CORE</small><strong>Agent 应用框架</strong><span>业务流程 · Prompt · 规则 · 评测</span></div><i>↓</i>
          <div className="adapter-row"><div className="layer"><small>AI PORT</small><strong>AIPlatformPort</strong><span>甲方 AI 中台适配</span></div><div className="layer"><small>DATA PORT</small><strong>BusinessDataPort</strong><span>数据及业务系统适配</span></div></div>
        </div>
      </section>

      <footer><div className="brand"><span className="brand-seal">JDZ</span><span><strong>景德镇低空商业服务网</strong><small>AI AGENT LAB</small></span></div><p>标杆 Agent 能力演示 · V1.1</p><span>AG-001 可运行 / Mock数据</span></footer>
    </main>
  );
}
