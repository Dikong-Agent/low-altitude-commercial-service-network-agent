"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./page.module.css";

type Dashboard = {
  environment: string; foundationVersion: string; interfaceVersion: string; boundary: string;
  metrics: { total: number; succeeded: number; failed: number; needsReview: number; averageDurationMs: number; p95DurationMs: number };
  interfaces: string[];
  agents: Array<{ id: string; name: string; executionMode: string; provider: string; versions: Record<string,string>; timeoutPolicy: { totalTimeoutMs: number; maxSynchronousMs: number } }>;
  runs: Array<{ traceId: string; agentId: string; status: string; durationMs: number; errorCode?: string; recordedAt: string; versions?: Record<string,string> }>;
};

const runStatusLabels: Record<string, string> = {
  completed: "已完成", needs_review: "待复核", needs_clarification: "待补充信息", failed: "失败", preview: "功能说明",
};
const providerLabel = (value: string) => value === "demo" ? "演示接口" : value === "production" || value === "production-http" ? "正式接口" : value;

export default function RuntimeCenterPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/runtime-center", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "无法读取运行状态");
      if (!cancelled) setDashboard(payload as Dashboard);
    }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "无法读取运行状态"); });
    return () => { cancelled = true; };
  }, []);
  return <main className={styles.page}>
    <header className={styles.topbar}><div><span>JDZ</span><strong>业务智能体运行中心</strong></div><nav><Link href="/">项目介绍</Link><Link href="/experience">样例体验</Link><b>运行中心</b><Link href="/knowledge-admin">知识管理</Link><Link href="/evaluation-center">质量评测</Link></nav></header>
    <section className={styles.hero}><div><span>运行情况</span><h1>查看已注册样例、接口来源和近期运行记录</h1><p>本页记录请求校验、处理流程、外部接口调用、安全检查、异常处理和运行留痕，便于研发联调和问题排查。</p></div><aside><b>{dashboard?.foundationVersion ?? "加载中"}</b><strong>{dashboard?.agents.length ?? "—"}</strong><span>个业务智能体已注册</span><a href="/api/openapi" target="_blank" rel="noreferrer">查看接口说明</a></aside></section>
    {error && <div className={styles.error}>{error}</div>}
    <section className={styles.metrics}><article><span>本次服务调用</span><strong>{dashboard?.metrics.total ?? 0}</strong></article><article><span>正常完成</span><strong>{dashboard?.metrics.succeeded ?? 0}</strong></article><article><span>待人工复核</span><strong>{dashboard?.metrics.needsReview ?? 0}</strong></article><article><span>处理失败</span><strong>{dashboard?.metrics.failed ?? 0}</strong></article><article><span>95%请求耗时不超过</span><strong>{dashboard?.metrics.p95DurationMs ?? 0}<small> ms</small></strong></article></section>
    <section className={styles.contracts}><header><div><span>公共接口</span><h2>七类接口按同一规范接入</h2></div><b>{dashboard?.interfaceVersion ?? "—"}</b></header><div>{dashboard?.interfaces.map((item, index) => <article key={item}><span>{String(index + 1).padStart(2,"0")}</span><strong>{item}</strong></article>)}</div></section>
    <div className={styles.grid}><section><header><div><span>智能体注册信息</span><h2>当前运行清单</h2></div><b>{dashboard?.agents.length ?? 0}</b></header><div className={styles.agentList}>{dashboard?.agents.map((agent) => <article key={agent.id}><div><span>{agent.id}</span><strong>{agent.name}</strong></div><dl><div><dt>执行方式</dt><dd>{agent.executionMode === "async-capable" ? "支持异步处理" : "同步处理"}</dd></div><div><dt>接口来源</dt><dd>{providerLabel(agent.provider)}</dd></div><div><dt>处理流程版本</dt><dd>{agent.versions.workflow}</dd></div></dl></article>)}</div></section>
      <section><header><div><span>近期运行记录</span><h2>最近的脱敏调用记录</h2></div><b>{dashboard?.runs.length ?? 0}</b></header>{dashboard?.runs.length ? <div className={styles.runList}>{dashboard.runs.slice(0,20).map((run) => <article key={run.traceId}><div><span>{run.agentId}</span><b className={run.status === "failed" ? styles.failed : styles.ok}>{runStatusLabels[run.status] ?? run.status}</b></div><strong>{run.traceId}</strong><small>{run.durationMs} ms · {run.recordedAt.slice(0,19).replace("T"," ")}</small>{run.errorCode && <em>{run.errorCode}</em>}</article>)}</div> : <div className={styles.empty}><strong>当前服务暂无调用记录</strong><p>在样例体验页运行一次业务智能体后，本页将显示脱敏运行记录。</p><Link href="/experience">进入样例体验</Link></div>}</section></div>
    <footer className={styles.boundary}>{dashboard?.boundary ?? "正在读取责任边界…"}</footer>
  </main>;
}
