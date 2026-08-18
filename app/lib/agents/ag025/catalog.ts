import type { CustomerOrderSnapshot, CustomerProductSnapshot, CustomerServiceGuide, CustomerServiceKnowledgeEntry } from "./types";

export const DEMO_CUSTOMER_SERVICE_KNOWLEDGE: CustomerServiceKnowledgeEntry[] = [
  { id: "FAQ-PLATFORM-PAYMENT", title: "样例平台支付方式说明", domain: "platform", issueType: "general_rule", answer: "样例平台支持在线支付；实际可用方式、额度和到账状态应以订单结算页及支付机构结果为准。", keywords: ["支付", "付款", "结算"], sourceRef: "样例平台规则库 · 支付说明 v0.3-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-PLATFORM-MEMBER", title: "样例会员权益说明", domain: "platform", issueType: "general_rule", answer: "会员权益按样例等级展示咨询优先级与活动信息；正式权益、有效期和适用范围需以业务系统记录为准。", keywords: ["会员", "权益", "等级"], sourceRef: "样例平台规则库 · 会员说明 v0.2-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-PLATFORM-INVOICE", title: "样例平台开票办理说明", domain: "platform", issueType: "general_rule", answer: "开票前需核对订单主体、发票类型、抬头和税号；可开票范围、开具状态及最终票面信息以订单和财务系统记录为准。", keywords: ["发票", "开票", "抬头", "税号"], sourceRef: "样例平台规则库 · 开票说明 v0.1-demo", updatedAt: "2026-08-17" },
  { id: "FAQ-COMMUNICATION-SAFETY", title: "样例平台沟通与交易安全提示", domain: "platform", issueType: "violation", answer: "平台沟通中不应索取无关证件、账号或完整联系方式，也不应引导站外付款。遇到冒充身份、异常收款、紧迫催促或威胁内容时，应保留会话和订单信息并交由运营人员复核。", keywords: ["诈骗", "转账", "微信", "银行卡", "身份证", "手机号", "站外", "威胁", "辱骂", "骚扰"], sourceRef: "样例平台规则库 · 沟通安全 v0.1-demo", updatedAt: "2026-08-17" },
  { id: "FAQ-AFTER-SALES", title: "样例退换与维修办理说明", domain: "product_mall", issueType: "after_sales", answer: "请先核对订单、商品状态和问题类型，再由售后人员确认是否满足退换或维修条件；智能客服不会直接批准退款、退货或维修结论。", keywords: ["退货", "换货", "退款", "维修", "售后", "故障"], sourceRef: "样例售后规则库 · 办理流程 v0.4-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-COMPLAINT-HANDOFF", title: "样例投诉受理信息说明", domain: "platform", issueType: "complaint", answer: "投诉受理需记录问题主题、涉及对象、发生时间、核心诉求和可核验材料。智能客服仅负责整理信息和生成转接建议，受理、调查、处置与结果通知由业务系统及人工岗位完成。", keywords: ["投诉", "不满", "曝光", "一直不处理", "欺骗"], sourceRef: "样例客服规则库 · 投诉受理 v0.1-demo", updatedAt: "2026-08-17", checklistItems: ["问题主题", "涉及对象或订单号", "发生时间", "核心诉求", "可核验材料"] },
  { id: "FAQ-PRODUCT-SELECTION", title: "样例低空产品选型入口说明", domain: "product_mall", issueType: "product", answer: "产品选型需要补充用途、候选型号、预算、载荷、续航和环境条件；可转入 AG-001 核对型号参数、必要条件和适用差异。", keywords: ["购买", "选型", "推荐", "巡检", "无人机", "产品"], sourceRef: "样例商城知识库 · 选型入口 v0.4-demo", updatedAt: "2026-08-17" },
  { id: "FAQ-FLIGHT-SERVICE", title: "样例飞行服务咨询说明", domain: "flight_service", issueType: "service", answer: "飞行服务咨询可先说明地区、时间、任务类型和航空器情况；涉及空域、天气与监管条件时需转相应专业服务确认。", keywords: ["飞行服务", "空域", "飞行", "报备", "航线"], sourceRef: "样例服务知识库 · 飞行服务 v0.2-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-TECH-SERVICE", title: "样例技术服务咨询说明", domain: "technical_service", issueType: "service", answer: "技术服务咨询应补充设备型号、故障现象、发生条件和已尝试步骤；涉及安全风险时停止操作并由专业人员处理。", keywords: ["技术服务", "故障", "维修", "调试", "设备"], sourceRef: "样例服务知识库 · 技术服务 v0.2-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-FINANCE-PROCESS", title: "样例投融资咨询流程说明", domain: "commercial_service", issueType: "finance", answer: "一般可按融资目标与阶段梳理、沟通材料准备、机构接洽、尽调沟通和协议讨论推进。融资方式、估值、条款与机构要求需结合企业情况由专业人员确认。", keywords: ["投融资", "融资", "投资机构", "估值", "尽调", "股权融资"], sourceRef: "样例商业服务知识库 · 投融资流程 v0.1-demo", updatedAt: "2026-08-17", checklistItems: ["企业基本资料", "商业计划或项目说明", "融资用途与规模", "近年财务资料", "股权结构", "核心团队与业务证明"] },
  { id: "FAQ-FINANCE-MATERIALS", title: "样例融资沟通材料说明", domain: "commercial_service", issueType: "finance", answer: "融资沟通材料通常包括企业基本资料、项目或商业计划、融资用途与规模、财务资料、股权结构和核心团队说明。不同机构与阶段的具体要求可能不同，清单仅用于前期准备。", keywords: ["融资材料", "商业计划书", "融资计划", "财务报表", "股权结构", "材料清单"], sourceRef: "样例商业服务知识库 · 融资材料 v0.1-demo", updatedAt: "2026-08-17", checklistItems: ["企业基本资料", "商业计划或项目说明", "融资用途与规模", "近年财务资料", "股权结构", "核心团队与业务证明"] },
  { id: "FAQ-CREDIT-PROCESS", title: "样例企业信贷咨询流程说明", domain: "commercial_service", issueType: "credit", answer: "一般可按资金用途确认、产品与条件了解、材料准备、机构审核和结果反馈推进。授信额度、利率、期限、担保要求和审批结果均以金融机构正式结论为准。", keywords: ["信贷", "贷款", "授信", "利率", "还款", "担保"], sourceRef: "样例商业服务知识库 · 企业信贷流程 v0.1-demo", updatedAt: "2026-08-17", checklistItems: ["企业基本资料", "经营与财务资料", "纳税或经营流水", "资金用途说明", "还款来源说明", "机构要求的增信材料"] },
  { id: "FAQ-CREDIT-MATERIALS", title: "样例企业信贷材料说明", domain: "commercial_service", issueType: "credit", answer: "信贷沟通通常需准备企业基本资料、经营与财务资料、纳税或经营流水、资金用途、还款来源及机构要求的增信材料。材料是否充分和是否符合申请条件由金融机构审核。", keywords: ["贷款材料", "信贷材料", "营业执照", "纳税", "流水", "还款来源", "申请材料"], sourceRef: "样例商业服务知识库 · 企业信贷材料 v0.1-demo", updatedAt: "2026-08-17", checklistItems: ["企业基本资料", "经营与财务资料", "纳税或经营流水", "资金用途说明", "还款来源说明", "机构要求的增信材料"] },
];

