"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ManagedKnowledgeDocument, PublicationEvent, QaSample } from "../lib/knowledge-admin/contracts";
import styles from "./page.module.css";

type Dashboard = {
  documents: ManagedKnowledgeDocument[];
  publications: PublicationEvent[];
  qaSamples: QaSample[];
  stats: { total: number; published: number; inReview: number; parseIssues: number; expiryAlerts: number; qaPending: number };
  alerts: {
    expiry: Array<{ documentId: string; title: string; effectiveTo: string; severity: "expired" | "expiring" }>;
    parse: Array<{ documentId: string; title: string; status: string; message?: string }>;
  };
  index: {
    status: string; mode: string; providers: { model: string; embedding: string; rerank: string };
    capabilities: { lexical: boolean; vector: boolean; rerank: boolean; generation: boolean; persistence: boolean };
    activeIndex?: { indexVersion: string; publishedAt: string; chunkCount: number };
    indexedNamespaces: number;
  };
  persistence: "d1" | "memory";
  updatedAt: string;
};

const agentNames: Record<string, string> = {
  "AG-001": "产品选型与参数比较",
  "AG-012": "政策与标准咨询", "AG-025": "智能客服", "AG-027": "经营指标问数",
};
const lifecycleLabels: Record<string, string> = { draft: "草稿", in_review: "待审核", published: "已发布", superseded: "已替代", withdrawn: "已撤回" };
const parseLabels: Record<string, string> = { pending: "等待解析", parsed: "解析完成", failed: "解析失败", external_service_required: "等待外部解析" };
const supportedTextExtensions = new Set(["txt", "md", "markdown", "json", "csv", "tsv"]);

