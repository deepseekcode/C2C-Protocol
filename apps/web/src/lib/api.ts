// C2C web — api 数据访问层（Server Components 内 fetch）
// 本地 dev 默认指向 :3000 api；可用 API_URL 覆盖。

export interface ReputationVector {
  execution: number;
  reliability: number;
  quality: number;
  collaboration: number;
}

export interface AgentListItem {
  agentId: string;
  name: string;
  metadataURI: string | null;
  ownerAddress: string;
  active: boolean;
  passport: boolean;
  chainVerified: boolean;
  vector?: ReputationVector;
  score?: number;
  level?: string;
  proofHash?: string;
}

export const API_URL = process.env.API_URL ?? "http://127.0.0.1:3000";

/** 默认 no-store：Dashboard 展示实时链上/DB 状态 */
export async function fetchAgents(): Promise<AgentListItem[]> {
  const res = await fetch(`${API_URL}/agents`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /agents -> ${res.status}`);
  return (await res.json()) as AgentListItem[];
}

/* ---------- 任务市场（Task Registry） ---------- */

export type TaskStatus = "OPEN" | "ASSIGNED" | "COMPLETED" | "CANCELLED";

export interface TaskItem {
  externalId: string;
  title: string;
  description: string | null;
  publisherAddr: string;
  minScore: number;
  status: TaskStatus;
  publishTx: string | null;
  assignTx: string | null;
  assignedChainAgent: number | null;
  assignedAgentName: string | null;
  assignedScore: number | null;
  createdAt: string;
  completedAt: string | null;
  chainRecorded: boolean;
}

export async function fetchTasks(status?: TaskStatus): Promise<TaskItem[]> {
  const qs = status ? `?status=${status}` : "";
  const res = await fetch(`${API_URL}/tasks${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /tasks -> ${res.status}`);
  return (await res.json()) as TaskItem[];
}

/** 发布任务（服务端持 publisher 私钥上链登记） */
export async function publishTask(input: {
  externalId: string;
  title: string;
  description?: string;
  minScore?: number;
  publisherPrivateKey: string;
}): Promise<TaskItem> {
  const res = await fetch(`${API_URL}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`POST /tasks -> ${res.status} ${await res.text()}`);
  return (await res.json()) as TaskItem;
}

/** Agent 领取任务（服务端持 agent 私钥 + 校验链上声誉门槛） */
export async function claimTask(
  externalId: string,
  input: { agentPrivateKey: string; chainAgentId: number },
): Promise<TaskItem> {
  const res = await fetch(`${API_URL}/tasks/${encodeURIComponent(externalId)}/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`POST /tasks/:id/claim -> ${res.status} ${await res.text()}`);
  return (await res.json()) as TaskItem;
}

/** 轻量健康探针（非致命） */
export async function fetchHealth(): Promise<{ ok: boolean; db: boolean; chain: boolean; ipfs: boolean } | null> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; db: boolean; chain: boolean; ipfs: boolean };
  } catch {
    return null;
  }
}

/* ---------- 纯展示工具（client 复用，与 API 数据无关） ---------- */

/** 引擎四维中文标签（与声誉引擎/合约权重一致） */
export const DIM_META: Record<keyof ReputationVector, { label: string; full: string; weight: number; color: string }> = {
  execution: { label: "Execution", full: "执行", weight: 30, color: "#38bdf8" },
  reliability: { label: "Reliability", full: "可靠", weight: 30, color: "#34d399" },
  quality: { label: "Quality", full: "质量", weight: 25, color: "#fbbf24" },
  collaboration: { label: "Collaboration", full: "协作", weight: 15, color: "#a78bfa" },
};

export const LEVEL_COLORS: Record<string, string> = {
  Bronze: "#e0a37c",
  Silver: "#c3cede",
  Gold: "#f5cd6e",
  Platinum: "#7dd3fc",
  Diamond: "#c4b5fd",
};

/** 展示名降级：seed-agent-xxx → "Research Agent #xxx"（Demo 更产品化，不修改 DB） */
export function displayName(name?: string | null, agentId?: string): string {
  const raw = (name || agentId || "").trim();
  const seed = raw.match(/^seed-agent-(\d+)$/i);
  if (seed) return `Research Agent #${seed[1]}`;
  return raw || "Unknown Agent";
}

/** proofHash 或 tx 摘要短显示 */
export function shortHash(h?: string | null, n = 6): string {
  if (!h) return "—";
  return h.length <= n + 4 ? h : `${h.slice(0, n)}…${h.slice(-4)}`;
}

/* ---------- 实时轮询（client 演示模式） ---------- */

export interface ActivityItem {
  id: string;
  kind: "registered" | "scored" | "verified";
  agentId: string;
  name: string;
  at: string;
}

/** 两次轮询间 agents 增量 → 活动流（Demo 现场跑 seed/事件时页面自行动起来） */
export function deriveActivity(prev: AgentListItem[], next: AgentListItem[]): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const n of next) {
    const p = prev.find((x) => x.agentId === n.agentId);
    if (!p) {
      out.push({
        id: `reg-${n.agentId}-${Date.now()}`,
        kind: "registered",
        agentId: n.agentId,
        name: n.name,
        at: new Date().toISOString(),
      });
    } else if (n.chainVerified && !p.chainVerified) {
      out.push({
        id: `ver-${n.agentId}-${Date.now()}`,
        kind: "verified",
        agentId: n.agentId,
        name: n.name,
        at: new Date().toISOString(),
      });
    } else if (n.score !== undefined && p.score !== n.score) {
      out.push({
        id: `scr-${n.agentId}-${Date.now()}`,
        kind: "scored",
        agentId: n.agentId,
        name: n.name,
        at: new Date().toISOString(),
      });
    }
  }
  return out;
}
