// 等级徽章样式（对齐声誉引擎 toLevel；暗色系语义色）
export const LEVEL_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  Bronze: { color: "#e0a37c", bg: "rgba(180,120,80,0.14)", border: "rgba(224,163,124,0.3)", label: "青铜" },
  Silver: { color: "#c3cede", bg: "rgba(160,175,200,0.14)", border: "rgba(195,206,222,0.3)", label: "白银" },
  Gold: { color: "#f5cd6e", bg: "rgba(245,170,60,0.14)", border: "rgba(245,205,110,0.32)", label: "黄金" },
  Diamond: { color: "#7dd3fc", bg: "rgba(56,189,248,0.14)", border: "rgba(125,211,252,0.32)", label: "钻石" },
};

export function levelStyle(level?: string) {
  return (
    LEVEL_STYLE[level ?? ""] ?? {
      color: "#93a0bf",
      bg: "rgba(148,163,205,0.08)",
      border: "rgba(148,163,205,0.25)",
      label: level ?? "—",
    }
  );
}

export function shortAddr(addr: string, n = 6): string {
  if (!addr || addr.length < 12) return addr ?? "";
  return `${addr.slice(0, n)}…${addr.slice(-4)}`;
}

export function fmtScore(score?: number): string {
  if (score === undefined) return "—";
  return String(score);
}
