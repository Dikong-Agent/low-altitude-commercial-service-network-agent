import type { AgentDefinition, AgentId } from "./contracts";

/** Current engineering scope: four representative business Agent examples. */
export const AGENTS: AgentDefinition[] = [
  {
    id: "AG-001", name: "低空产品型号对比Agent", shortName: "型号对比", symbol: "比", tone: "cyan", availability: "runnable",
    description: "根据使用场景和必要条件核对产品参数，说明型号差异、适用情况和选择建议。",
    capabilities: ["多来源参数核对", "必要条件校验", "选型依据说明"], welcome: "请说明使用场景、候选型号和必要条件。",
    demoHint: "请描述使用场景和必要条件，结果将列出参数换算、资料冲突、条件校验和建议依据。",
    prompts: ["用于山区电力巡检，载荷至少3公斤、抗风至少13米/秒，有合适型号吗？", "预算20万元，用于园区巡检，交付期不超过30天，推荐哪个型号？", "对比云巡 X8 和山岳 T60，重点看续航、载荷和抗风能力"],
    workflow: "产品选型辅助流程", trace: ["理解比较目标", "识别候选产品", "统一参数口径", "评估必要条件", "形成选型建议"],
    traceNotes: ["识别场景、预算、型号与关注重点", "确认需要比较的产品范围", "统一单位并标明缺失信息", "先判断必要条件，再综合比较", "呈现结论、依据与适用说明"],
  },
  {
    id: "AG-012", name: "政策、标准解读Agent", shortName: "政策解读", symbol: "策", tone: "amber", availability: "runnable",
    description: "根据查询时点、业务主体和使用场景核对政策版本与条款，整理要求清单、后续核对步骤和引用依据。",
    capabilities: ["现行版本与条款核验", "适用条件与办理核对清单", "版本变化与影响说明"], welcome: "请说明政策文件、查询时点、业务主体和使用场景。",
    demoHint: "请输入政策或标准问题，结果将列出现行版本、具体要求、条款依据、待补信息和后续核对步骤。",
    prompts: ["根据《无人驾驶航空器飞行管理暂行条例》第十九条、第二十六条和第二十七条，物流企业在景德镇开展低空配送前需要核对哪些事项？", "概括样例低空政策对运营企业提出的三项核心要求", "新旧政策在飞行活动管理方面有哪些主要变化？"],
    workflow: "政策与标准解读流程", trace: ["理解政策问题", "识别相关材料", "核验版本与时效", "定位条款与交叉引用", "整理要求和核对步骤", "形成辅助解读"],
    traceNotes: ["识别文件、条款、主体、地区和查询时点", "隔离政策对象与版本链", "区分有效、待生效和失效版本", "检查指定条款和被引用条款是否齐备", "逐项列出要求、期限、依据和待补信息", "保留地方口径及专业确认事项"],
  },
  {
    id: "AG-025", name: "智能客服Agent", shortName: "智能客服", symbol: "服", tone: "green", availability: "runnable",
    description: "处理商品、订单、售后、服务和投诉等咨询，结合业务资料与专业智能体结果组织答复，并列明待核实事项。",
    capabilities: ["多类咨询识别与转交", "答复依据与问题覆盖检查", "订单时效与人工复核"], welcome: "请输入商品、订单、售后、服务或投诉问题。",
    demoHint: "请输入商品、订单、售后、平台规则或投诉问题，结果将展示答复依据、待核实事项和人工处理建议。",
    prompts: [
      "我想购买巡检无人机，但不知道应该从哪里开始选",
      "帮我查一下订单 JDZ-DEMO-1001 为什么物流还没更新",
      "我们处于融资准备阶段，想了解融资流程和材料清单。已有营业执照、商业计划书和财务报表，还缺什么？",
      "我要投诉订单 JDZ-DEMO-1001，昨天物流一直不更新，希望尽快退款，我有物流截图。",
      "对方让我加微信私下转账，还索要手机号和验证码，应该怎么处理？",
    ],
    workflow: "多Agent客服协同与答复核验流程", trace: ["识别咨询问题", "选择专业能力", "匹配知识与业务信息", "核验数据时效", "检查问题覆盖", "判断人工复核需要"],
    traceNotes: ["识别板块、问题和对象", "仅在四样例范围内调用专业Agent", "保留直接相关依据", "订单信息由客服只读解释", "未答全时列出待核实项", "投诉和高风险事项创建复核工单"],
  },
  {
    id: "AG-027", name: "数据智能分析Agent", shortName: "数据分析", symbol: "数", tone: "blue", availability: "runnable",
    description: "根据经营问题核对指标口径和分析范围，展示趋势、对比结果、分类构成、数据质量和异常线索。",
    capabilities: ["连续指标问数", "趋势对比与维度分析", "异常线索与质量检查"], welcome: "请输入需要分析的指标、时间范围和业务维度。",
    demoHint: "请输入指标、时间范围和分析维度，结果将展示指标口径、趋势对比、分类构成、数据质量和资料来源，并支持继续追问。",
    prompts: ["分析近8周B2C成交额趋势，按品类分解并与前8周比较", "查询转化率", "分析近8周退款率异常，并给出后续下钻方向", "认定某活动导致销量增长并自动调价"],
    workflow: "连续经营指标分析流程", trace: ["加载分析会话", "理解分析问题", "执行指标查询计划", "校验口径、质量和权限", "生成分析结果", "保存分析会话"],
    traceNotes: ["继承已确认的指标和分析范围", "识别指标、周期、维度和对比方式", "读取观测、基准、汇总和来源关系", "阻止口径不清、越权及不可比查询", "不把相关性写成因果关系", "保留上下文供后续分析"],
  },
];

const agentById = new Map<AgentId, AgentDefinition>(AGENTS.map((agent) => [agent.id, agent]));

export function getAgentDefinition(id: string): AgentDefinition | undefined { return agentById.get(id as AgentId); }
export function isRunnableAgent(id: AgentId): boolean { return agentById.get(id)?.availability === "runnable"; }
