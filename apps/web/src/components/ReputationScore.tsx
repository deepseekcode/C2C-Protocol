"use client";

import { fmtStar, levelStyle } from "@/lib/format";

/**
 * Composite Score 环形展示（SVG arc + 渐变描边）
 * 0–10000 → 0–100；中心大数 + 等级 + 星级。
 */
export default function ReputationScore({
  score,
  level,
  size = 152,
}: {
  score?: number;
  level?: string;
  size?: number;
}) {
  const pct = score === undefined ? 0 : Math.min(100, Math.max(0, Math.round((score / 10000) * 100)));
  const st = levelStyle(level);
  const star = score === undefined ? 0 : Math.min(5, Math.max(0, Math.round((score / 10000) * 5)));

  const stroke = 10;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const dash = (c * pct) / 100;
  const center = size / 2;

  return (
    <div className="score-ring-wrap">
      <div className="score-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          {/* 底环 */}
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke="rgba(148,163,205,0.14)"
            strokeWidth={stroke}
          />
          {/* 进度弧 */}
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.55))", transition: "stroke-dasharray .6s ease" }}
          />
        </svg>
        <div className="score-ring-inner" style={{ inset: stroke + 4 }}>
          <span className="score-val" style={{ fontSize: Math.max(21, size / 4.8) }}>
            {score ?? "—"}
          </span>
          <span className="score-sub">/ 10000</span>
          {level && (
            <span
              className="level-badge"
              style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
            >
              {st.label}
            </span>
          )}
        </div>
      </div>
      <div className="score-stars" aria-label={`${score ?? 0} 分，${star} 星`}>
        {fmtStar(star)}
      </div>
    </div>
  );
}
