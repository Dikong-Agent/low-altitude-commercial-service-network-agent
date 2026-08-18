import { r0OpenApiDocument } from "../../lib/r0/openapi";

export async function GET(request: Request) {
  return Response.json(r0OpenApiDocument(new URL(request.url).origin), { headers: { "Cache-Control": "no-store" } });
}

