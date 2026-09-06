import LiveDashboard from "@/components/LiveDashboard";
import { fetchAgents, fetchHealth, API_URL } from "@/lib/api";
import type { AgentListItem } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  let agents: AgentListItem[] = [];
  // 初始 undefined：api 不可达时渲染错误横幅（不可用 "api connected" 抢占）
  let health: string | undefined;

  try {
    const [a, h] = await Promise.all([
      fetchAgents().catch(() => [] as AgentListItem[]),
      fetchHealth().then((h) =>
        h?.ok ? (h.db && h.chain && h.ipfs ? "api ok · db+chain+ipfs" : "api ok · 部分降级") : undefined,
      ),
    ]);
    agents = a;
    health = h;
  } catch {
    agents = [];
  }

  return (
    <>
      {!health && (
        <div className="error-banner" style={{ marginTop: 16 }}>
          ⚠ 无法连接 api（{API_URL}）。请先启动后端：<code>pnpm api:start</code>
        </div>
      )}
      <LiveDashboard initialAgents={agents} health={health} />
    </>
  );
}
