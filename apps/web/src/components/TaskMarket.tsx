"use client";

/**
 * TaskMarket — 任务市场（人发布任务 → Agent 领取）。
 *
 * V1 边界（诚实标注）：不做支付/撮合；领取用「演示 Agent 私钥」直连（生产需钱包签名）。
 * 状态机与服务端一致：OPEN → ASSIGNED → COMPLETED（/cancel 为旁路）。
 * 领取门槛 = Agent 链上 Composite Score ≥ minScore（服务端读 ReputationRegistry 校验）。
 */

import { useEffect, useMemo, useState } from "react";
import type { AgentListItem, TaskItem } from "@/lib/api";
import { fetchTasks, publishTask, claimTask } from "@/lib/api";

const STATUS_COLOR: Record<TaskItem["status"], string> = {
  OPEN: "#38bdf8",
  ASSIGNED: "#fbbf24",
  COMPLETED: "#34d399",
  CANCELLED: "#5c6b8a",
};

/** 演示发布者/领取者 key（本地 hardhat account#1/#2；生产应走钱包签名，这里仅为 Demo 链路打通） */
const DEMO_PUBLISHER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // hardhat #0
const DEMO_AGENT_KEYS = [
  {
    label: "Agent Owner #1 (默认)",
    key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // hardhat #1
  },
  {
    label: "Agent Owner #2",
    key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // hardhat #2
  },
];

function shortAddr(a?: string | null, n = 6): string {
  if (!a) return "—";
  return a.length <= n + 4 ? a : `${a.slice(0, n)}…${a.slice(-4)}`;
}

const fmtScore = (s?: number | null) => (s === null || s === undefined ? "—" : String(s));

