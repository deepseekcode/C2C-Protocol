/**
 * C2C Protocol · 常驻演示驱动（Resident Demo Driver）
 *
 * 目的：解决"评审现场数据不产生"——评审人只看屏幕、不动手时，
 * 本驱动按固定节奏自动持续产生真实全链路数据（Path1 注册 → Path2 行为 → Path3 上链）。
 * 每一轮都在 Fuji（或本地 hardhat）上留下真实交易，Dashboard LIVE 轮询会自动弹 toast。
 *
 * 用法（仓库根，API :3000 需已启动）：
 *   pnpm demo:start          # 常驻循环（默认每 60s 一轮，评审现场跑这个）
 *   pnpm demo:once           # 只跑一轮（验证/自检用）
 *   pnpm demo:cycles 5       # 跑 5 轮后退出
 *   # 可选参数：--interval 30 --boost-every 2 --cycles 3
 *   # 可选 env：API_URL / DEMO_INTERVAL_SEC / DEMO_MAX_CYCLES / DEMO_BOOST_EVERY / DEMO_ONCE
 *
 * 每轮剧本：
 *   A. 注册 1 个新 Agent（真实 mint AgentIdentity + Passport，owner=OPERATOR）
 *   B. 该 Agent 连续上报 2~3 个任务（task.started → task.completed，带 quality/duration）
 *   C. 轮询 GET /reputation/:id 直到 chainVerified=true（score 已 EIP-712 上链）
 *   D. 调用 GET /reputation/verify/:id 展示"DB 原文重算 hash == 链上 proofHash"
 * 附加（每 4 轮一次）：给现有最高分 Agent 追加 1 个任务，演示既有声誉继续增长。
 *
 * 容错：单轮失败不中断循环；API/RPC 不可达时打印告警并按间隔重试。
 */
import { C2CAgent } from "@c2c/agent-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 配置 ───────────────────────────

const API = process.env.API_URL ?? "http://127.0.0.1:3000";
const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};

/** 每轮间隔（秒）。评审现场默认 60s 一轮；验证时可 --interval 缩短 */
const INTERVAL_SEC = Number(argValue("--interval") ?? process.env.DEMO_INTERVAL_SEC ?? "60");
/** 0 = 无限常驻；--once / --cycles N 限定轮数 */
const onceFlag = args.includes("--once") || process.env.DEMO_ONCE === "1";
const maxCycles = onceFlag ? 1 : Number(argValue("--cycles") ?? process.env.DEMO_MAX_CYCLES ?? "0");
/** 每 N 轮给既有高分 Agent 追加 1 任务（默认 4；验证时可 --boost-every 1） */
const BOOST_EVERY = Number(argValue("--boost-every") ?? process.env.DEMO_BOOST_EVERY ?? "4");

/** Agent 展示名主题池（可读、评审友好） */
const THEMES = [
  "phoenix", "beacon", "weaver", "sentry", "scout", "harbor",
  "nova", "atlas", "juno", "lyra", "onyx", "ember", "cobalt", "glacier",
  "basalt", "verdant", "runner", "cedar",
];

// ─────────────────────────── 工具 ───────────────────────────

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function loadRootEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(path.join(root, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* 无 .env → 仅 process.env */ }
  return out;
}

const env = loadRootEnv();
const OPERATOR_KEY = (process.env.OPERATOR_PRIVATE_KEY ?? env.OPERATOR_PRIVATE_KEY ?? "").trim();
if (!/^0x[0-9a-fA-F]{64}$/.test(OPERATOR_KEY)) {
  console.error("[demo-driver] 缺少 OPERATOR_PRIVATE_KEY（根 .env 中 Fuji/本地部署钱包私钥）。");
  process.exit(1);
}
const operator = privateKeyToAccount(OPERATOR_KEY as `0x${string}`);
const OWNER = operator.address;

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(5, 19);
}
function log(msg: string): void {
  console.log(`[${ts()}] ${msg}`);
}