async function apiAction(body: unknown): Promise<void> {
  const response = await fetch("/api/knowledge-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { message?: string };
  if (!response.ok) throw new Error(payload.message ?? "操作未完成");
}

export default function KnowledgeAdminPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"assets" | "register" | "alerts" | "index" | "qa">("assets");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    agentId: "AG-001", title: "", documentType: "业务知识", domain: "product-master",
    sourceOrganization: "项目演示知识维护组（虚构）", sourceNature: "项目自编虚构演示材料", version: "v1.0",
    effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "", confidentiality: "内部演示",
    visibilityRoles: "*", reviewOwner: "业务知识维护岗",
  });

  async function load() {
    try {
      const response = await fetch("/api/knowledge-admin", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "无法读取知识资产");
      setDashboard(payload as Dashboard); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "无法读取知识资产"); }
  }
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/knowledge-admin", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "无法读取知识资产");
      if (!cancelled) { setDashboard(payload as Dashboard); setError(""); }
    }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "无法读取知识资产"); });
    return () => { cancelled = true; };
  }, []);

  const selected = dashboard?.documents.find((item) => item.id === selectedId) ?? null;
  const visibleDocuments = useMemo(() => (dashboard?.documents ?? []).filter((item) => {
    const matchesFilter = filter === "all" || item.agentId === filter || item.lifecycleStatus === filter || (filter === "parse_issue" && item.parseStatus !== "parsed");
    const keyword = query.trim().toLowerCase();
    return matchesFilter && (!keyword || `${item.id} ${item.title} ${item.domain} ${item.sourceOrganization}`.toLowerCase().includes(keyword));
  }), [dashboard, filter, query]);

  async function run(body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await apiAction(body); await load(); setNotice(success); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作未完成"); }
    finally { setBusy(false); }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (!file) { setError("请选择需要登记的知识文件"); return; }
    const ext = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    const content = supportedTextExtensions.has(ext) || file.type.startsWith("text/") ? await file.text() : "";
    await run({ action: "register", payload: { metadata: {
      ...form, effectiveTo: form.effectiveTo || null,
      visibilityRoles: form.visibilityRoles.split(",").map((item) => item.trim()).filter(Boolean),
    }, file: { name: file.name, type: file.type || "application/octet-stream", content } } }, "知识资产已登记，请检查解析结果并提交审核。");
    setTab("assets"); setFile(null);
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}><span>JDZ</span><div><strong>业务智能体知识管理</strong><small>内部管理页面 · 样例环境</small></div></div>
        <nav><Link href="/">项目介绍</Link><Link href="/experience">样例体验</Link><b>知识管理</b><Link href="/evaluation-center">质量评测</Link></nav>
      </header>

      <section className={styles.hero}>
        <div><span>知识资料管理</span><h1>统一登记业务智能体使用的知识资料</h1><p>记录资料来源、版本、有效期、访问范围、内容分段和发布状态，为4个可运行样例提供可核查的检索依据。</p></div>
        <aside><b>职责说明</b><p>本页负责智能体侧的知识分类、检索依据和抽查记录。通用文字识别及文档解析服务由甲方AI中台提供；权威业务数据由数据中台和业务系统提供。</p></aside>
      </section>

      {error && <div className={styles.error}><b>操作提示</b>{error}<button onClick={() => setError("")}>关闭</button></div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.metrics}>
        <article><span>知识资产</span><strong>{dashboard?.stats.total ?? "—"}</strong><small>已登记文档</small></article>
        <article><span>当前发布</span><strong>{dashboard?.stats.published ?? "—"}</strong><small>可供样例检索</small></article>
        <article><span>待审核</span><strong>{dashboard?.stats.inReview ?? "—"}</strong><small>等待发布确认</small></article>
        <article><span>资料提醒</span><strong>{dashboard ? dashboard.stats.parseIssues + dashboard.stats.expiryAlerts : "—"}</strong><small>解析异常与有效期提醒</small></article>
        <article><span>问答抽检</span><strong>{dashboard?.stats.qaPending ?? "—"}</strong><small>待人工复核</small></article>
      </section>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <button className={tab === "assets" ? styles.active : ""} onClick={() => setTab("assets")}><span>01</span>知识资产台账</button>
          <button className={tab === "register" ? styles.active : ""} onClick={() => setTab("register")}><span>02</span>登记与解析</button>
          <button className={tab === "alerts" ? styles.active : ""} onClick={() => setTab("alerts")}><span>03</span>资料提醒</button>
          <button className={tab === "index" ? styles.active : ""} onClick={() => setTab("index")}><span>04</span>索引与发布</button>
          <button className={tab === "qa" ? styles.active : ""} onClick={() => setTab("qa")}><span>05</span>问答抽样复核</button>
          <div><small>当前存储方式</small><strong>{dashboard?.persistence === "d1" ? "D1持久化存储" : "临时内存存储"}</strong><p>{dashboard?.persistence === "d1" ? "管理状态可在服务重启后保留。" : "服务重启后，新登记的数据将被清除。"}</p></div>
        </aside>

        <section className={styles.content}>
          {tab === "assets" && <>
            <header className={styles.sectionHead}><div><span>知识资料台账</span><h2>查看资料状态、版本和维护责任</h2></div><button onClick={() => setTab("register")}>+ 登记知识资料</button></header>
            <div className={styles.filters}>
              <input aria-label="搜索知识资产" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识编号、标题、领域或来源单位" />
              <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="筛选知识资料">
                <option value="all">全部资料</option>{Object.entries(agentNames).map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}
                <option value="draft">草稿</option><option value="in_review">待审核</option><option value="published">已发布</option><option value="withdrawn">已撤回</option><option value="parse_issue">解析异常</option>
              </select>
            </div>
            <div className={styles.tableWrap}><table><thead><tr><th>知识资料</th><th>归属智能体</th><th>版本</th><th>解析</th><th>资料状态</th><th>更新日期</th></tr></thead><tbody>
              {visibleDocuments.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)} className={selectedId === item.id ? styles.selectedRow : ""}>
                <td><strong>{item.title}</strong><small>{item.id} · {item.documentType}</small></td><td>{item.agentId}<small>{agentNames[item.agentId]}</small></td><td>{item.version}</td>
                <td><span className={`${styles.tag} ${styles[`parse_${item.parseStatus}`]}`}>{parseLabels[item.parseStatus]}</span><small>{item.chunks.length} 个分块</small></td>
                <td><span className={`${styles.tag} ${styles[`life_${item.lifecycleStatus}`]}`}>{lifecycleLabels[item.lifecycleStatus]}</span></td><td>{item.updatedAt.slice(0, 10)}</td>
              </tr>)}
            </tbody></table></div>
            {selected && <DocumentDetail key={`${selected.id}:${selected.updatedAt}`} document={selected} busy={busy} onRun={run} onClose={() => setSelectedId(null)} />}
          </>}

          {tab === "register" && <>
            <header className={styles.sectionHead}><div><span>登记与解析</span><h2>登记来源、版本和责任信息后提交审核</h2></div></header>
            <form className={styles.registerForm} onSubmit={register}>
              <div className={styles.formGrid}>
                <label>归属智能体<select value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>{Object.entries(agentNames).map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}</select></label>
                <label>知识标题<input required minLength={2} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                <label>文档类型<input required value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} /></label>
                <label>知识领域<input required value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></label>
                <label>来源单位<input required value={form.sourceOrganization} onChange={(e) => setForm({ ...form, sourceOrganization: e.target.value })} /></label>
                <label>来源性质<input required value={form.sourceNature} onChange={(e) => setForm({ ...form, sourceNature: e.target.value })} /></label>
                <label>版本号<input required value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></label>
                <label>审核责任人<input required value={form.reviewOwner} onChange={(e) => setForm({ ...form, reviewOwner: e.target.value })} /></label>
                <label>生效日期<input required type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></label>
                <label>失效日期<input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} /></label>
                <label>保密等级<input required value={form.confidentiality} onChange={(e) => setForm({ ...form, confidentiality: e.target.value })} /></label>
                <label>可见角色<input required value={form.visibilityRoles} onChange={(e) => setForm({ ...form, visibilityRoles: e.target.value })} /><small>多个角色用英文逗号分隔；* 表示演示公开。</small></label>
              </div>
              <label className={styles.fileDrop}><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept=".txt,.md,.markdown,.json,.csv,.tsv,.pdf,.doc,.docx,.png,.jpg,.jpeg" /><strong>{file ? file.name : "选择需要登记的知识文件"}</strong><span>TXT、Markdown、JSON 和 CSV 文件可在本系统解析；PDF、Office 文档和图片需等待甲方AI中台提供解析或文字识别服务。</span></label>
              <div className={styles.formActions}><button type="button" onClick={() => setTab("assets")}>取消</button><button disabled={busy} type="submit">{busy ? "正在登记…" : "登记并解析"}</button></div>
            </form>
          </>}

          {tab === "alerts" && <Alerts dashboard={dashboard} onSelect={(id) => { setSelectedId(id); setTab("assets"); }} />}
          {tab === "index" && <IndexPanel dashboard={dashboard} />}
          {tab === "qa" && <QaPanel dashboard={dashboard} busy={busy} onRun={run} />}
        </section>
      </div>
    </main>
  );
}

