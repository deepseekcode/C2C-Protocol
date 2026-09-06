"use client";

import { useMemo, useState } from "react";
import type { AgentListItem } from "@/lib/api";
import { DIM_META, displayName } from "@/lib/api";
import { shortAddr } from "@/lib/format";
import AgentAvatar from "@/components/AgentAvatar";
import ReputationScore from "@/components/ReputationScore";
import ReputationRadar from "@/components/ReputationRadar";
import AgentHistory, { type HistoryItem } from "@/components/AgentHistory";
import AgentPassportCard from "@/components/AgentPassportCard";
import ProofCard from "@/components/ProofCard";

/** 信用来源 = 引擎四维加权（如实展示各维当前分与权重，不伪造历史任务数） */
function creditOrigin(a: AgentListItem): { k: string; v: string }[] {
  if (!a.vector || a.score === undefined) return [];
  const dims = DIM_META as Record<keyof typeof DIM_META, { label: string; full: string; weight: number }>;
  return [
    { k: "Execution · 执行", v: `${(a.vector.execution / 100).toFixed(0)}/100 · 权重 ${dims.execution.weight}%` },
    { k: "Reliability · 可靠", v: `${(a.vector.reliability / 100).toFixed(0)}/100 · 权重 ${dims.reliability.weight}%` },
    { k: "Quality · 质量", v: `${(a.vector.quality / 100).toFixed(0)}/100 · 权重 ${dims.quality.weight}%` },
    { k: "Collaboration · 协作", v: `${(a.vector.collaboration / 100).toFixed(0)}/100 · 权重 ${dims.collaboration.weight}%` },
    { k: "链上证明", v: a.chainVerified ? "Avalanche 已验证 · Proof Hash 已上链" : "待首次评分上链" },
  ];
}

