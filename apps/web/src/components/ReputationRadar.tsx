"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface VectorData {
  execution: number;
  reliability: number;
  quality: number;
  collaboration: number;
}

/** 轴色：C2C 四维语义色（与详情 dim-bar 一致） */
export const AXIS_COLORS: Record<keyof VectorData, string> = {
  execution: "#38bdf8",
  reliability: "#34d399",
  quality: "#fbbf24",
  collaboration: "#a78bfa",
};

const AXES: { key: keyof VectorData; label: string }[] = [
  { key: "execution", label: "Execution" },
  { key: "reliability", label: "Reliability" },
  { key: "quality", label: "Quality" },
  { key: "collaboration", label: "Collaboration" },
];

export default function ReputationRadar({
  vector,
  height = 300,
}: {
  vector: VectorData | undefined;
  height?: number;
}) {
  if (!vector) return null;
  const data = AXES.map((a) => ({
    axis: a.label,
    key: a.key,
    // 0–10000 → 0–100（雷达图展示百分比）
    value: vector[a.key] / 100,
    full: vector[a.key],
  }));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="rgba(148,163,205,0.22)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: "#93a0bf", fontSize: 12, fontFamily: "Inter, sans-serif" }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Reputation"
            dataKey="value"
            stroke="#7dd3fc"
            fill="url(#c2cRadarFill)"
            fillOpacity={1}
            strokeWidth={2}
          />
          <defs>
            <linearGradient id="c2cRadarFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
              <stop offset="55%" stopColor="#818cf8" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.34} />
            </linearGradient>
          </defs>
          <Tooltip
            formatter={(v) => {
              // 输入为雷达百分比(0–100)，还原 0–10000 原值展示
              const full = Math.round((Number(v) / 100) * 10000);
              return [`${full} / 10000`, "声誉"];
            }}
            contentStyle={{
              background: "#0d1221",
              border: "1px solid rgba(148,163,205,0.25)",
              borderRadius: 12,
              fontSize: 12,
              color: "#e6ecff",
              boxShadow: "0 12px 32px -12px rgba(0,0,0,0.8)",
            }}
            labelStyle={{ color: "#93a0bf" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
