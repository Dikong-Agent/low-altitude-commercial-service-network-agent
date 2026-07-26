import { DEMO_PRODUCT_CATALOG } from "../../../lib/agents/ag001/catalog";
import { DEMO_MANUALS } from "../../../lib/agents/ag002/catalog";
import { DEMO_SCENARIO_SOLUTIONS } from "../../../lib/agents/ag003/catalog";

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
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
  return Response.json({
    code: "DATA_RESOURCE_NOT_FOUND",
    message: `Unknown business data resource: ${resource}`,
    environment: "demo",
  }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
