import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  return {
    title: "景德镇低空商业服务网 · 业务智能体样例展示",
    description: "景德镇低空商业服务网业务智能体阶段成果，展示经营问数、政策解读、客户服务和产品决策等场景样例。",
    openGraph: { title: "景德镇低空商业服务网 · 业务智能体样例展示", description: "展示当前样例的业务用途、处理依据、输出结果和适用范围。", images: [imageUrl], type: "website" },
    twitter: { card: "summary_large_image", title: "景德镇低空商业服务网 · 业务智能体样例展示", description: "展示当前样例的业务用途、处理依据、输出结果和适用范围。", images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
