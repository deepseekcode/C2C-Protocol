import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "C2C Protocol · Reputation Dashboard",
  description: "C2C Protocol (Credit-to-Collaborate) — Agent 声誉基础设施 Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
