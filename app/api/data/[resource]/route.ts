import { DEMO_PRODUCT_CATALOG } from "../../../lib/agents/ag001/catalog";

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (resource === "products") {
    const url = new URL(request.url);
    const ids = new Set(url.searchParams.get("ids")?.split(",").filter(Boolean) ?? []);
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
  return Response.json({ environment: "demo", resource, items: [], connector: { port: "BusinessDataPort", status: "reserved", target: "正式数据中台及业务系统接口" } });
}
