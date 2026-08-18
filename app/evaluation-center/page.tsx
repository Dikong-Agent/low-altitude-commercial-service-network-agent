"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EvaluationMetric, RagEvaluationRun } from "../lib/rag-evaluation/contracts";
import styles from "./page.module.css";

type OnlineAgent = { agentId: string; latencyMs: number; modelTokens: number; citationCoverage: number; groundingSupport: number };
type Dashboard = {
  current: RagEvaluationRun; baseline: RagEvaluationRun; runs: RagEvaluationRun[];
  comparison: Array<{ id: string; label: string; current: number; baseline: number | null; delta: number | null; passed: boolean }>;
  dataset: { version: string; totalCases: number; agentCount: number; casesPerAgent: number; categories: RagEvaluationRun["categories"] };
  evaluationLayers: {
    engineering: { status: string; cases: number; passed: number; label: string };
    online: { id: string; verifiedAt: string; status: string; sampleCount: number; providers: { model: string; embedding: string; rerank: string }; citationCoverage: number; minimumGroundingSupport: number; totalModelTokens: number; averageModelTokens: number; p95LatencyMs: number; finding: string; agents: OnlineAgent[] };
    formal: { status: string; completed: number; total: number; items: Array<{ label: string; status: "ready" | "pending" }> };
  };
  remediation: { open: number; closed: number; workflow: string[] };
  runtime: { status: string; mode: string; providers: { model: string; embedding: string; rerank: string }; indexedNamespaces: number; metrics: { runs: number; completed: number; insufficientEvidence: number; validationFailed: number; degraded: number; averageDurationMs: number } };
  persistence: "d1" | "memory"; updatedAt: string;
};
type Tab = "overview" | "gates" | "agents" | "failures" | "history" | "operations";

const pct = (value: number) => `${(value * 100).toFixed(value === 1 ? 0 : 1)}%`;
const metricValue = (metric: EvaluationMetric) => metric.unit === "ratio" ? pct(metric.value) : metric.unit === "milliseconds" ? `${metric.value.toFixed(1)} ms` : String(metric.value);
const metricThreshold = (metric: EvaluationMetric) => `${metric.operator === "gte" ? "≥" : metric.operator === "lte" ? "≤" : "="} ${metric.unit === "ratio" ? pct(metric.threshold) : metric.unit === "milliseconds" ? `${metric.threshold} ms` : metric.threshold}`;