async function request<T>(method: string, p: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${p}`, {
      method,
      headers: { "content-type": "application/json", authorization: "Bearer dev-seed" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : undefined) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function pollUntil<T>(
  fn: () => Promise<T | null>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fn();
      if (r !== null) return r;
    } catch { /* 未就绪，继续等 */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`pollUntil timeout: ${label} (${timeoutMs}ms)`);
}

interface AgentRow {
  agentId: string;
  name: string;
  score?: number | null;
  chainVerified?: boolean | null;
}

/** 从 Dashboard /agents 找到现有 demo-* 的最大序号（重启后继续递增，避免重名混乱） */
async function nextDemoSeq(): Promise<number> {
  try {
    const list = await request<AgentRow[]>("GET", "/agents");
    const seqs = list
      .map((a) => a.name?.match(/^demo-(\d+)-/)?.[1])
      .filter((s): s is string => !!s)
      .map((s) => Number(s));
    return seqs.length ? Math.max(...seqs) + 1 : 1;
  } catch {
    return 1; // 列表读不到（API 未起）→ 从 1 起，后续由调用方容错
  }
}

/** 注册新 Agent（真实 mint） */
async function registerAgent(name: string): Promise<{ chainAgentId: number; txHash: string }> {
  const reg = await request<{ chainAgentId: number; txHash: string }>("POST", "/agents", {
    name,
    metadataURI: `ipfs://demo/${name}`,
    ownerPrivateKey: OPERATOR_KEY,
  });
  return reg;
}

/** 让某 Agent 上报 N 个任务并等待每次评分上链结果 */
async function runTasksForAgent(agentId: string, tasks: { quality: number; durationMs: number }[]): Promise<void> {
  const signer = (message: string) => operator.signMessage({ message }) as Promise<`0x${string}`>;
  const sdk = new C2CAgent({
    apiKey: "dev-seed",
    endpoint: API,
    agentId,
    agentFramework: "demo-driver",
    signer,
  });

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const taskId = `demo-${agentId}-${Date.now()}-${i}`;
    const startedAt = Date.now() - t.durationMs;
    await sdk.task.start({ taskId, type: "code-review", metadata: { demo: true } });
    await new Promise((r) => setTimeout(r, 800));
    await sdk.task.complete(
      { taskId, startedAt },
      { qualitySelfReport: t.quality, durationMs: t.durationMs, resultURI: `ipfs://demo/${taskId}` },
    );
    log(`   ↳ task ${i + 1}/${tasks.length} reported  quality=${t.quality} duration=${Math.round(t.durationMs / 60_000)}min`);
    // SCORE_MIN_INTERVAL_MS=1000：同 agent 连续评分至少间隔 1.5s（另留 Fuji 出块时间）
    await new Promise((r) => setTimeout(r, 1600));
  }
}

/** 轮询直至该 Agent 链上声誉出现且本地一致（chainVerified=true） */
async function waitVerified(agentId: string, timeoutMs = 150_000): Promise<{
  score: number;
  level?: string;
  vector: { execution: number; reliability: number; quality: number; collaboration: number };
  proofHash?: string;
}> {
  return pollUntil(
    async () => {
      const r = await request<{
        chainVerified: boolean;
        score: number;
        level?: string;
        vector: { execution: number; reliability: number; quality: number; collaboration: number };
        proofHash?: string;
      }>("GET", `/reputation/${agentId}`);
      return r.chainVerified ? r : null;
    },
    timeoutMs,
    `reputation/${agentId}`,
  );
}

