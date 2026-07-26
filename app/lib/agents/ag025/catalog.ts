import type { CustomerOrderSnapshot, CustomerProductSnapshot, CustomerServiceGuide, CustomerServiceKnowledgeEntry } from "./types";

export const DEMO_CUSTOMER_SERVICE_KNOWLEDGE: CustomerServiceKnowledgeEntry[] = [
  { id: "FAQ-PLATFORM-PAYMENT", title: "样例平台支付方式说明", domain: "platform", issueType: "general_rule", answer: "样例平台支持在线支付；实际可用方式、额度和到账状态应以订单结算页及支付机构结果为准。", keywords: ["支付", "付款", "结算"], sourceRef: "样例平台规则库 · 支付说明 v0.3-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-PLATFORM-MEMBER", title: "样例会员权益说明", domain: "platform", issueType: "general_rule", answer: "会员权益按样例等级展示咨询优先级与活动信息；正式权益、有效期和适用范围需以业务系统记录为准。", keywords: ["会员", "权益", "等级"], sourceRef: "样例平台规则库 · 会员说明 v0.2-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-AFTER-SALES", title: "样例退换与维修办理说明", domain: "product_mall", issueType: "after_sales", answer: "请先核对订单、商品状态和问题类型，再由售后人员确认是否满足退换或维修条件；智能客服不会直接批准退款、退货或维修结论。", keywords: ["退货", "换货", "退款", "维修", "售后", "故障"], sourceRef: "样例售后规则库 · 办理流程 v0.4-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-PRODUCT-SELECTION", title: "样例低空产品选型入口说明", domain: "product_mall", issueType: "product", answer: "产品选型需要补充用途、预算、载荷、续航和环境条件；可转入 AG-003 分类导购获得基于样例目录的候选建议。", keywords: ["购买", "选型", "推荐", "巡检", "无人机", "产品"], sourceRef: "样例商城知识库 · 选型入口 v0.3-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-FLIGHT-SERVICE", title: "样例飞行服务咨询说明", domain: "flight_service", issueType: "service", answer: "飞行服务咨询可先说明地区、时间、任务类型和航空器情况；涉及空域、天气与监管条件时需转相应专业服务确认。", keywords: ["飞行服务", "空域", "飞行", "报备", "航线"], sourceRef: "样例服务知识库 · 飞行服务 v0.2-demo", updatedAt: "2026-07-26" },
  { id: "FAQ-TECH-SERVICE", title: "样例技术服务咨询说明", domain: "technical_service", issueType: "service", answer: "技术服务咨询应补充设备型号、故障现象、发生条件和已尝试步骤；涉及安全风险时停止操作并由专业人员处理。", keywords: ["技术服务", "故障", "维修", "调试", "设备"], sourceRef: "样例服务知识库 · 技术服务 v0.2-demo", updatedAt: "2026-07-26" },
];

export const DEMO_CUSTOMER_ORDERS: CustomerOrderSnapshot[] = [
  { id: "JDZ-DEMO-1001", status: "shipped", statusLabel: "已发货", productName: "样例·云巡 X8 巡检无人机", updatedAt: "2026-07-25 09:30", logisticsSummary: "样例物流记录显示商品已从演示仓发出，正在转运中。", nextStep: "可继续关注正式物流节点；若超过业务系统承诺时限仍无更新，应由人工客服核查承运记录。", sourceRef: "MockOrderData · JDZ-DEMO-1001" },
  { id: "JDZ-DEMO-1002", status: "after_sales", statusLabel: "售后审核中", productName: "样例·航拍入门套装", updatedAt: "2026-07-26 14:10", logisticsSummary: "样例售后记录已收件，等待人工核验商品状态。", nextStep: "无需重复提交；最终退款或换货结论由售后人员依据正式规则确认。", sourceRef: "MockOrderData · JDZ-DEMO-1002" },
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
