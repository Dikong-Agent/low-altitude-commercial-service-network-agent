import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  return {
    title: "景德镇低空商业服务网 · 企业级业务智能体能力演示",
    description: "以五个标杆Agent，展现可复制、可扩展的业务智能化能力。",
    openGraph: { title: "景德镇低空商业服务网 · 企业级业务智能体能力演示", description: "五个可运行标杆Agent，展示可复制、可扩展的业务智能化能力。", images: [imageUrl], type: "website" },
    twitter: { card: "summary_large_image", title: "景德镇低空商业服务网 · 企业级业务智能体能力演示", description: "五个可运行标杆Agent，展示可复制、可扩展的业务智能化能力。", images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
