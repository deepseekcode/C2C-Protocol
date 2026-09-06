import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "C2C Reputation OS · AI Agent 信用基础设施",
  description:
    "C2C Protocol (Credit-to-Collaborate) — AI Agent 信用操作系统：每一次行为产生证明，每一个证明积累信用资产，链上可验证于 Avalanche。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
