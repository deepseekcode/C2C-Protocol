"use client";

import { shortAddr, levelStyle } from "@/lib/format";
import { displayName } from "@/lib/api";

/**
 * Agent Passport 卡 — C2C 给 Agent 建立信用身份的入口。
 * 现有 AgentListItem 无 passport meta（头像/技能/任务数），用 score 推导兜底展示；
 * 二期可接入 ReputationPassport ERC1155 的真实链上 metadata。
 */
export default function AgentPassportCard({
  name,
  agentId,
  ownerAddress,
  score,
  level,
  chainVerified,
  passport,
}: {
  name: string;
  agentId: string;
  ownerAddress: string;
  score?: number;
  level?: string;
  chainVerified: boolean;
  passport?: boolean;
}) {
  const st = levelStyle(level);
  const label = displayName(name, agentId);
  const skill =
    label.toLowerCase().includes("research") || label.toLowerCase().includes("data")
      ? ["Research", "Analysis", "Reasoning"]
      : label.toLowerCase().includes("trade")
        ? ["Trading", "Risk", "Execution"]
        : ["Task", "QA", "Reasoning"];
  const pct = score === undefined ? 0 : Math.min(100, Math.round((score / 10000) * 100));

  return (
    <div className="passport-card">
      <div className="passport-glow" />
      <div className="passport-head">
        <div className="passport-badge">C2C PASSPORT</div>
        <span className="pill verified" style={{ fontSize: 10 }}>
          ERC-1155
        </span>
      </div>
      <div className="passport-row">
        <div className="passport-avatar">{label.trim().charAt(0).toUpperCase() || "?"}</div>
        <div>
          <div className="passport-name">{label}</div>
          <div className="passport-id mono">#{agentId}</div>
        </div>
        <div className="passport-level" style={{ color: st.color, borderColor: st.border, background: st.bg }}>
          {st.label}
        </div>
      </div>
      <div className="passport-skills">
        {skill.map((s) => (
          <span key={s} className="skill-chip">
            {s}
          </span>
        ))}
      </div>
      <div className="passport-meta">
        <div className="meta-item">
          <span className="k">Owner</span>
          <span className="v mono">{shortAddr(ownerAddress, 6)}</span>
        </div>
        <div className="meta-item">
          <span className="k">Passport</span>
          <span className="v" style={{ color: passport ? "#34d399" : "#93a0bf" }}>
            {passport ? "Minted" : "SBT · 禁转账"}
          </span>
        </div>
        <div className="meta-item">
          <span className="k">Status</span>
          <span className="v" style={{ color: chainVerified ? "#34d399" : "#93a0bf" }}>
            {chainVerified ? "Verified on Avalanche" : "Local only"}
          </span>
        </div>
      </div>
      <div className="passport-progress">
        <span className="pp-label">Reputation {pct}%</span>
        <span className="pp-bar-wrap">
          <span className="pp-bar" style={{ width: `${pct}%` }} />
        </span>
      </div>
      <div className="passport-foot">Every agent owns its credit identity · 每一个 Agent 都拥有信用身份</div>
    </div>
  );
}