export const DEMO_CUSTOMER_ORDERS: CustomerOrderSnapshot[] = [
  { id: "JDZ-DEMO-1001", status: "shipped", statusLabel: "已发货", productName: "样例·云巡 X8 巡检无人机", updatedAt: "2026-07-25 09:30", logisticsSummary: "样例物流记录显示商品已从演示仓发出，但此后没有新的物流节点。", nextStep: "该记录已明显滞后，需由人工客服或承运商核查当前在途状态。", promisedBy: null, anomalyReason: "物流轨迹自2026-07-25后未更新，具体停滞原因尚未回传。", sourceRef: "MockOrderData · JDZ-DEMO-1001" },
  { id: "JDZ-DEMO-1002", status: "after_sales", statusLabel: "售后审核中", productName: "样例·航拍入门套装", updatedAt: "2026-07-26 14:10", logisticsSummary: "样例售后记录已收件，等待人工核验商品状态。", nextStep: "无需重复提交；最终退款或换货结论由售后人员依据正式规则确认。", promisedBy: null, anomalyReason: null, sourceRef: "MockOrderData · JDZ-DEMO-1002" },
];

export const DEMO_CUSTOMER_PRODUCTS: CustomerProductSnapshot[] = [
  { id: "DEMO-X8", name: "样例·云巡 X8 巡检无人机", category: "行业巡检无人机", suitableFor: ["园区巡检", "常规电力巡检"], purchaseConditions: ["需核对实际载荷任务", "需确认作业环境与合规条件"], sourceRef: "MockProductData · DEMO-X8" },
  { id: "DEMO-T60", name: "样例·山岳 T60 复合翼无人机", category: "长航时复合翼无人机", suitableFor: ["山区巡检", "长距离测绘"], purchaseConditions: ["需要起降与回收条件", "需核对操作资质和任务许可"], sourceRef: "MockProductData · DEMO-T60" },
];

export const DEMO_CUSTOMER_SERVICE_GUIDES: CustomerServiceGuide[] = [
  { id: "SVC-FLIGHT", serviceType: "飞行服务", summary: "提供飞行任务相关咨询入口。", nextStep: "补充地区、时间和任务类型后转飞行服务专席。", sourceRef: "MockServiceData · SVC-FLIGHT" },
  { id: "SVC-TECH", serviceType: "技术服务", summary: "提供设备故障和技术支持咨询入口。", nextStep: "补充设备型号、故障现象和安全状态后转技术服务专席。", sourceRef: "MockServiceData · SVC-TECH" },
  { id: "SVC-COMMERCIAL", serviceType: "商业服务", summary: "提供投融资、信贷等商业服务入口。", nextStep: "涉及金融条件、资格和决策时转专业人员确认。", sourceRef: "MockServiceData · SVC-COMMERCIAL" },
];
