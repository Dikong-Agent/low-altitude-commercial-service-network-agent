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
    id: "AG-002", name: "低空产品说明书解读Agent", shortName: "说明书解读", symbol: "析", tone: "blue", availability: "preview",
    description: "面向长篇产品资料定位关键章节，提炼操作步骤、故障处理与安全注意事项。",
    capabilities: ["文档解析", "原文定位", "步骤提炼"], welcome: "让每一本说明书，都能直接回答问题。",
    demoHint: "当前使用预置样例说明书，可预览操作指导、故障排查和原文定位的目标形态。",
    prompts: ["飞行前需要完成哪些安全检查？请按顺序说明", "设备出现定位漂移时，应优先检查哪些项目？"],
    workflow: "产品说明书智能解读", trace: ["识别问题类型", "解析样例文档", "定位相关章节", "提炼操作步骤", "核验原文依据"],
    traceNotes: ["操作 / 故障 / 安全", "等待 AIPlatformPort 接入", "检索并重排证据", "保留先后与条件", "输出章节定位"],
  },
  {
    id: "AG-003", name: "低空产品分类导购及推荐Agent", shortName: "分类导购", symbol: "荐", tone: "violet", availability: "preview",
    description: "从自然语言提取预算、用途、载荷和环境要求，筛选候选产品并解释推荐理由。",
    capabilities: ["需求理解", "条件筛选", "智能推荐"], welcome: "从一句需求描述，到一组有依据的候选方案。",
    demoHint: "告诉我预算、用途和关键约束，可预览条件提取、筛选与推荐解释的目标形态。",
    prompts: ["需要一套山区电力巡检方案，强调抗风和长续航，如何选？", "为新手推荐适合航拍入门的产品，预算不超过3万元"],
    workflow: "商城场景解决方案推荐", trace: ["提取需求槽位", "检查必要条件", "筛选候选集合", "语义匹配排序", "生成推荐理由"],
    traceNotes: ["预算 / 场景 / 载荷 / 环境", "判断是否需要追问", "执行硬条件规则", "综合适配度", "解释匹配与取舍"],
  },
  {
    id: "AG-012", name: "政策、标准解读Agent", shortName: "政策解读", symbol: "策", tone: "amber", availability: "preview",
    description: "围绕政策与行业标准开展检索问答、要点解释、变化分析和依据引用。",
    capabilities: ["知识检索", "政策解读", "引用溯源"], welcome: "读懂政策变化，也看见每一条结论的依据。",
    demoHint: "当前使用样例政策材料，可预览摘要、问答、变化分析和来源引用的目标形态。",
    prompts: ["概括样例低空政策对运营企业提出的三项核心要求", "新旧政策在飞行活动管理方面有哪些主要变化？"],
    workflow: "政策与适航咨询", trace: ["理解政策问题", "改写检索条件", "检索样例知识库", "重排证据片段", "生成带依据解读"],
    traceNotes: ["识别对象与时间范围", "补全专业术语", "等待 AIPlatformPort 接入", "评估相关性与时效", "引用来源并提示边界"],
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
