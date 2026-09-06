/**
 * C2C Protocol 全链路 e2e 种子脚本（Path1→Path2→Path3 一条龙）。
 *
 * 前置（本地模式）：
 *   - Docker PG 运行：docker compose up -d
 *   - hardhat node：pnpm --dir contracts exec hardhat node
 *   - 另一终端：pnpm --dir contracts deploy:local   （写 contracts/deployments/hardhat.json）
 *   - api 服务：cd apps/api && pnpm start            （自动连 hardhat.json 地址 + PG）
 *   - Kubo daemon（可选，缺省降级 local proof）
 *
 * 用法：
 *   cd apps/api && pnpm seed:e2e
 *
 * 流程：
 *   1. 注册 Agent（POST /agents → 真实 mint AgentIdentity）
 *   2. SDK agent 实例（带 signer）task.start → task.complete → 触发评分上链
 *   3. 等区块 → GET /reputation/:id 断言 chainVerified=true
 *   4. 打印 trace 样例行（若开 trace）
 */
import { C2CAgent } from "@c2c/agent-sdk";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const API = process.env.API_URL ?? "http://127.0.0.1:3000";
const SIGNER_KEY =
  process.env.SEED_SIGNER_KEY ??
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // hardhat acct#1 = EVALUATOR/Agent owner

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer dev-seed" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`seed: ${method} ${path} → ${res.status} ${text}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** 轮询直到 fn 返回非 null 或超时 */
async function pollUntil<T>(fn: () => Promise<T | null>, timeoutMs = 15000, label = ""): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await fn();
    if (r !== null) return r;
    await new Promise((r2) => setTimeout(r2, 700));
  }
  throw new Error(`pollUntil timeout: ${label}`);
}

async function main(): Promise<void> {
  const ownerAccount = privateKeyToAccount(SIGNER_KEY as `0x${string}`);
  console.log(`[seed] owner=${ownerAccount.address}`);

  // 1. 注册 Agent（真实 mint AgentIdentity；owner = 签名账户）
  const agentId = String(Math.floor(Date.now() / 1000) % 1_000_000); // 简单唯一
  const name = `seed-agent-${agentId}`;
  const reg = await request<{ chainAgentId: number; txHash: string }>("POST", "/agents", {
    name,
    metadataURI: `ipfs://seed/${agentId}`,
    ownerAddress: ownerAccount.address,
    ownerPrivateKey: SIGNER_KEY, // 与事件验签同一账户
  });
  console.log(`[seed] registered chainAgentId=${reg.chainAgentId} tx=${reg.txHash.slice(0, 10)}… owner=${ownerAccount.address}`);

  // 2. SDK agent（signer = owner 私钥，EIP-191 签名事件）
  const signer = (message: string) =>
    ownerAccount.signMessage({ message }) as Promise<`0x${string}`>;
  const sdk = new C2CAgent({
    apiKey: "dev-seed",
    endpoint: API,
    agentId: String(reg.chainAgentId),
    agentFramework: "seed-e2e",
    signer,
    maxRetries: 2,
    trace: { level: "debug", sink: (ev) => console.log(`[trace] ${ev.phase} ${ev.msg}`) },
  });

  const handle = await sdk.task.start({ taskId: `task-${Date.now()}`, type: "code-review" });
  console.log(`[seed] task.started taskId=${handle.taskId}`);
  await sdk.task.complete(handle, {
    qualitySelfReport: 0.9,
    durationMs: 240_000,
    resultURI: `ipfs://proof/${handle.taskId}`,
  });
  console.log(`[seed] task.completed (含 qualitySelfReport) — 等待评分上链…`);

  // 3. 轮询声誉：chainVerified=true 才算全链路通
  const rep = await pollUntil(async () => {
    try {
      const r = await request<{
        chainVerified: boolean;
        score: number;
        vector: { execution: number; reliability: number; quality: number; collaboration: number };
        proofHash?: string;
        level?: string;
      }>("GET", `/reputation/${reg.chainAgentId}`);
      return r.chainVerified ? r : null;
    } catch {
      return null;
    }
  }, 30000, `reputation/${reg.chainAgentId}`);

  console.log(`[seed] ✅ chainVerified=true score=${rep.score} level=${rep.level}`);
  console.log(`[seed]    vector=[${rep.vector.execution},${rep.vector.reliability},${rep.vector.quality},${rep.vector.collaboration}]`);
  console.log(`[seed]    proofHash=${rep.proofHash?.slice(0, 18)}…`);
  console.log(`[seed] e2e OK — Path1(注册)→Path2(事件)→Path3(声誉链上验证) 全链路打通`);

  // 4. 校验签名可复算（演示 trust anchor = 签名密钥）
  const canon = JSON.stringify({ proofHash: rep.proofHash, score: rep.score });
  const verified = await verifyMessage({
    address: ownerAccount.address,
    message: canon,
    signature: await signer(canon),
  });
  console.log(`[seed] signer verify=${verified ? "OK" : "MISMATCH"}`);
}

main().catch((err) => {
  console.error(`[seed] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
