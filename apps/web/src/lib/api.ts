// C2C web — api 数据访问层（Server Components 内 fetch）
// 本地 dev 默认指向 :3000 api；可用 API_URL 覆盖。

export interface AgentListItem {
  agentId: string;
  name: string;
  metadataURI: string | null;
  ownerAddress: string;
  active: boolean;
  passport: boolean;
  chainVerified: boolean;
  vector?: { execution: number; reliability: number; quality: number; collaboration: number };
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
