"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentListItem, ActivityItem } from "@/lib/api";
import { fetchAgents, deriveActivity } from "@/lib/api";
import Dashboard from "@/components/Dashboard";

/**
 * LiveDashboard — 真实数据轮询层（包装 Dashboard，不改其内部）。
 *
 * Demo 讲解用：开着 LIVE 时每 5s 拉一次 GET /agents，
 * 现场跑 seed / 事件上报时，页面右上角弹出真实活动 toast
 * （新 Agent 注册 / 评分更新 / 链上验证），列表自动出现新数据。
 *
 * 与 Dashboard 内 "Run Reputation Simulation"（前端概念模拟）互补：
 * 模拟条讲流程，LIVE 轮询证明真实链路。
 */

interface Toast {
  id: string;
  kind: ActivityItem["kind"];
  text: string;
}

const KIND_META: Record<ActivityItem["kind"], { label: string; color: string }> = {
  registered: { label: "新 Agent 注册", color: "#38bdf8" },
  scored: { label: "评分更新", color: "#fbbf24" },
  verified: { label: "链上验证", color: "#34d399" },
};

const LIVE_INTERVAL_MS = 5000;
const TOAST_TTL_MS = 6000;
const MAX_TOASTS = 4;

export default function LiveDashboard({
  initialAgents,
  health,
}: {
  initialAgents: AgentListItem[];
  health?: string;
}) {
  const [agents, setAgents] = useState<AgentListItem[]>(initialAgents);
  const [live, setLive] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prevRef = useRef<AgentListItem[]>(initialAgents);
  const toastsRef = useRef<Toast[]>([]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await fetchAgents();
        if (cancelled) return;
        const acts = deriveActivity(prevRef.current, next);
        prevRef.current = next;
        setAgents(next);
        if (acts.length > 0) {
          const fresh: Toast[] = acts.map((a) => ({
            id: a.id,
            kind: a.kind,
            text: `${a.name} · #${a.agentId} — ${KIND_META[a.kind].label}`,
          }));
          const merged = [...fresh, ...toastsRef.current].slice(0, MAX_TOASTS);
          toastsRef.current = merged;
          setToasts(merged);
          // 每条 toast 定时消失
          for (const t of fresh) {
            setTimeout(() => {
              toastsRef.current = toastsRef.current.filter((x) => x.id !== t.id);
              setToasts([...toastsRef.current]);
            }, TOAST_TTL_MS);
          }
        }
      } catch {
        /* api 暂不可达：保留当前数据，下次轮询再试 */
      }
    };

    const iv = window.setInterval(poll, LIVE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [live]);

  const toggleLive = () => setLive((v) => !v);

  return (
    <>
      <Dashboard agents={agents} health={health} />

      {/* LIVE HUD：轮询开关 + 活动 toast（浮动，不侵入 Dashboard 布局） */}
      <div
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 60,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              pointerEvents: "auto",
              background: "rgba(13,18,33,0.94)",
              border: `1px solid ${KIND_META[t.kind].color}66`,
              borderLeft: `3px solid ${KIND_META[t.kind].color}`,
              color: "#e6ecff",
              borderRadius: 10,
              padding: "7px 12px",
              fontSize: 12.5,
              fontFamily: "'Inter','PingFang SC',sans-serif",
              boxShadow: "0 12px 30px -10px rgba(0,0,0,0.7)",
              maxWidth: 320,
              display: "flex",
              alignItems: "center",
              gap: 8,
              animation: "c2cToastIn 0.25s ease-out",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: KIND_META[t.kind].color,
                boxShadow: `0 0 8px ${KIND_META[t.kind].color}`,
                flex: "none",
              }}
            />
            <span>
              <b style={{ color: KIND_META[t.kind].color, fontWeight: 700 }}>
                {KIND_META[t.kind].label}
              </b>{" "}
              {t.text}
            </span>
          </div>
        ))}

        <button
          onClick={toggleLive}
          aria-pressed={live}
          style={{
            pointerEvents: "auto",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            background: live ? "rgba(52,211,153,0.14)" : "rgba(148,163,205,0.1)",
            border: live ? "1px solid rgba(52,211,153,0.4)" : "1px solid rgba(148,163,205,0.3)",
            color: live ? "#34d399" : "#93a0bf",
            borderRadius: 999,
            padding: "6px 13px",
            fontSize: 12,
            fontFamily: "'Inter','PingFang SC',sans-serif",
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: live ? "#34d399" : "#5c6b8a",
              boxShadow: live ? "0 0 8px rgba(52,211,153,0.8)" : "none",
              animation: live ? "c2cLivePulse 1.8s infinite" : "none",
            }}
          />
          {live ? "LIVE · 每 5s 刷新" : "轮询已暂停"}
        </button>
      </div>

      <style jsx>{`
        @keyframes c2cToastIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes c2cLivePulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
      `}</style>
    </>
  );
}
