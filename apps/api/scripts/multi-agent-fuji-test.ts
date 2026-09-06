/**
 * Fuji 多数据测试脚本（Path1→Path2→Path3 批量）：
 *   1. 注册 3 个独立 Agent（owner = Fuji operator，即部署钱包，链上真实 mint）
 *   2. 每个 Agent 走 task.started → task.completed（带 quality/duration，EIP-191 签名）
 *   3. task.completed 自动触发评分 → EIP-712 → submitScore 上链
 *   4. 轮询 GET /reputation/:id 直到 chainVerified=true，打印每个 Agent 的分数/向量/proof
 *   5. 汇总断言：3 个 Agent 全部 chainVerified
 *
 * 用法: pnpm --dir apps/api exec tsx scripts/multi-agent-fuji-test.ts
 */
import { C2CAgent } from "@c2c/agent-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.API_URL ?? "http://127.0.0.1:3000";

// 读根 .env（与 api env.ts 同源）
function loadRootEnv(): Record<string, string> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const out: Record<string, string> = {};
  const raw = readFileSync(path.join(root, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadRootEnv();
const OPERATOR_KEY = (env.OPERATOR_PRIVATE_KEY ?? "").trim();
if (!/^0x[0-9a-fA-F]{64}$/.test(OPERATOR_KEY)) {
  console.error("缺少 OPERATOR_PRIVATE_KEY（须为 Fuji 部署钱包私钥，已在 .env）");
  process.exit(1);
}
const operator = privateKeyToAccount(OPERATOR_KEY as `0x${string}`);
console.log(`[multi] operator(owner) = ${operator.address}`);

async function request<T>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer dev-seed" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function pollUntil<T>(fn: () => Promise<T | null>, timeoutMs = 60000, label = ""): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await fn();
    if (r !== null) return r;
    await new Promise((r2) => setTimeout(r2, 1500));
  }
  throw new Error(`pollUntil timeout: ${label}`);
}

// 每 agent 一组任务参数（区分质量/耗时 → 不同向量轨迹）
const scenarios = [
  { name: "fuji-agent-alpha", quality: 0.95, durationMs: 180_000, tasks: 3 },
  { name: "fuji-agent-beta", quality: 0.8, durationMs: 420_000, tasks: 2 },
  { name: "fuji-agent-gamma", quality: 0.65, durationMs: 900_000, tasks: 2 },
];

async function runScenario(sc: (typeof scenarios)[number]): Promise<void> {
  const signer = (message: string) => operator.signMessage({ message }) as Promise<`0x${string}`>;
  const ownerAddress = operator.address;

  // 1. 注册
  const reg = await request<{ chainAgentId: number; txHash: string }>("POST", "/agents", {
    name: sc.name,
    metadataURI: "",
    ownerAddress,
    ownerPrivateKey: OPERATOR_KEY,
  });
  const agentId = String(reg.chainAgentId);
  console.log(`\n[${sc.name}] registered chainAgentId=${agentId} tx=${reg.txHash.slice(0, 18)}…`);

  const sdk = new C2CAgent({
    apiKey: "dev-seed",
    endpoint: API,
    agentId,
    agentFramework: "multi-fuji-test",
    signer,
  });

  // 2. 多任务生命周期
  for (let i = 0; i < sc.tasks; i++) {
    const taskId = `task-${agentId}-${i}-${Date.now()}`;
    await sdk.task.start({ taskId, type: "code-review" });
    await new Promise((r) => setTimeout(r, 300));
    await sdk.task.complete(
      { taskId, startedAt: Date.now() - sc.durationMs },
      { qualitySelfReport: sc.quality, durationMs: sc.durationMs, resultURI: `ipfs://proof/${taskId}` },
    );
    // 同 agent 连续评分间隔 ≥ SCORE_MIN_INTERVAL_MS(1000)
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`[${sc.name}] task ${i + 1}/${sc.tasks} completed`);
  }

  // 3. 轮询声誉 chainVerified
  const rep = await pollUntil(async () => {
    try {
      const r = await request<{
        chainVerified: boolean;
        score: number;
        level?: string;
        vector: { execution: number; reliability: number; quality: number; collaboration: number };
        proofHash?: string;
      }>("GET", `/reputation/${agentId}`);
      return r.chainVerified ? r : null;
    } catch {
      return null;
    }
  }, 90000, `reputation/${agentId}`);

  console.log(
    `[${sc.name}] ✅ chainVerified score=${rep.score} level=${rep.level} ` +
      `vector=[${rep.vector.execution},${rep.vector.reliability},${rep.vector.quality},${rep.vector.collaboration}] proof=${rep.proofHash?.slice(0, 18)}…`,
  );
}

async function main(): Promise<void> {
  console.log(`[multi] 目标 ${API} | 场景数=${scenarios.length}`);
  for (const sc of scenarios) {
    await runScenario(sc);
  }
  console.log(`\n[multi] ✅ 全部 ${scenarios.length} 个 Fuji Agent 完成注册+行为+声誉上链`);
}

main().catch((err) => {
  console.error(`[multi] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
