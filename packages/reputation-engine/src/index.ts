/**
 * @c2c/reputation-engine — Reputation Vector 纯函数计算
 *
 * 与链上 ReputationRegistry.sol 的权重保持一致：
 *   composite = execution*30% + reliability*30% + quality*25% + collaboration*15%
 * 所有分量与综合分均在 0–10000 域。
 */

export interface ReputationVector {
  execution: number;
  reliability: number;
  quality: number;
  collaboration: number;
}

export const VECTOR_WEIGHTS = {
  execution: 30,
  reliability: 30,
  quality: 25,
  collaboration: 15,
} as const;

export type ReputationLevel = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";

export const LEVEL_THRESHOLDS: Record<ReputationLevel, number> = {
  Bronze: 3000,
  Silver: 5000,
  Gold: 7000,
  Platinum: 8500,
  Diamond: 9000,
};

const SCORE_MIN = 0;
const SCORE_MAX = 10000;

/** 钳制到 [0, 10000] 并取整（与链上 uint32 语义对齐） */
export function clampScore(x: number): number {
  if (Number.isNaN(x)) return SCORE_MIN;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(x)));
}

/** 归一化向量：每个分量独立 clamp */
export function normalizeVector(v: ReputationVector): ReputationVector {
  return {
    execution: clampScore(v.execution),
    reliability: clampScore(v.reliability),
    quality: clampScore(v.quality),
    collaboration: clampScore(v.collaboration),
  };
}

/** 综合分：加权平均（0–10000）。与 ReputationRegistry.compositeScore 链上算法一致。 */
export function compositeScore(v: ReputationVector): number {
  const n = normalizeVector(v);
  return clampScore(
    (n.execution * VECTOR_WEIGHTS.execution +
      n.reliability * VECTOR_WEIGHTS.reliability +
      n.quality * VECTOR_WEIGHTS.quality +
      n.collaboration * VECTOR_WEIGHTS.collaboration) /
      (VECTOR_WEIGHTS.execution +
        VECTOR_WEIGHTS.reliability +
        VECTOR_WEIGHTS.quality +
        VECTOR_WEIGHTS.collaboration),
  );
}

/** 综合分 → 等级 */
export function toLevel(score: number): ReputationLevel {
  const s = clampScore(score);
  if (s >= LEVEL_THRESHOLDS.Diamond) return "Diamond";
  if (s >= LEVEL_THRESHOLDS.Platinum) return "Platinum";
  if (s >= LEVEL_THRESHOLDS.Gold) return "Gold";
  if (s >= LEVEL_THRESHOLDS.Silver) return "Silver";
  if (s >= LEVEL_THRESHOLDS.Bronze) return "Bronze";
  return "Bronze"; // 入门默认 Bronze 之下不另设档
}

/** 是否达到等级门槛（用于"未入门"展示判断） */
export function isUnranked(score: number): boolean {
  return clampScore(score) < LEVEL_THRESHOLDS.Bronze;
}

/**
 * 指数滑动平均更新单个维度：new = old*(1-α) + sample*α
 * α 默认 0.3（近期样本权重），历史越久影响越小（时序衰减的最简实现）。
 */
export function emaUpdate(oldValue: number, sample: number, alpha = 0.3): number {
  const a = Math.min(1, Math.max(0, alpha));
  return clampScore(oldValue * (1 - a) + clampScore(sample) * a);
}

/**
 * 基于一次任务事件更新向量（V1 简化模型）：
 * - completed: execution/reliability 样本记 10000（满分）× 质量自评并入 quality
 * - failed:    execution/reliability 样本记 0
 * - collaboration 样本来自响应速度（durationMs 越短越高，>1h 记 0，<1min 记满分）
 */
export interface TaskEventInput {
  completed: boolean;
  qualitySelfReport?: number; // 0–1
  durationMs?: number;
}

export function updateVector(prev: ReputationVector, ev: TaskEventInput, alpha = 0.3): ReputationVector {
  const perfSample = ev.completed ? 10000 : 0;
  const qualitySample =
    ev.qualitySelfReport != null ? clampScore(ev.qualitySelfReport * 10000) : perfSample;
  const duration = ev.durationMs ?? 60_000;
  const collabSample = clampScore(10000 * (1 - Math.min(1, Math.max(0, (duration - 60_000) / (3_600_000 - 60_000)))));

  return {
    execution: emaUpdate(prev.execution, perfSample, alpha),
    reliability: emaUpdate(prev.reliability, perfSample, alpha),
    quality: emaUpdate(prev.quality, qualitySample, alpha),
    collaboration: emaUpdate(prev.collaboration, collabSample, alpha),
  };
}

/** 初始向量（新 Agent 从 5000 中位起步，避免冷启动极端值） */
export function initialVector(): ReputationVector {
  return { execution: 5000, reliability: 5000, quality: 5000, collaboration: 5000 };
}
