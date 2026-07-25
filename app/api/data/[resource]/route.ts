export async function GET(_request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  return Response.json({ environment: "demo", resource, items: [], connector: { port: "BusinessDataPort", status: "reserved", target: "正式数据中台及业务系统接口" } });
}
