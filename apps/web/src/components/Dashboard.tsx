"use client";

import { useState } from "react";
import type { AgentListItem } from "@/lib/api";
import ReputationRadar from "@/components/ReputationRadar";
import { levelStyle, shortAddr } from "@/lib/format";

function AgentAvatar({ name, agentId }: { name: string; agentId: string }) {
  const ch = (name || agentId || "?").trim().charAt(0).toUpperCase();
  return <div className="agent-avatar">{ch}</div>;
}

function AgentScore({ score, level }: { score?: number; level?: string }) {
  const st = levelStyle(level);
  return (
    <div className="agent-score">
      <div className="score-num">{score ?? "—"}</div>
      {level && (
        <span className="level-badge" style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
          {st.label}
        </span>
      )}
    </div>
  );
}

export default function Dashboard({ agents, health }: { agents: AgentListItem[]; health?: string }) {
  const [selectedId, setSelectedId] = useState<string>(agents[0]?.agentId ?? "");
  const selected = agents.find((a) => a.agentId === selectedId) ?? agents[0];

  const dims = selected?.vector
    ? [
        { key: "Execution", label: "Execution", value: selected.vector.execution, color: "#38bdf8" },
        { key: "Reliability", label: "Reliability", value: selected.vector.reliability, color: "#34d399" },
        { key: "Quality", label: "Quality", value: selected.vector.quality, color: "#fbbf24" },
        { key: "Collaboration", label: "Collaboration", value: selected.vector.collaboration, color: "#a78bfa" },
      ]
    : [];

  const st = levelStyle(selected?.level);
  const total = agents.length;
  const verified = agents.filter((a) => a.chainVerified).length;
  const scored = agents.filter((a) => a.score !== undefined).length;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">C2C</span>
          <span>Reputation Dashboard</span>
        </div>
        <span className="env-chip">
          <span className="dot ok" /> {health ?? "api connected"}
        </span>
      </header>

      <main className="container">
        <div className="hero-head">
          <div>
            <h1>Agent Reputation Dashboard</h1>
            <p>C2C Protocol · 链上声誉 Vector 实时视图（Execution / Reliability / Quality / Collaboration）</p>
          </div>
          <span className="subtitle-chip">
            {total} Agents · {verified} 链上已验证 · {scored} 已评分
          </span>
        </div>

        <div className="grid">
          {/* 左：Agent 列表 */}
          <section className="card">
            <h2>Agents</h2>
            <div>
              {agents.length === 0 && (
                <div className="empty">
                  暂无 Agent。
                  <br />
                  运行 <code>pnpm run seed:e2e</code> 注册演示数据。
                </div>
              )}
              {agents.map((a) => (
                <button
                  key={a.agentId}
                  className={`agent-row ${a.agentId === selected?.agentId ? "selected" : ""}`}
                  onClick={() => setSelectedId(a.agentId)}
                >
                  <AgentAvatar name={a.name} agentId={a.agentId} />
                  <span className="agent-meta">
                    <span className="agent-name">{a.name}</span>
                    <span className="agent-sub">
                      #{a.agentId} · {shortAddr(a.ownerAddress)}
                    </span>
                  </span>
                  <AgentScore score={a.score} level={a.level} />
                  {a.chainVerified ? (
                    <span className="pill verified">链上已验证</span>
                  ) : (
                    <span className="pill pending">未上链</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* 右：详情 */}
          <section className="card">
            {!selected ? (
              <div className="empty">选择左侧 Agent 查看声誉画像</div>
            ) : (
              <>
                <div className="detail-head">
                  <AgentAvatar name={selected.name} agentId={selected.agentId} />
                  <div>
                    <div className="big-name">{selected.name}</div>
                    <div className="agent-sub">
                      #{selected.agentId} · owner {shortAddr(selected.ownerAddress, 8)}
                    </div>
                  </div>
                  {selected.level && (
                    <span
                      className="level-badge"
                      style={{ background: st.bg, color: st.color, marginLeft: "auto", fontSize: 13, padding: "4px 14px", border: `1px solid ${st.border}` }}
                    >
                      {st.label} · {selected.score}
                    </span>
                  )}
                </div>

                {selected.vector ? (
                  <>
                    <div className="stat-line">
                      <div className="stat">
                        <div className="k">Composite Score</div>
                        <div className="v">{selected.score}</div>
                      </div>
                      <div className="stat">
                        <div className="k">Proof</div>
                        <div className="v mono">{selected.proofHash?.slice(0, 10)}…</div>
                      </div>
                      <div className="stat">
                        <div className="k">Status</div>
                        <div className="v" style={{ color: selected.chainVerified ? "#34d399" : "#5c6b8a", fontSize: 15 }}>
                          {selected.chainVerified ? "链上已验证" : "未验证"}
                        </div>
                      </div>
                    </div>

                    <ReputationRadar vector={selected.vector} height={290} />

                    <div className="dim-list">
                      {dims.map((d) => (
                        <div className="dim" key={d.key}>
                          <span className="lab">{d.label}</span>
                          <span className="bar-wrap">
                            <span
                              className="bar"
                              style={{
                                width: `${(d.value / 10000) * 100}%`,
                                background: d.color,
                                boxShadow: `0 0 10px ${d.color}55`,
                              }}
                            />
                          </span>
                          <span className="val">{(d.value / 100).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty">
                    该 Agent 尚无评分数据。
                    <br />
                    SDK 上报 task 事件后自动计算并上链。
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="foot-note">
          <code>GET /agents</code> · <code>GET /reputation/:agentId</code> · 数据源: NestJS api + PostgreSQL + Hardhat(31337) +
          IPFS
        </footer>
      </main>
    </>
  );
}
