import type { AgentDefinition, AgentId } from "./contracts";

export const AGENTS: AgentDefinition[] = [
  {
    id: "AG-001", name: "低空产品型号对比Agent", shortName: "型号对比", symbol: "比", tone: "cyan", availability: "runnable",
    description: "理解选型目标，统一产品参数口径，形成差异结论、场景适配判断与选型建议。",
    capabilities: ["结构化比较", "参数归一", "选型解释"], welcome: "把复杂参数，变成清晰的选型判断。",
    demoHint: "描述候选产品和使用场景，我会给出结构化比较与适配建议。",
    prompts: ["对比云巡 X8 和山岳 T60，重点看续航、载荷和抗风能力", "预算20万元，用于园区巡检，交付期不超过30天，推荐哪个型号？", "用于山区电力巡检，载荷至少3公斤、抗风至少13米/秒，有合适型号吗？"],
    workflow: "LangGraph 产品型号智能比较", trace: ["理解比较目标", "检索候选产品", "统一参数口径", "执行约束与评分", "校验证据并生成建议"],
    traceNotes: ["提取场景、预算、型号与关注指标", "调用 BusinessDataPort", "统一单位、字段与缺失项", "确定性硬约束 + 可解释排序", "输出依据、限制与数据声明"],
  },
  {
    id: "AG-002", name: "低空产品说明书解读Agent", shortName: "说明书解读", symbol: "析", tone: "blue", availability: "runnable",
    description: "理解说明书问题与使用场景，定位关键章节，提炼操作步骤、故障处理、术语解释与风险边界。",
    capabilities: ["场景语义检索", "原文定位", "安全操作指引"], welcome: "让每一本说明书，都能直接回答问题。",
    demoHint: "当前使用虚构样例说明书，可运行摘要、步骤、故障排查、术语转换、风险标注和原文定位。",
    prompts: ["飞行前需要完成哪些安全检查？请按顺序说明", "设备出现定位漂移时，应优先检查哪些项目？", "用通俗的话解释GNSS、返航点和失控保护，并标出原文位置", "概括核心功能、安全事项和合规要求"],
    workflow: "LangGraph 产品说明书智能解读", trace: ["识别问题类型", "加载样例说明书", "解析文档结构", "定位相关章节", "生成通俗化指引", "核验风险与依据", "输出带依据解读"],
    traceNotes: ["操作 / 故障 / 安全 / 术语 / 合规", "调用 DocumentDataPort", "Mock 预解析，正式接入 AIPlatformPort", "样例规则检索；正式语义检索待中台接入", "保留先后、条件和原文位置", "标注风险、禁忌和复核边界", "输出章节页码与数据声明"],
  },
  {
    id: "AG-003", name: "低空产品分类导购及推荐Agent", shortName: "分类导购", symbol: "荐", tone: "violet", availability: "runnable",
    description: "识别场景方案或商品搜索意图，结合预算、用途和关键约束形成可解释候选与差距说明。",
    capabilities: ["场景方案推荐", "商品搜索匹配", "推荐依据生成"], welcome: "从一句需求描述，到一组有依据的候选方案。",
    demoHint: "当前可运行场景方案导购与商品搜索；图片找货和依赖真实行为数据的 C2C 推荐仅预留正式适配接口。",
    prompts: ["需要一套山区电力巡检方案，强调抗风和长续航，如何选？", "为新手推荐适合航拍入门的产品，预算不超过3万元", "帮我搜索云训X8，重点看长续航和抗风"],
    workflow: "LangGraph 商城场景方案与商品推荐", trace: ["理解导购需求", "检查能力边界", "加载样例目录", "执行硬条件筛选", "排序候选集合", "核验适用条件与差距", "输出推荐依据"],
    traceNotes: ["场景 / 预算 / 型号 / 关键约束", "图片与 C2C 能力不伪造", "调用 BusinessDataPort", "先排除约束冲突", "规则评分与相关性排序", "保留正式数据缺口", "输出首选、备选、依据和声明"],
  },
  {
    id: "AG-012", name: "政策、标准解读Agent", shortName: "政策解读", symbol: "策", tone: "amber", availability: "runnable",
    description: "理解政策与标准问题，核验版本时效，检索并重排条款依据，形成摘要、变化分析、适用条件和业务影响解释。",
    capabilities: ["版本时效核验", "条款依据检索", "变化与适用解释"], welcome: "读懂政策变化，也看见每一条结论的依据。",
    demoHint: "当前使用3份虚构政策与标准材料，可运行要点摘要、新旧版本对比、适用条件辅助判断和带条款引用问答；适航资料仅保留正式适配边界。",
    prompts: ["概括样例低空政策对运营企业提出的三项核心要求", "新旧政策在飞行活动管理方面有哪些主要变化？", "我们是样例示范区的物流企业，2026年8月以后开展配送可能要满足哪些条件？", "低空物流安全规范对航线风险和应急演练有什么要求？"],
    workflow: "LangGraph 政策标准检索与版本解读", trace: ["理解政策问题", "加载样例政策库", "核验版本与时效", "检索并重排依据", "生成带依据解读", "核验适用与复核边界", "输出政策解读结果"],
    traceNotes: ["识别文档、时点、主体与场景", "调用 PolicyDataPort", "区分有效、待生效和失效版本", "保留文号、版本和条款位置", "摘要 / 对比 / 适用 / 影响", "高风险结论保留专业确认", "输出依据、限制和数据声明"],
  },
  {
    id: "AG-025", name: "智能客服Agent", shortName: "智能客服", symbol: "服", tone: "green", availability: "preview",
    description: "识别多类业务意图，路由知识问答与工具查询，并在必要时完成转人工协同。",
    capabilities: ["意图识别", "业务路由", "转人工协同"], welcome: "一个服务入口，连接多个业务场景。",
    demoHint: "可预览售前咨询、政策问答、订单问题和复杂问题转人工判断的目标形态。",
    prompts: ["我想购买巡检无人机，但不知道应该从哪里开始选", "订单状态长时间没有更新，应该如何处理？"],
    workflow: "无人值守智能客服", trace: ["识别用户意图", "判断服务路径", "调用知识或工具", "生成业务答复", "评估转人工条件"],
    traceNotes: ["多意图分类", "FAQ / 工具 / 人工", "等待适配层接入", "保持上下文一致", "低置信度自动降级"],
  },
];

const agentById = new Map<AgentId, AgentDefinition>(AGENTS.map((agent) => [agent.id, agent]));

export function getAgentDefinition(id: string): AgentDefinition | undefined {
  return agentById.get(id as AgentId);
}

export function isRunnableAgent(id: AgentId): boolean {
  return agentById.get(id)?.availability === "runnable";
}