export default function TaskMarket({ agents }: { agents: AgentListItem[] }) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 发布表单
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [publisherKey, setPublisherKey] = useState(DEMO_PUBLISHER_KEY);

  // 领取选择
  const [selAgentKey, setSelAgentKey] = useState(DEMO_AGENT_KEYS[0].key);
  const selAgentLabel = useMemo(
    () => DEMO_AGENT_KEYS.find((k) => k.key === selAgentKey)?.label ?? "自定义 Agent Owner",
    [selAgentKey],
  );

  const load = async () => {
    try {
      setTasks(await fetchTasks());
    } catch {
      /* api 未就绪时静默 */
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 6000);
  };

  const onPublish = async () => {
    if (!title.trim()) return flash(false, "请填写任务标题");
    setBusy(true);
    try {
      const externalId = `task-${Date.now()}`;
      const t = await publishTask({
        externalId,
        title: title.trim(),
        description: desc.trim() || undefined,
        minScore,
        publisherPrivateKey: publisherKey,
      });
      flash(true, `已发布「${t.title}」#${t.externalId} · ${t.chainRecorded ? "链上已登记" : "等待对账"}`);
      setTitle("");
      setDesc("");
      setMinScore(0);
      await load();
    } catch (e) {
      flash(false, `发布失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onClaim = async (t: TaskItem) => {
    // 找演示 agentId：取 agents 里第一个（seed 环境）；若当前选了 owner 无对应 agent 则提示
    setBusy(true);
    try {
      const agent = agents[0];
      if (!agent) return flash(false, "无可用演示 Agent，请先运行 seed 注册");
      const updated = await claimTask(t.externalId, {
        agentPrivateKey: selAgentKey,
        chainAgentId: Number(agent.agentId),
      });
      flash(true, `Agent #${agent.agentId} 已领取「${updated.title}」`);
      await load();
    } catch (e) {
      flash(false, `领取失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      style={{
        marginTop: 28,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: 22,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, background: "var(--grad-text)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Task Marketplace
        </h3>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          人发布任务 → Agent 按声誉门槛领取 → 链上登记（Demo：无支付/撮合，领取用演示私钥）
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            border: "1px solid var(--amber-soft)",
            color: "var(--amber)",
            borderRadius: 999,
            padding: "2px 10px",
            background: "var(--amber-soft)",
          }}
        >
          Demo 数据 · 私钥直连
        </span>
      </div>

      {msg && (
        <div
          style={{
            marginBottom: 14,
            padding: "8px 14px",
            borderRadius: 10,
            fontSize: 13,
            border: `1px solid ${msg.ok ? "rgba(52,211,153,0.4)" : "rgba(251,113,133,0.4)"}`,
            color: msg.ok ? "var(--teal)" : "var(--coral)",
            background: msg.ok ? "var(--teal-soft)" : "var(--coral-soft)",
          }}
        >
          {msg.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 20, alignItems: "start" }}>
        {/* 左：发布表单 */}
        <div
          style={{
            background: "rgba(5,7,15,0.5)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)", marginBottom: 12 }}>
            发布任务（Human → Agent）
          </div>
          <label style={lbl}>标题</label>
          <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：帮我审查这段 Solidity 合约" />
          <label style={lbl}>描述（可选）</label>
          <textarea
            style={{ ...inp, minHeight: 64, resize: "vertical", fontFamily: "inherit" }}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="需求细节、验收标准…"
          />
          <label style={lbl}>声誉门槛（Composite ≥ minScore，0–10000；0=不限）</label>
          <input
            style={inp}
            type="number"
            min={0}
            max={10000}
            value={minScore}
            onChange={(e) => setMinScore(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))}
          />
          <label style={lbl}>发布者私钥（Demo 直连）</label>
          <input style={{ ...inp, fontFamily: "var(--font-mono)", fontSize: 11 }} value={publisherKey} onChange={(e) => setPublisherKey(e.target.value)} />
          <button style={btn} onClick={onPublish} disabled={busy}>
            {busy ? "处理中…" : "发布并上链登记"}
          </button>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
            发布后调用 TaskRegistry.publishTask 链上登记（任务先到链下状态机）。
          </div>
        </div>

        {/* 右：任务列表 */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>领取身份：</span>
            <select
              style={{ ...inp, width: "auto", padding: "5px 10px", fontSize: 12 }}
              value={selAgentKey}
              onChange={(e) => setSelAgentKey(e.target.value)}
            >
              {DEMO_AGENT_KEYS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{selAgentLabel} 领取需其声誉 ≥ 门槛</span>
          </div>

          {tasks.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--line-strong)",
                borderRadius: 14,
                padding: 28,
                textAlign: "center",
                color: "var(--text-3)",
                fontSize: 13,
              }}
            >
              暂无任务。用左侧表单发布第一个任务（真实 mint 上链）。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tasks.map((t) => (
                <div
                  key={t.externalId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    background: "rgba(5,7,15,0.5)",
                    border: "1px solid var(--line)",
                    borderRadius: 14,
                    padding: "12px 16px",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: STATUS_COLOR[t.status],
                      boxShadow: `0 0 8px ${STATUS_COLOR[t.status]}`,
                      flex: "none",
                    }}
                  />
                  <div style={{ minWidth: 180, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                      #{t.externalId} · {shortAddr(t.publisherAddr)} · 门槛 {t.minScore}
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>{t.description}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, textAlign: "right" }}>
                    <span style={{ color: STATUS_COLOR[t.status], fontWeight: 700, letterSpacing: "0.04em" }}>
                      {t.status}
                    </span>
                    {t.assignedChainAgent !== null && (
                      <div style={{ color: "var(--text-2)", marginTop: 3 }}>
                        Agent #{t.assignedChainAgent} · score {fmtScore(t.assignedScore)}
                      </div>
                    )}
                    {t.chainRecorded && (
                      <div style={{ color: "var(--teal)", fontSize: 11, marginTop: 3 }}>✓ 链上已登记</div>
                    )}
                  </div>
                  {t.status === "OPEN" && (
                    <button style={{ ...btn, marginLeft: 4 }} onClick={() => onClaim(t)} disabled={busy}>
                      领取
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const lbl: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--text-3)",
  margin: "10px 0 4px",
};
const inp: React.CSSProperties = {
  width: "100%",
  background: "rgba(5,7,15,0.7)",
  border: "1px solid var(--line-strong)",
  borderRadius: 9,
  color: "var(--text)",
  padding: "8px 11px",
  fontSize: 13,
  outline: "none",
};
const btn: React.CSSProperties = {
  marginTop: 14,
  width: "100%",
  background: "linear-gradient(100deg, rgba(56,189,248,0.18), rgba(167,139,250,0.18))",
  border: "1px solid rgba(56,189,248,0.4)",
  color: "var(--text)",
  borderRadius: 10,
  padding: "9px 0",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