function DocumentDetail({ document, busy, onRun, onClose }: { document: ManagedKnowledgeDocument; busy: boolean; onRun: (body: unknown, success: string) => Promise<void>; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [patch, setPatch] = useState({ title: document.title, version: document.version, reviewOwner: document.reviewOwner, confidentiality: document.confidentiality });
  return <div className={styles.drawer}><header><div><small>{document.id}</small><h3>{document.title}</h3></div><button onClick={onClose}>×</button></header>
    <div className={styles.drawerState}><span className={`${styles.tag} ${styles[`life_${document.lifecycleStatus}`]}`}>{lifecycleLabels[document.lifecycleStatus]}</span><span className={`${styles.tag} ${styles[`parse_${document.parseStatus}`]}`}>{parseLabels[document.parseStatus]}</span><b>{document.chunks.length} 个分块</b></div>
    {document.lastError && <p className={styles.issueText}>{document.lastError}</p>}
    {!editing ? <dl className={styles.metaGrid}><div><dt>来源单位</dt><dd>{document.sourceOrganization}</dd></div><div><dt>来源性质</dt><dd>{document.sourceNature}</dd></div><div><dt>知识领域</dt><dd>{document.domain}</dd></div><div><dt>文档版本</dt><dd>{document.version}</dd></div><div><dt>生效区间</dt><dd>{document.effectiveFrom ?? "未设置"} — {document.effectiveTo ?? "长期"}</dd></div><div><dt>访问范围</dt><dd>{document.confidentiality} · {document.visibilityRoles.join(", ")}</dd></div><div><dt>审核责任人</dt><dd>{document.reviewOwner}</dd></div><div><dt>索引版本</dt><dd>{document.publishedIndexVersion ?? "尚未发布"}</dd></div></dl>
      : <div className={styles.editGrid}><label>知识标题<input value={patch.title} onChange={(e) => setPatch({ ...patch, title: e.target.value })} /></label><label>版本号<input value={patch.version} onChange={(e) => setPatch({ ...patch, version: e.target.value })} /></label><label>审核责任人<input value={patch.reviewOwner} onChange={(e) => setPatch({ ...patch, reviewOwner: e.target.value })} /></label><label>保密等级<input value={patch.confidentiality} onChange={(e) => setPatch({ ...patch, confidentiality: e.target.value })} /></label></div>}
    <section className={styles.chunks}><header><strong>分块预览</strong><span>仅展示前 4 个分块</span></header>{document.chunks.slice(0, 4).map((chunk) => <article key={chunk.chunkId}><b>{String(chunk.order).padStart(2, "0")}</b><p>{chunk.excerpt}</p><small>{chunk.characters} 字符</small></article>)}{!document.chunks.length && <p>当前没有可预览分块。</p>}</section>
    <section className={styles.revisions}><strong>版本记录</strong><span>{document.revisions.length} 个历史快照</span>{document.revisions.slice(-3).reverse().map((item) => <p key={item.revisionId}><b>{item.version}</b>{item.reason}<small>{item.createdAt.slice(0, 16).replace("T", " ")}</small></p>)}</section>
    <footer>
      {!editing && document.lifecycleStatus !== "published" && <button onClick={() => setEditing(true)}>编辑元数据</button>}
      {editing && <><button onClick={() => setEditing(false)}>取消编辑</button><button disabled={busy} onClick={() => void onRun({ action: "update_metadata", documentId: document.id, patch }, "元数据已保存并生成修订快照。")}>保存元数据</button></>}
      {document.lifecycleStatus === "draft" && document.parseStatus === "parsed" && <button disabled={busy} onClick={() => void onRun({ action: "submit_review", documentId: document.id }, "知识资产已提交审核。")}>提交审核</button>}
      {document.lifecycleStatus === "in_review" && <button disabled={busy} className={styles.primaryAction} onClick={() => void onRun({ action: "publish", documentId: document.id }, "审核通过，知识资产已发布到检索索引。")}>审核通过并发布</button>}
      {document.lifecycleStatus === "published" && <button disabled={busy} className={styles.dangerAction} onClick={() => void onRun({ action: "withdraw", documentId: document.id }, "知识资产已从检索索引撤回。")}>撤回索引</button>}
      {document.revisions.length > 0 && document.lifecycleStatus === "withdrawn" && <button disabled={busy} onClick={() => void onRun({ action: "rollback", documentId: document.id }, "历史版本已恢复并重新发布。")}>回滚最近版本</button>}
    </footer>
  </div>;
}

function Alerts({ dashboard, onSelect }: { dashboard: Dashboard | null; onSelect: (id: string) => void }) {
  return <><header className={styles.sectionHead}><div><span>资料提醒</span><h2>集中处理有效期风险与解析异常</h2></div></header><div className={styles.alertColumns}>
    <section><header><strong>有效期提醒</strong><b>{dashboard?.alerts.expiry.length ?? 0}</b></header>{dashboard?.alerts.expiry.map((item) => <button key={item.documentId} onClick={() => onSelect(item.documentId)}><span className={item.severity === "expired" ? styles.redDot : styles.amberDot} /><div><strong>{item.title}</strong><small>{item.severity === "expired" ? "已超过有效期" : "30 日内到期"} · {item.effectiveTo}</small></div></button>)}{!dashboard?.alerts.expiry.length && <p>当前没有临期知识资产。</p>}</section>
    <section><header><strong>解析异常</strong><b>{dashboard?.alerts.parse.length ?? 0}</b></header>{dashboard?.alerts.parse.map((item) => <button key={item.documentId} onClick={() => onSelect(item.documentId)}><span className={styles.redDot} /><div><strong>{item.title}</strong><small>{parseLabels[item.status]} · {item.message}</small></div></button>)}{!dashboard?.alerts.parse.length && <p>当前没有解析异常。</p>}</section>
  </div></>;
}

function IndexPanel({ dashboard }: { dashboard: Dashboard | null }) {
  const index = dashboard?.index;
  return <><header className={styles.sectionHead}><div><span>索引与发布</span><h2>查看检索配置、模型接口和发布记录</h2></div></header>
    <div className={styles.indexGrid}><article><span>运行状态</span><strong>{index?.status === "ready" ? "服务就绪" : "待配置"}</strong><small>方式：{index?.mode === "local" ? "本地检索" : index?.mode === "remote" ? "远端模型" : index?.mode ?? "—"}</small></article><article><span>已加载知识范围</span><strong>{index?.indexedNamespaces ?? 0}</strong><small>当前运行实例</small></article><article><span>最近知识版本</span><strong>{index?.activeIndex?.indexVersion?.slice(0, 12) ?? "暂无"}</strong><small>{index?.activeIndex ? `${index.activeIndex.chunkCount} 个知识片段` : "发布后自动生成"}</small></article></div>
    <section className={styles.providerPanel}><header><strong>模型与检索配置</strong><span>配置来自当前服务环境</span></header><dl><div><dt>生成模型</dt><dd>{index?.providers.model ?? "—"}</dd></div><div><dt>向量模型</dt><dd>{index?.providers.embedding ?? "—"}</dd></div><div><dt>排序模型</dt><dd>{index?.providers.rerank ?? "—"}</dd></div><div><dt>检索方式</dt><dd>关键词 {index?.capabilities.lexical ? "可用" : "停用"} · 向量 {index?.capabilities.vector ? "可用" : "停用"}</dd></div></dl></section>
    <section className={styles.publicationLog}><header><strong>发布审计记录</strong><span>最近 50 条</span></header>{dashboard?.publications.slice(0, 20).map((item) => <article key={item.id}><span>{item.action === "publish" ? "发布" : item.action === "withdraw" ? "撤回" : item.action === "rollback" ? "回滚" : "基线"}</span><div><strong>{item.documentId} · {item.version}</strong><p>{item.detail}</p></div><time>{item.createdAt.slice(0, 16).replace("T", " ")}</time></article>)}</section>
  </>;
}

function QaPanel({ dashboard, busy, onRun }: { dashboard: Dashboard | null; busy: boolean; onRun: (body: unknown, success: string) => Promise<void> }) {
  return <><header className={styles.sectionHead}><div><span>问答抽样复核</span><h2>按业务问题核对检索范围和答复依据</h2></div></header><div className={styles.qaList}>{dashboard?.qaSamples.map((item) => <article key={item.id}><header><span>{item.agentId}</span><b className={`${styles.tag} ${item.result === "pass" ? styles.life_published : item.result === "fail" ? styles.parse_failed : ""}`}>{item.result === "pending" ? "待复核" : item.result === "pass" ? "通过" : "未通过"}</b></header><h3>{item.question}</h3><p>预期知识：{item.expectedKnowledgeIds.join("、") || "待配置"}</p><small>{item.note}</small><footer><button disabled={busy} onClick={() => void onRun({ action: "qa_review", sampleId: item.id, result: "pass", note: "抽样结果与预期知识范围一致。" }, "抽样结果已记录为通过。")}>记录通过</button><button disabled={busy} onClick={() => void onRun({ action: "qa_review", sampleId: item.id, result: "fail", note: "检索结果或答复依据需要调整。" }, "抽样结果已记录为未通过。")}>记录问题</button></footer></article>)}</div></>;
}