/** 展示 Path 3 Proof 可验证性：重算 hash == 链上 hash */
async function showVerify(agentId: string): Promise<void> {
  try {
    const v = await request<{ status: string; matched: boolean; recomputed: string | null }>(
      "GET",
      `/reputation/verify/${agentId}`,
      undefined,
      20_000,
    );
    if (v.status === "verified" && v.matched) {
      log(`   ✓ Path3 verify: DB原文keccak == 链上proofHash  (${v.recomputed?.slice(0, 20)}…)`);
    } else {
      log(`   ✗ Path3 verify: status=${v.status} matched=${v.matched}`);
    }
  } catch (err) {
    log(`   ! Path3 verify 未就绪: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─────────────────────────── 主循环 ───────────────────────────

async function spinOnce(cycle: number): Promise<void> {
  log(`━━━ cycle #${cycle} 开始 ━━━`);
  const seq = await nextDemoSeq();
  const name = `demo-${String(seq).padStart(3, "0")}-${THEMES[(seq - 1) % THEMES.length]}`;
  const t0 = Date.now();

  // A. 注册新 Agent
  const reg = await registerAgent(name);
  log(`A. 注册新 Agent  ${name}  chainAgentId=${reg.chainAgentId}  tx=${reg.txHash.slice(0, 16)}…  owner=${OWNER.slice(0, 10)}…`);

  // B. 行为上报（2~3 个任务；质量/耗时形成不同声誉轨迹）
  const quality = 0.68 + ((seq * 7) % 27) / 100; // 0.68–0.95 轮转
  const taskCount = 2 + (seq % 2); // 2 / 3 交替
  const tasks = Array.from({ length: taskCount }, (_, i) => ({
    quality: Math.min(0.97, quality + i * 0.03),
    durationMs: (8 + ((seq * 13 + i * 23) % 14)) * 60_000, // 8–21 min
  }));
  log(`B. ${name} 上报 ${taskCount} 个任务（quality=${tasks.map((t) => t.quality.toFixed(2)).join("/")}）`);
  await runTasksForAgent(String(reg.chainAgentId), tasks);

  // C. 等评分上链
  log("C. 等待 EIP-712 评分上链（submitScore → Fuji 出块）…");
  const rep = await waitVerified(String(reg.chainAgentId));
  const v = rep.vector;
  log(
    `   ✅ chainVerified=true  score=${rep.score}  level=${rep.level}  ` +
      `vector=[E${v.execution} R${v.reliability} Q${v.quality} C${v.collaboration}]`,
  );

  // D. Proof 链上可验证性
  await showVerify(String(reg.chainAgentId));

  // 附加（每 BOOST_EVERY 轮）：既有高分 Agent 追加任务 → 声誉继续增长
  if (BOOST_EVERY > 0 && cycle % BOOST_EVERY === 0) {
    await boostExistingAgent(reg.chainAgentId);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`✓ cycle #${cycle} 完成（${elapsed}s）：${name} → score=${rep.score}，链上 tx 已落`);
}

/** 给除最新外的最优 Agent 追加 1 个任务，展示"分数继续涨" */
async function boostExistingAgent(skipChainId: number): Promise<void> {
  try {
    const list = await request<AgentRow[]>("GET", "/agents");
    const candidates = list
      .filter((a) => Number(a.agentId) !== skipChainId && a.chainVerified && typeof a.score === "number")
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const target = candidates[0];
    if (!target) return;
    log(`B+. 追加任务给既有 Agent ${target.name}（原 score=${target.score}）…`);
    const before = target.score as number;
    await runTasksForAgent(target.agentId, [{ quality: 0.9, durationMs: 12 * 60_000 }]);
    const after = await waitVerified(target.agentId, 120_000);
    const delta = after.score - before;
    log(`   ✅ ${target.name}: ${before} → ${after.score}（Δ${delta >= 0 ? "+" : ""}${delta}）`);
  } catch (err) {
    log(`   ! 追加任务失败（不影响主循环）: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  log(`C2C demo-driver 启动`);
  log(`  API=${API}  operator=${OWNER.slice(0, 10)}…`);
  log(`  模式: ${maxCycles > 0 ? `固定 ${maxCycles} 轮` : "常驻循环"}  每轮间隔=${INTERVAL_SEC}s`);

  let cycle = 0;
  // 启动前先探活（API 没起 → 打印指引，不静默空转）
  try {
    await request("GET", "/agents", undefined, 8000);
  } catch {
    log("✗ API 不可达。请先启动后端：pnpm api:start（依赖 PG + 部署 + 链 RPC）。30s 后重试…");
    await new Promise((r) => setTimeout(r, 30_000));
  }

  for (;;) {
    cycle += 1;
    const cycleStart = Date.now();
    try {
      await spinOnce(cycle);
    } catch (err) {
      log(`✗ cycle #${cycle} 失败: ${err instanceof Error ? err.message : String(err)}`);
      log("  10s 后进入下一轮（单轮失败不中断演示）…");
      await new Promise((r) => setTimeout(r, 10_000));
    }
    if (maxCycles > 0 && cycle >= maxCycles) break;

    const nextIn = Math.max(5, INTERVAL_SEC * 1000 - (Date.now() - cycleStart));
    log(`⏳ 下一轮约 ${Math.round(nextIn / 1000)}s 后自动开始（评审期间无需任何手动操作）`);
    await new Promise((r) => setTimeout(r, nextIn));
  }
  log("demo-driver 完成（达到最大轮数）。");
}

main().catch((err) => {
  console.error(`[demo-driver] 致命错误: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
