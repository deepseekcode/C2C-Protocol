"use client";

import type { CSSProperties } from "react";

export interface HistoryItem {
  time: string;
  title: string;
  detail?: string;
  delta?: string; // 例如 "+120"
  kind: "task" | "score" | "proof" | "passport";
}

const KIND_DOT: Record<HistoryItem["kind"], { color: string; icon: string }> = {
  task: { color: "#38bdf8", icon: "◈" },
  score: { color: "#34d399", icon: "★" },
  proof: { color: "#a78bfa", icon: "⬡" },
  passport: { color: "#fbbf24", icon: "◉" },
};

export default function AgentHistory({ items }: { items: HistoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="empty" style={{ padding: 28 }}>
        该 Agent 尚无信用轨迹。
        <br />
        完成任务并触发评分后，这里将展示「信用是如何生成的」。
      </div>
    );
  }
  return (
    <div className="timeline">
      {items.map((it, i) => {
        const d = KIND_DOT[it.kind];
        const style = { "--dot": d.color } as CSSProperties;
        return (
          <div key={`${it.time}-${i}`} className="tl-item" style={style}>
            <div className="tl-dot">
              <span>{d.icon}</span>
            </div>
            <div className="tl-body">
              <div className="tl-time mono">{it.time}</div>
              <div className="tl-title">{it.title}</div>
              {it.detail && <div className="tl-detail">{it.detail}</div>}
            </div>
            {it.delta && <span className="tl-delta">{it.delta}</span>}
          </div>
        );
      })}
    </div>
  );
}