export default function EvaluationCenterPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() { const response = await fetch("/api/rag-evaluation", { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "无法读取评测结果"); setDashboard(payload as Dashboard); }
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/rag-evaluation", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? "无法读取评测结果");
        if (!cancelled) setDashboard(payload as Dashboard);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "无法读取评测结果");
      });
    return () => { cancelled = true; };
  }, []);
  async function action(body: unknown, success: string) { setBusy(true); setError(""); setNotice(""); try { const response = await fetch("/api/rag-evaluation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "评测操作失败"); await load(); setNotice(success); } catch (caught) { setError(caught instanceof Error ? caught.message : "评测操作失败"); } finally { setBusy(false); } }
  const run = dashboard?.current;
  const tabs: Array<[Tab,string,string]> = [["overview","01","质量总览"],["gates","02","共性质量指标"],["agents","03","分智能体评测"],["failures","04","问题样本分析"],["history","05","版本与基线"],["operations","06","运行监控"]];
  return <main className={styles.page}>
    <header className={styles.topbar}><div className={styles.brand}><span>JDZ</span><div><strong>业务智能体质量评测</strong><small>检索与引用质量 · 运行记录 · 样例环境</small></div></div><nav><Link href="/">项目介绍</Link><Link href="/experience">样例体验</Link><Link href="/knowledge-admin">知识管理</Link><b>质量评测</b></nav></header>
    <section className={styles.hero}><div><span>检索问答质量评测</span><h1>记录资料、模型和检索配置调整前后的评测结果</h1><p>检查相关资料能否被找到、排序是否合理、结论是否有引用，以及拒答、权限和时效处理是否符合要求。</p></div><aside><b>{run?.gateStatus === "passed" ? "当前基础测试通过" : "等待评测"}</b><strong>{run ? `${run.passedCases} / ${run.totalCases}` : "—"}</strong><span>基准用例通过</span><button disabled={busy} onClick={() => void action({ action: "run" }, "新一轮基准评测已完成。")}>{busy ? "正在评测…" : "运行完整评测"}</button></aside></section>
    {error && <div className={styles.error}>{error}<button onClick={() => setError("")}>关闭</button></div>}{notice && <div className={styles.notice}>{notice}</div>}
    <section className={styles.metrics}><article><span>基准问题</span><strong>{dashboard?.dataset.totalCases ?? "—"}</strong><small>四个智能体，每个50题</small></article><article><span>共性质量检查</span><strong>{run?.metrics.filter((item) => item.passed).length ?? "—"}/{run?.metrics.length ?? "—"}</strong><small>检索、生成与安全</small></article><article><span>分智能体检查</span><strong>{run?.agents.filter((item) => item.specialGatePassed).length ?? "—"}/4</strong><small>按业务风险分别设置</small></article><article><span>待整改项</span><strong>{dashboard?.remediation.open ?? "—"}</strong><small>分析、修复、复测、关闭</small></article><article><span>评测记录</span><strong>{dashboard?.runs.length ?? "—"}</strong><small>保留最近20次</small></article></section>
    <div className={styles.layout}><aside className={styles.sidebar}>{tabs.map(([id,index,label]) => <button key={id} className={tab === id ? styles.active : ""} onClick={() => setTab(id)}><span>{index}</span>{label}</button>)}<div><small>评测记录存储</small><strong>{dashboard?.persistence === "d1" ? "D1持久化存储" : "临时内存存储"}</strong><p>正式环境须使用甲方授权知识重建基准问题集，并重新运行全部质量检查。</p></div></aside>
      <section className={styles.content}>
        {tab === "overview" && <Overview dashboard={dashboard}/>}
        {tab === "gates" && <Gates run={run}/>}
        {tab === "agents" && <Agents run={run}/>}
        {tab === "failures" && <Failures run={run} remediation={dashboard?.remediation}/>}
        {tab === "history" && <History dashboard={dashboard} busy={busy} onBaseline={(id) => action({ action: "set_baseline", runId: id }, "评测基线已更新。")}/>}
        {tab === "operations" && <Operations dashboard={dashboard}/>}
      </section>
    </div>
  </main>;
}

function Head({ kicker, title, text }: { kicker: string; title: string; text?: string }) { return <header className={styles.sectionHead}><div><span>{kicker}</span><h2>{title}</h2>{text && <p>{text}</p>}</div></header>; }

function Overview({ dashboard }: { dashboard: Dashboard | null }) {
  const run = dashboard?.current; const layers = dashboard?.evaluationLayers;
  const onlineHasFindings = layers?.online.status === "observed_with_findings";
  return <><Head kicker="质量总览" title="基础测试、在线抽样和正式验收分别记录" text="基础测试用于检查工程稳定性；在线抽样用于观察真实模型表现；正式验收仍需甲方授权数据、接口和业务专家确认。"/>
    <div className={styles.statusBand}><div className={run?.gateStatus === "passed" ? styles.pass : styles.fail}><span>{run?.gateStatus === "passed" ? "通过" : "待检查"}</span><strong>{run?.gateStatus === "passed" ? "基础质量检查通过" : "当前质量检查未通过"}</strong><p>{run?.datasetLabel ?? "正在生成初始基线"}</p></div><dl><div><dt>数据集版本</dt><dd>{run?.datasetVersion ?? "—"}</dd></div><div><dt>知识目录版本</dt><dd>{run?.versions.knowledgeCatalog ?? "—"}</dd></div><div><dt>索引版本</dt><dd>{run?.versions.indexVersion ?? "—"}</dd></div><div><dt>评测耗时</dt><dd>{run ? `${run.durationMs.toFixed(0)} ms` : "—"}</dd></div></dl></div>
    <section className={styles.layerSection}><header><strong>三类评测状态</strong><span>分别记录结果</span></header><div className={styles.layerGrid}><article><span>01 · 基础测试</span><b className={layers?.engineering.status === "passed" ? styles.ok : styles.bad}>{layers?.engineering.status === "passed" ? "已通过" : "待通过"}</b><strong>{layers?.engineering.passed ?? 0}/{layers?.engineering.cases ?? 0}</strong><p>使用固定资料和预期结果，可重复运行。</p></article><article><span>02 · 真实模型抽样</span><b className={onlineHasFindings ? styles.review : styles.ok}>{onlineHasFindings ? "存在待核查项" : "本轮未发现影响使用的问题"}</b><strong>{layers?.online.sampleCount ?? 0} 个样例</strong><p>引用完整度 {pct(layers?.online.citationCoverage ?? 0)}，最低结论有据率 {pct(layers?.online.minimumGroundingSupport ?? 0)}。</p></article><article><span>03 · 甲方正式验收</span><b className={styles.pending}>待外部资料</b><strong>{layers?.formal.completed ?? 0}/{layers?.formal.total ?? 0}</strong><p>须使用正式知识、接口和专家确认结果。</p></article></div></section>
    <div className={styles.overviewGrid}><section><header><strong>关键质量指标</strong><span>当前运行</span></header>{run?.metrics.slice(0,6).map((metric) => <Metric key={metric.id} metric={metric}/>)}</section><section><header><strong>正式验收前置条件</strong><span>{layers?.formal.completed ?? 0}/{layers?.formal.total ?? 0}</span></header>{layers?.formal.items.map((item) => <div className={styles.categoryRow} key={item.label}><span>{item.label}</span><em className={item.status === "ready" ? styles.ok : styles.pending}>{item.status === "ready" ? "已具备" : "待提供"}</em></div>)}</section></div><p className={styles.boundary}>{run?.boundary}</p></>;
}
function Metric({ metric }: { metric: EvaluationMetric }) { return <div className={styles.metricRow}><div><span>{metric.label}</span><small>{metric.description}</small></div><strong>{metricValue(metric)}</strong><b className={metric.passed ? styles.ok : styles.bad}>{metric.passed ? "通过" : "未通过"}</b></div>; }
function Gates({ run }: { run?: RagEvaluationRun }) { return <><Head kicker="共性质量指标" title="查看各项指标的当前值、合格标准和判定结果"/><div className={styles.gateTable}><table><thead><tr><th>质量指标</th><th>当前值</th><th>合格标准</th><th>样本数量</th><th>结论</th></tr></thead><tbody>{run?.metrics.map((metric) => <tr key={metric.id}><td><strong>{metric.label}</strong><small>{metric.description}</small></td><td>{metricValue(metric)}</td><td>{metricThreshold(metric)}</td><td>{metric.evidenceCount}项</td><td><b className={metric.passed ? styles.ok : styles.bad}>{metric.passed ? "通过" : "未通过"}</b></td></tr>)}</tbody></table></div></>; }
function Agents({ run }: { run?: RagEvaluationRun }) { return <><Head kicker="分智能体评测" title="根据各业务智能体的风险设置专项指标"/><div className={styles.agentGrid}>{run?.agents.map((agent) => <article key={agent.agentId}><header><span>{agent.agentId}</span><b className={agent.specialGatePassed ? styles.ok : styles.bad}>{agent.specialGatePassed ? "通过" : "未通过"}</b></header><h3>{agent.name}</h3><strong>{agent.passedCases}/{agent.cases}<small> 用例通过</small></strong><dl><div><dt>前20条召回率</dt><dd>{pct(agent.recallAt20)}</dd></div><div><dt>前10条排序质量</dt><dd>{pct(agent.ndcgAt10)}</dd></div><div><dt>拒答与权限</dt><dd>{pct(agent.abstentionAccuracy)}</dd></div></dl><footer><span>{agent.specialGateLabel}</span><b>{agent.specialGateValue <= 1 ? pct(agent.specialGateValue) : agent.specialGateValue}</b></footer></article>)}</div></>; }
function Failures({ run, remediation }: { run?: RagEvaluationRun; remediation?: Dashboard["remediation"] }) { return <><Head kicker="问题样本分析" title="记录问题原因、责任环节和复测结果" text={`整改流程：${remediation?.workflow.join(" → ") ?? "定位责任环节 → 关联修复版本 → 全量测试 → 复测关闭"}`}/>{run?.failures.length ? <div className={styles.failureList}>{run.failures.map((failure) => <article key={failure.caseId}><header><span>{failure.agentId} · {failure.category}</span><b>{failure.severity === "high" ? "高优先级" : "中优先级"}</b></header><h3>{failure.question}</h3><p>{failure.reason}</p><dl><div><dt>责任环节</dt><dd>{failure.ownerStage}</dd></div><div><dt>整改状态</dt><dd>{failure.remediationStatus}</dd></div><div><dt>预期依据</dt><dd>{failure.expectedDocumentId ?? "应拒绝回答"}</dd></div><div><dt>实际依据</dt><dd>{failure.actualDocumentIds.join("、") || "无"}</dd></div></dl><footer>{failure.suggestedAction}</footer></article>)}</div> : <div className={styles.empty}><span>✓</span><strong>当前基础测试没有问题样本</strong><p>300条固定用例均已通过；正式验收仍需甲方授权数据、接口和业务专家确认。</p></div>}</>; }
function History({ dashboard, busy, onBaseline }: { dashboard: Dashboard | null; busy: boolean; onBaseline: (id: string) => Promise<void> }) { return <><Head kicker="版本与基线" title="结果按数据集、索引和模型版本留档"/><div className={styles.historyList}>{dashboard?.runs.map((run,index) => <article key={run.id}><div><span>{run.baseline ? "当前基线" : `运行 ${String(dashboard.runs.length-index).padStart(2,"0")}`}</span><strong>{run.id}</strong><small>{run.completedAt.slice(0,19).replace("T"," ")}</small></div><dl><div><dt>通过</dt><dd>{run.passedCases}/{run.totalCases}</dd></div><div><dt>索引</dt><dd>{run.versions.indexVersion.slice(0,18)}</dd></div><div><dt>模型</dt><dd>{run.versions.model}</dd></div></dl><b className={run.gateStatus === "passed" ? styles.ok : styles.bad}>{run.gateStatus === "passed" ? "质量检查通过" : "质量检查未通过"}</b>{!run.baseline && run.gateStatus === "passed" && <button disabled={busy} onClick={() => void onBaseline(run.id)}>设为基线</button>}</article>)}</div><section className={styles.comparison}><header><strong>当前版本相对基线</strong><span>需结合指标方向判断</span></header>{dashboard?.comparison.map((item) => <div key={item.id}><span>{item.label}</span><b>{item.delta === null ? "—" : `${item.delta >= 0 ? "+" : ""}${item.delta.toFixed(4)}`}</b><em className={item.passed ? styles.ok : styles.bad}>{item.passed ? "指标正常" : "出现退化"}</em></div>)}</section></>; }
function Operations({ dashboard }: { dashboard: Dashboard | null }) { const runtime = dashboard?.runtime; const online = dashboard?.evaluationLayers.online; const onlineHasFindings = online?.status === "observed_with_findings"; return <><Head kicker="运行监控" title="查看模型接口、知识索引和在线抽样结果" text="本页仅反映当前样例实例；正式环境需接入甲方统一监控和告警。"/><div className={styles.runtimeGrid}><article><span>运行状态</span><strong>{runtime?.status === "ready" ? "就绪" : "待配置"}</strong><small>{runtime?.mode === "local" ? "本地检索" : runtime?.mode === "remote" ? "远端模型" : runtime?.mode ?? "—"}</small></article><article><span>已加载知识范围</span><strong>{runtime?.indexedNamespaces ?? 0}</strong><small>当前实例</small></article><article><span>检索问答调用</span><strong>{runtime?.metrics.runs ?? 0}</strong><small>本次服务启动以来</small></article><article><span>备用处理次数</span><strong>{runtime?.metrics.degraded ?? 0}</strong><small>检索及生成</small></article></div><section className={styles.adapters}><header><strong>当前模型接口版本</strong></header><dl><div><dt>生成模型</dt><dd>{runtime?.providers.model ?? "—"}</dd></div><div><dt>向量模型</dt><dd>{runtime?.providers.embedding ?? "—"}</dd></div><div><dt>排序模型</dt><dd>{runtime?.providers.rerank ?? "—"}</dd></div><div><dt>平均运行耗时</dt><dd>{runtime ? `${runtime.metrics.averageDurationMs.toFixed(1)} ms` : "—"}</dd></div></dl></section>
    <section className={styles.onlineEvidence}><header><div><span>真实模型在线抽样</span><strong>{online?.id ?? "—"}</strong></div><b className={onlineHasFindings ? styles.review : styles.ok}>{onlineHasFindings ? "存在待核查项" : "本轮未发现影响使用的问题"}</b></header><div className={styles.onlineStats}><div><span>抽样数量</span><strong>{online?.sampleCount ?? 0}</strong></div><div><span>引用完整度</span><strong>{pct(online?.citationCoverage ?? 0)}</strong></div><div><span>最低结论有据率</span><strong>{pct(online?.minimumGroundingSupport ?? 0)}</strong></div><div><span>95%请求耗时不超过</span><strong>{online?.p95LatencyMs ?? 0} ms</strong></div><div><span>模型用量</span><strong>{online?.totalModelTokens ?? 0}</strong></div></div><p>{online?.finding}</p><div className={styles.onlineAgents}>{online?.agents.map((agent) => <span key={agent.agentId}><b>{agent.agentId}</b>{agent.latencyMs} ms · 模型用量 {agent.modelTokens} · 结论有据率 {pct(agent.groundingSupport)}</span>)}</div></section>
    <section className={styles.alertPolicy}><strong>建议告警规则</strong><p>质量检查未通过、资料召回率或排序质量低于标准、引用完整度下降、出现越权或失效依据、连续启用备用处理或验证失败时，应暂停发布新索引，并恢复到上一稳定版本。</p></section></>; }
