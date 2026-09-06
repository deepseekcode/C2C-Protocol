/**
 * Fuji 多数据测试 — 补充场景 beta/gamma（alpha 已成功）。
 * 注册 → 多任务上报 → 等 chainVerified。每个 agent 独立 try/catch，避免一个失败中断全部。
 */
import { C2CAgent } from "@c2c/agent-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.API_URL ?? "http://127.0.0.1:3000";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const raw = readFileSync(path.join(root, ".env"), "utf8");
const key = raw.match(/^\s*OPERATOR_PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m)?.[1] ?? "";
if (!key) { console.error("no key"); process.exit(1); }
const operator = privateKeyToAccount(key as `0x${string}`);
console.log(`[multi] owner=${operator.address}`);

async function request<T>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer dev-seed" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function pollVerified(agentId: string, timeoutMs = 120000): Promise<unknown> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await request<{ chainVerified: boolean; score: number; level?: string; vector?: unknown }>(
        "GET", `/reputation/${agentId}`);
      if (r.chainVerified) return r;
    } catch { /* not yet */ }
    await new Promise((r2) => setTimeout(r2, 2000));
  }
  throw new Error(`timeout waiting chainVerified for agent ${agentId}`);
}

const scenarios = [
  { name: "fuji-agent-beta", quality: 0.8, durationMs: 420_000, tasks: 2 },
  { name: "fuji-agent-gamma", quality: 0.65, durationMs: 900_000, tasks: 2 },
];

const results: Record<string, unknown> = {};
for (const sc of scenarios) {
  const signer = (m: string) => operator.signMessage({ message: m }) as Promise<`0x${string}`>;
  try {
    // 幂等：若同名 agent 已注册则跳过（DB upsert by chainAgentId 但 name 会冲突，先查 DB 不可行 → 直接注册，服务端 upsert）
    const reg = await request<{ chainAgentId: number }>("POST", "/agents", {
      name: sc.name, metadataURI: "", ownerAddress: operator.address, ownerPrivateKey: key,
    });
    const agentId = String(reg.chainAgentId);
    console.log(`[${sc.name}] registered chainAgentId=${agentId}`);

    const sdk = new C2CAgent({ apiKey: "dev-seed", endpoint: API, agentId, agentFramework: "multi-fuji-test", signer });
    for (let i = 0; i < sc.tasks; i++) {
      const taskId = `task-${agentId}-${i}-${Date.now()}`;
      await sdk.task.start({ taskId, type: "code-review" });
      await new Promise((r) => setTimeout(r, 400));
      await sdk.task.complete(
        { taskId, startedAt: Date.now() - sc.durationMs },
        { qualitySelfReport: sc.quality, durationMs: sc.durationMs, resultURI: "" },
      );
      console.log(`[${sc.name}] task ${i + 1}/${sc.tasks} reported`);
      await new Promise((r) => setTimeout(r, 1600)); // SCORE_MIN_INTERVAL
    }
    const rep = await pollVerified(agentId);
    console.log(`[${sc.name}] ✅ chainVerified: ${JSON.stringify(rep)}`);
    results[sc.name] = rep;
  } catch (err) {
    console.error(`[${sc.name}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    results[sc.name] = { error: err instanceof Error ? err.message : String(err) };
  }
}
console.log("\n=== SUMMARY ===");
for (const [k, v] of Object.entries(results)) console.log(`${k}:`, JSON.stringify(v));
