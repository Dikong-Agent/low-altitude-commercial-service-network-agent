import { SHOWCASE_AGENTS } from "./lib/showcase-agents";
import Link from "next/link";

const showcaseMeta = {
  "AG-027": { category: "经营分析", outcome: "形成指标口径、趋势异常、质量状态与待验证原因线索", value: "支持业务人员通过自然语言开展有口径、有依据的经营问数" },
  "AG-012": { category: "政策服务", outcome: "核验版本时效，引用条款依据并解释适用条件", value: "减少政策版本混用和无依据解读" },
  "AG-025": { category: "平台服务", outcome: "判断咨询类型，结合知识资料、业务信息与专业智能体结果组织答复", value: "在统一服务入口处理多类咨询，并将专业问题交给相应业务智能体" },
  "AG-001": { category: "产品服务", outcome: "形成结构化参数对比、必要条件校验与选型建议", value: "降低多型号、多参数条件下的比较与解释成本" },
} as const;

const capabilityFramework = [
  { index: "01", title: "业务问题理解", text: "识别用户目标、业务对象、关键条件和待补充信息。" },
  { index: "02", title: "知识与数据关联", text: "在授权范围内关联样例知识、业务记录和规则依据。" },
  { index: "03", title: "业务分析与处理", text: "根据场景要求进行条件判断、候选匹配、内容整理或辅助分析。" },
  { index: "04", title: "依据与边界说明", text: "列明结果依据、限制条件和需要人工复核的事项。" },
];

export default function ProjectIntroduction() {
  return (
    <main className="intro-page">
      <header className="official-header">
        <a className="official-brand" href="#overview" aria-label="返回项目概览">
          <span className="official-brand-mark">JDZ</span>
          <span><strong>景德镇低空商业服务网</strong><small>业务智能体阶段成果</small></span>
        </a>
        <nav aria-label="项目导航">
          <a href="#overview">项目概览</a>
          <a href="#samples">样例能力</a>
          <a href="#framework">建设说明</a>
          <Link href="/knowledge-admin">知识管理</Link>
          <Link href="/evaluation-center">质量评测</Link>
          <Link href="/runtime-center">运行中心</Link>
        </nav>
        <Link className="header-experience-link" href="/experience">进入样例体验</Link>
      </header>

      <section className="official-hero" id="overview">
        <div className="official-hero-copy">
          <span className="official-kicker">阶段性建设成果</span>
          <h1>景德镇低空商业服务网<br />业务智能体样例展示</h1>
          <p>本页集中展示经营问数、政策解读、客户服务和型号比较四类业务场景，并说明每个样例的处理方式、结果依据和适用范围。</p>
          <div className="official-hero-actions">
            <Link className="official-primary-button" href="/experience">进入样例体验</Link>
            <a className="official-secondary-button" href="#samples">查看样例说明</a>
            <Link className="official-secondary-button" href="/knowledge-admin">进入知识管理</Link>
            <Link className="official-secondary-button" href="/evaluation-center">查看质量评测</Link>
            <Link className="official-secondary-button" href="/runtime-center">查看运行中心</Link>
          </div>
          <div className="official-boundary-note"><span>说明</span> 当前页面使用虚构样例数据，展示结果不作为正式业务结论或执行依据。</div>
        </div>
        <div className="official-status-panel" aria-label="项目阶段概览">
          <header><span>当前建设进展</span><b>场景样例验证阶段</b></header>
          <div className="official-status-main">
            <strong>6</strong><span>个重点业务样例可供体验</span>
            <p>当前已形成4个可运行工程样例，供现场演示和方案沟通使用。每个样例均展示问题输入、处理过程、结果依据及复核事项。</p>
          </div>
          <dl>
            <div><dt>总体规划</dt><dd>28个业务智能体</dd></div>
            <div><dt>当前展示成果</dt><dd>4个重点样例</dd></div>
            <div><dt>当前样例类型</dt><dd>经营问数、知识解读、客服协同、产品决策</dd></div>
          </dl>
        </div>
      </section>

      <section className="official-summary-section">
        <div className="official-section-heading compact">
          <span>项目概览</span>
          <h2>按业务场景展示阶段成果</h2>
          <p>每个样例均说明处理的问题、使用的依据、返回的结果以及需要人工确认的事项。</p>
        </div>
        <div className="official-summary-grid">
          <article><span>01</span><h3>面向实际问题</h3><p>围绕经营问数、政策咨询、客户服务、文档查询和产品决策等常见问题设置样例。</p></article>
          <article><span>02</span><h3>结果依据可查</h3><p>结果保留适用条件、引用依据、候选差距和限制，供业务人员核对。</p></article>
          <article><span>03</span><h3>明确使用边界</h3><p>业务智能体提供辅助分析和内容整理，正式发布、交易、审批和处置仍由业务系统或人工完成。</p></article>
        </div>
      </section>

      <section className="official-samples-section" id="samples">
        <div className="official-section-heading">
          <span>重点样例</span>
          <h2>当前可体验的业务智能体样例</h2>
          <p>以下为当前可运行的4个工程样例，不代表28个业务智能体均已完成开发。</p>
        </div>
        <div className="official-sample-grid">
          {SHOWCASE_AGENTS.map((agent, index) => {
            const meta = showcaseMeta[agent.id as keyof typeof showcaseMeta];
            return (
              <article key={agent.id} className="official-sample-card">
                <header><span>{String(index + 1).padStart(2, "0")}</span><b>{meta.category}</b></header>
                <div className="official-sample-title"><i>{agent.symbol}</i><div><small>{agent.id}</small><h3>{agent.name}</h3></div></div>
                <p>{agent.description}</p>
                <dl><div><dt>主要结果</dt><dd>{meta.outcome}</dd></div><div><dt>业务价值</dt><dd>{meta.value}</dd></div></dl>
                <Link href="/experience">进入体验 <span>→</span></Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="official-framework-section" id="framework">
        <div className="official-section-heading light">
          <span>建设说明</span>
          <h2>样例共用规范与对接边界</h2>
          <p>4个样例采用一致的输入、输出、安全和复核规范；取得甲方正式接口后，可按统一规范完成对接。</p>
        </div>
        <div className="official-framework-grid">
          {capabilityFramework.map((item) => <article key={item.index}><span>{item.index}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}
        </div>
        <div className="official-responsibility-strip">
          <div><span>我方负责</span><strong>问题理解、资料匹配、辅助分析、内容整理与结果说明</strong></div>
          <div><span>外部提供</span><strong>模型服务、权威数据、业务状态与正式执行接口</strong></div>
          <div><span>人工复核</span><strong>安全、合规、合同、保险、资质及其他高风险事项</strong></div>
        </div>
      </section>

      <section className="official-cta-section">
        <div><span>样例体验</span><h2>选择场景，查看实际处理结果</h2><p>体验页面将展示问题输入、处理结果、引用依据和需要复核的事项。</p></div>
        <Link href="/experience">进入样例体验 <span>→</span></Link>
      </section>

      <footer className="official-footer">
        <div className="official-brand"><span className="official-brand-mark">JDZ</span><span><strong>景德镇低空商业服务网</strong><small>业务智能体阶段成果</small></span></div>
        <p>4个业务智能体工程样例</p>
        <span>样例环境 · 虚构数据 · 结果仅供展示验证</span>
      </footer>
    </main>
  );
}
