import { DEMO_PRODUCT_CATALOG } from "../../../lib/agents/ag001/catalog";
import { DEMO_MANUALS } from "../../../lib/agents/ag002/catalog";
import { DEMO_SCENARIO_SOLUTIONS } from "../../../lib/agents/ag003/catalog";
import { DEMO_POLICY_DOCUMENTS } from "../../../lib/agents/ag012/catalog";
import { DEMO_CUSTOMER_ORDERS, DEMO_CUSTOMER_SERVICE_KNOWLEDGE } from "../../../lib/agents/ag025/catalog";
import { getAgentRuntimeMode, RequestIdentityError } from "../../../lib/request-identity";

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    if (getAgentRuntimeMode() === "production") {
      return Response.json({ code: "DATA_RESOURCE_NOT_FOUND", message: "Business data diagnostics are disabled" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    if (error instanceof RequestIdentityError) {
      return Response.json({ code: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ code: "AUTH_CONFIGURATION_ERROR", message: "Agent runtime configuration is unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const { resource } = await context.params;
  if (resource === "products") {
    const url = new URL(request.url);
    const ids = new Set((url.searchParams.get("ids")?.split(",") ?? []).map((id) => id.trim()).filter(Boolean).slice(0, 20));
    const scenario = url.searchParams.get("scenario");
    const items = DEMO_PRODUCT_CATALOG.filter((product) =>
      (!ids.size || ids.has(product.id)) && (!scenario || product.scenarios.includes(scenario)),
    );
    return Response.json({
      environment: "demo",
      resource,
      items,
      total: items.length,
      connector: { port: "BusinessDataPort", status: "mock-active", target: "正式数据中台及业务系统接口" },
      notice: "全部产品均为虚构样例数据，仅用于AG-001开发和阶段测试。",
    });
  }
  if (resource === "manuals") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const items = DEMO_MANUALS
      .filter((manual) => !id || manual.id === id)
      .map((manual) => ({
        id: manual.id,
        title: manual.title,
        product_name: manual.productName,
        version: manual.version,
        updated_at: manual.updatedAt,
        structure: manual.structure,
        section_count: manual.sections.length,
      }));
    if (id && items.length === 0) {
      return Response.json({
        code: "DOCUMENT_NOT_FOUND",
        message: `Unknown demo manual: ${id}`,
        environment: "demo",
      }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({
      environment: "demo",
      resource,
      items,
      total: items.length,
      connector: { port: "DocumentDataPort", status: "mock-active", target: "正式文档库及业务系统接口" },
      notice: "全部说明书及章节内容均为虚构样例，仅用于AG-002开发和阶段测试。",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (resource === "solutions") {
    const url = new URL(request.url);
    const scenario = url.searchParams.get("scenario")?.trim();
    const items = DEMO_SCENARIO_SOLUTIONS.filter((solution) => !scenario || solution.scenario.includes(scenario) || solution.tags.includes(scenario));
    return Response.json({
      environment: "demo",
      resource,
      items,
      total: items.length,
      connector: { port: "BusinessDataPort", status: "mock-active", target: "正式数据中台及产品商城业务系统接口" },
      notice: "全部场景方案、组合关系和价格均为虚构样例，仅用于 AG-003 开发和阶段测试。",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (resource === "policies") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const type = url.searchParams.get("type")?.trim();
    const items = DEMO_POLICY_DOCUMENTS
      .filter((document) => (!id || document.id === id) && (!type || document.documentType === type))
      .map((document) => ({
        id: document.id,
        title: document.title,
        document_number: document.documentNumber,
        issuer: document.issuer,
        document_type: document.documentType,
        jurisdiction: document.jurisdiction,
        version: document.version,
        published_at: document.publishedAt,
        effective_from: document.effectiveFrom,
        effective_to: document.effectiveTo,
        replaces_id: document.replacesId,
        section_count: document.sections.length,
      }));
    if (id && items.length === 0) {
      return Response.json({ code: "POLICY_DOCUMENT_NOT_FOUND", message: `Unknown demo policy: ${id}`, environment: "demo" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({
      environment: "demo",
      resource,
      items,
      total: items.length,
      connector: { port: "PolicyDataPort", status: "mock-active", target: "正式政策知识库、标准库及适航资料接口" },
      notice: "目录含1份国务院官网公开现行法规摘录与3份虚构政策/标准样例；来源已分开标识，仅用于 AG-012 工作流与接口测试，不替代完整法规及主管部门口径。",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (resource === "customer-service-knowledge") {
    return Response.json({
      environment: "demo", resource,
      items: DEMO_CUSTOMER_SERVICE_KNOWLEDGE.map((entry) => ({ id: entry.id, title: entry.title, domain: entry.domain, issue_type: entry.issueType, source_ref: entry.sourceRef, updated_at: entry.updatedAt })),
      total: DEMO_CUSTOMER_SERVICE_KNOWLEDGE.length,
      connector: { port: "CustomerServiceDataPort", status: "mock-active", target: "正式 FAQ、知识库及客服业务接口" },
      notice: "全部常见问题和处理规则均为虚构样例，仅用于 AG-025 咨询分类与接口测试。",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (resource === "customer-orders") {
    const id = new URL(request.url).searchParams.get("id")?.trim().toUpperCase();
    if (!id) return Response.json({ code: "ORDER_ID_REQUIRED", message: "A single demo order id is required", environment: "demo" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const item = DEMO_CUSTOMER_ORDERS.find((order) => order.id === id);
    if (!item) return Response.json({ code: "ORDER_NOT_FOUND", message: `Unknown demo order: ${id}`, environment: "demo" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json({
      environment: "demo", resource, item,
      connector: { port: "CustomerServiceDataPort", status: "mock-active", target: "正式订单、物流及售后业务接口" },
      notice: "订单及状态均为虚构样例；接口只按明确订单号返回，不提供订单列表。",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({
    code: "DATA_RESOURCE_NOT_FOUND",
    message: `Unknown business data resource: ${resource}`,
    environment: "demo",
  }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
