import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-v1.8.png`;
  return {
    title: "景德镇低空商业服务网 · AI Agent 能力展厅",
    description: "五个标杆业务 Agent 的统一能力展厅；四个可运行，一个能力预览。",
    openGraph: { title: "景德镇低空商业服务网 · AI Agent 能力展厅", description: "四个 Agent 可运行，一个能力预览，一套可复用智能底座。", images: [imageUrl], type: "website" },
    twitter: { card: "summary_large_image", title: "景德镇低空商业服务网 · AI Agent 能力展厅", description: "四个 Agent 可运行，一个能力预览，一套可复用智能底座。", images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