/** 时间线（最近一次快照状态；无历史聚合接口，如实标注为最近事件示意） */
function historyFor(a: AgentListItem, now: Date): HistoryItem[] {
  const d = (offsetDay = 0) => {
    const t = new Date(now.getTime() - offsetDay * 86400000);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  if (a.vector && a.score !== undefined) {
    return [
      {
        time: d(0),
        title: "链上证明已生成",
        detail: `ReputationRegistry · proofHash ${a.proofHash?.slice(0, 10) ?? "—"} · ${a.chainVerified ? "链上已验证" : "待对账"}`,
        kind: "proof",
      },
      {
        time: d(0),
        title: "声誉向量重新评分",
        detail: `score ${a.score} · E[${(a.vector.execution / 100).toFixed(0)}] R[${(a.vector.reliability / 100).toFixed(0)}] Q[${(a.vector.quality / 100).toFixed(0)}] C[${(a.vector.collaboration / 100).toFixed(0)}]`,
        kind: "score",
      },
      {
        time: d(1),
        title: "Agent 注册 · Passport 铸造",
        detail: `AgentIdentity #${a.agentId} · ${a.passport ? "ERC-1155 Passport 已 Mint" : "Passport 待铸造"}`,
        kind: "passport",
      },
    ];
  }
  return [
    {
      time: d(1),
      title: "Agent 已注册",
      detail: `#${a.agentId} · 等待第一次任务评分（task.completed → 引擎 → 上链）`,
      kind: "passport",
    },
  ];
}

export default function Dashboard({ agents, health }: { agents: AgentListItem[]; health?: string }) {
  const [selectedId, setSelectedId] = useState<string>(agents[0]?.agentId ?? "");
  const [playing, setPlaying] = useState(false);
  const [playStep, setPlayStep] = useState(0);
  const selected = agents.find((a) => a.agentId === selectedId) ?? agents[0];

  const now = useMemo(() => new Date(), []);
  const dims = selected?.vector
    ? (Object.keys(DIM_META) as (keyof typeof DIM_META)[]).map((k) => ({
        key: k,
        label: DIM_META[k].label,
        value: selected.vector![k],
        color: DIM_META[k].color,
        weight: DIM_META[k].weight,
      }))
    : [];

  const total = agents.length;
  const verified = agents.filter((a) => a.chainVerified).length;
  const scored = agents.filter((a) => a.score !== undefined).length;

  const runSimulation = () => {
    if (playing || agents.length === 0) return;
    setPlaying(true);
    setPlayStep(0);
    const steps = [
      "创建任务 →",
      "Agent 执行中",
      "AI 评价中",
      "Reputation +120",
      "生成 Proof Hash",
      "写入 Avalanche",
      "Passport 升级",
    ];
    let i = 0;
    const iv = window.setInterval(() => {
      i += 1;
      if (i >= steps.length) {
        window.clearInterval(iv);
        setPlayStep(0);
        setPlaying(false);
        return;
      }
      setPlayStep(i);
    }, 850);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">C2C</span>
          <span>Reputation OS</span>
        </div>
        <span className="env-chip">
          <span className="dot ok" /> {health ?? "api connected"}
        </span>
      </header>

      <main className="container">
        {/* Hero：一句话讲清产品是"AI Agent 信用基础设施" */}
        <div className="hero-head">
          <div>
            <div className="hero-kicker">Credit-to-Collaborate · Avalanche</div>
            <h1>C2C Reputation OS</h1>
            <p className="hero-sub">AI Agent 信用操作系统 — 每一次行为产生证明，每一个证明积累信用资产</p>
          </div>
          <span className="subtitle-chip">
            {total} Agents · {verified} 链上已验证 · {scored} 已评分
          </span>
        </div>

        {/* 主网格 */}
        <div className="grid">
          {/* 左：Agent Ranking */}
          <section className="card">
            <h2>Agent Ranking</h2>
            {agents.length === 0 ? (
              <div className="empty">
                暂无 Agent。
                <br />
                运行 <code>pnpm run seed:e2e</code> 注册演示数据。
              </div>
            ) : (
              <div className="agent-list">
                {agents.map((a, i) => {
                  const dn = displayName(a.name, a.agentId);
                  const sel = a.agentId === selected?.agentId;
                  return (
                    <button
                      key={a.agentId}
                      className={`agent-row ${sel ? "selected" : ""}`}
                      onClick={() => setSelectedId(a.agentId)}
                    >
                      <span className="rank-no">{i + 1}</span>
                      <AgentAvatar name={dn} agentId={a.agentId} size="sm" />
                      <span className="agent-meta">
                        <span className="agent-name">{dn}</span>
                        <span className="agent-sub mono">
                          #{a.agentId} · {shortAddr(a.ownerAddress)}
                        </span>
                      </span>
                      <AgentScore score={a.score} />
                      {a.chainVerified && (
                        <span className="pill verified" style={{ flex: "none" }}>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 右：Detail */}
          <section className="card detail-card">
            {!selected ? (
              <div className="empty">选择左侧 Agent 查看声誉画像</div>
            ) : (
              <>
                {/* 顶栏：Passport 行 */}
                <div className="detail-head">
                  <AgentAvatar name={selected.name} agentId={selected.agentId} />
                  <div>
                    <div className="big-name">{displayName(selected.name, selected.agentId)}</div>
                    <div className="agent-sub mono">
                      #{selected.agentId} · owner {shortAddr(selected.ownerAddress, 6)}
                    </div>
                  </div>
                  <span className="pill verified" style={{ marginLeft: "auto" }}>
                    Avalanche
                  </span>
                </div>

                <div className="detail-body">
                  {/* 左列：分数 + 来源 */}
                  <div className="col-left">
                    <div className="score-panel">
                      <ReputationScore score={selected.score} level={selected.level} />
                    </div>
                    <div className="origin-panel">
                      <h4>Composite · 加权来源</h4>
                      <div className="origin-hint">综合分 = 四维加权（引擎 VECTOR_WEIGHTS 同源）</div>
                      <ul className="origin-list">
                        {creditOrigin(selected).map((o) => (
                          <li key={o.k}>
                            <span className="o-k">{o.k}</span>
                            <span className="o-v">{o.v}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* 右列：雷达 + 维度解释 */}
                  <div className="col-right">
                    <ReputationRadar vector={selected.vector} height={220} />
                    <div className="dim-list">
                      {dims.map((d) => (
                        <div className="dim" key={d.key}>
                          <span className="lab">{d.label}</span>
                          <span className="bar-wrap">
                            <span
                              className="bar"
                              style={{ width: `${(d.value / 10000) * 100}%`, background: d.color }}
                            />
                          </span>
                          <span className="val">{(d.value / 100).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="dim-weights">
                      权重 · Execution 30% / Reliability 30% / Quality 25% / Collaboration 15%
                    </div>
                  </div>
                </div>

                {/* 链上证明 */}
                <ProofCard proofHash={selected.proofHash} chainVerified={selected.chainVerified} />

                {/* 信用生成时间线（真实降级） */}
                <div className="panel">
                  <div className="panel-title">
                    <h4>信用生成 Timeline</h4>
                    <span className="tag-muted">来源：Event → 引擎 → 链上 Proof</span>
                  </div>
                  <AgentHistory items={historyFor(selected, now)} />
                </div>

                {/* Passport 卡 */}
                <AgentPassportCard
                  name={selected.name}
                  agentId={selected.agentId}
                  ownerAddress={selected.ownerAddress}
                  score={selected.score}
                  level={selected.level}
                  chainVerified={selected.chainVerified}
                  passport={selected.passport}
                />
              </>
            )}
          </section>
        </div>

        {/* Demo 模拟条 + 实时事件流（Builder Hub 讲解用） */}
        <section className="demo-band">
          <button className="demo-btn" onClick={runSimulation} disabled={playing}>
            {playing ? "Simulation Running…" : "▶ Run Reputation Simulation"}
          </button>
          <div className="live-flow">
            <span className="live-label">
              <span className="live-dot" /> LIVE
            </span>
            <div className="flow-track mono">
              {playStep === 0 ? (
                <span className="flow-idle">等待演示… 任务完成 → AI 验证 → +Reputation → Avalanche Proof → Passport</span>
              ) : (
                [
                  "任务完成",
                  "AI 验证",
                  "Reputation +120",
                  "生成 Proof",
                  "Avalanche 确认",
                  "Passport 升级",
                ].map((s, i) => (
                  <span key={s} className={i <= playStep - 1 ? "step done" : "step"}>
                    {s}
                  </span>
                ))
              )}
            </div>
          </div>
        </section>

        <footer className="foot-note">
          <code>GET /agents</code> · <code>GET /reputation/:agentId</code> · 数据源: NestJS api + PostgreSQL + Hardhat + IPFS
        </footer>
      </main>
    </>
  );
}

function AgentScore({ score }: { score?: number }) {
  return (
    <div className="agent-score">
      <div className="score-num">{score ?? "—"}</div>
    </div>
  );
}
