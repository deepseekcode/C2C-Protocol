/**
 * api e2e 测试（真实后端链路）。
 *
 * 前置：Docker PG + hardhat node + deploy:local + api 已启动（见 scripts/run-e2e.sh 编排）。
 * 本套件直接对 http://127.0.0.1:3000 断言：
 *   health → agent 注册 → SDK 事件流 → 声誉链上验证 → 幂等去重 → 签名/时间戳边界。
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { C2CAgent } from "@c2c/agent-sdk";
import { privateKeyToAccount } from "viem/accounts";

const API = process.env.API_URL ?? "http://127.0.0.1:3000";
const OWNER_KEY =
  process.env.SEED_SIGNER_KEY ??
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const owner = privateKeyToAccount(OWNER_KEY as `0x${string}`);

async function req<T = unknown>(method: string, path: string, body?: unknown, expectStatus = 200): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer dev" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  assert.equal(res.status, expectStatus, `${method} ${path} → ${res.status}: ${text}`);
  return data as T;
}

interface RepPayload {
  chainVerified: boolean;
  score: number;
  proofHash?: string;
  vector: { execution: number; reliability: number; quality: number; collaboration: number };
}

async function pollRep(agentId: string, timeoutMs = 25000): Promise<RepPayload> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await req<RepPayload>("GET", `/reputation/${agentId}`);
      if (r.chainVerified) return r;
    } catch {
      /* 未就绪重试 */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`timeout waiting reputation chainVerified for agent ${agentId}`);
}

let registeredAgentId = "";
let sdk: C2CAgent;

function makeSdk(agentId: string): C2CAgent {
  const signer = (m: string) => owner.signMessage({ message: m }) as Promise<`0x${string}`>;
  return new C2CAgent({
    apiKey: "dev",
    endpoint: API,
    agentId,
    signer,
    maxRetries: 1,
    trace: false,
  });
}

before(async () => {
  // health 就绪
  await req("GET", "/health", undefined, 200);
  sdk = makeSdk("0");
});

after(() => {
  /* 无清理：hardhat 链与 PG 为一次性环境 */
});

test("e2e Path1: 注册 Agent 返回 chainAgentId", async () => {
  const name = `e2e-${Date.now()}`;
  const reg = await req<{ chainAgentId: number; txHash: string }>("POST", "/agents", {
    name,
    metadataURI: `ipfs://e2e/${name}`,
    ownerAddress: owner.address,
    ownerPrivateKey: OWNER_KEY, // 与事件签名同一账户（hardhat #1）
  }, 201); // Nest POST 默认 201 Created
  assert.ok(reg.chainAgentId > 0, `chainAgentId=${reg.chainAgentId}`);
  assert.ok(reg.txHash.startsWith("0x"));
  registeredAgentId = String(reg.chainAgentId);
  sdk = makeSdk(registeredAgentId); // 用真实注册值重建 SDK
});

test("e2e Path2: task.started + task.completed 触发评分上链（幂等）", async () => {
  assert.ok(registeredAgentId, "需先注册");
  const handle = await sdk.task.start({ taskId: `e2e-task-${Date.now()}`, type: "review" });
  await sdk.task.complete(handle, { qualitySelfReport: 0.85, durationMs: 300_000 });

  // 重复发同一事件（重放）→ 幂等不报错
  await sdk.submitEnvelope({
    eventId: "dup-event",
    agentId: registeredAgentId,
    action: "task.started",
    taskId: "dup-task",
    timestamp: Math.floor(Date.now() / 1000),
  });
});

test("e2e Path3: 声誉查询 chainVerified=true + score>0", async () => {
  assert.ok(registeredAgentId);
  const rep = await pollRep(registeredAgentId);
  assert.ok(rep.chainVerified, "chainVerified 应 true");
  assert.ok(rep.score > 0 && rep.score <= 10000, `score=${rep.score}`);
  assert.ok(rep.vector.execution > 0);
  assert.ok(rep.proofHash?.startsWith("0x"));
});

test("e2e Path3-verify: DB 原文重算与链上 proofHash 一致", async () => {
  assert.ok(registeredAgentId);
  const v = await req<{
    agentId: number;
    status: string;
    recomputed: string | null;
    onchain: string | null;
    matched: boolean;
  }>("GET", `/reputation/verify/${registeredAgentId}`);
  assert.equal(v.status, "verified", `status=${v.status}`);
  assert.equal(v.matched, true);
  assert.ok(v.recomputed?.startsWith("0x"), `recomputed=${v.recomputed}`);
  assert.equal(v.recomputed, v.onchain, "重算 hash 应等于链上 hash");
});

test("e2e Path3-verify: 未注册 agent → no-agent", async () => {
  const v = await req<{ status: string; matched: boolean }>("GET", "/reputation/verify/999999999");
  assert.equal(v.status, "no-agent");
  assert.equal(v.matched, false);
});

test("e2e 边界: 未来时间戳事件被拒", async () => {
  await req(
    "POST",
    "/events",
    {
      eventId: `future-${Date.now()}`,
      agentId: registeredAgentId,
      action: "task.started",
      taskId: "future-task",
      timestamp: Math.floor(Date.now() / 1000) + 10_000, // 未来 2.7h
    },
    400,
  );
});

test("e2e 边界: 未知 agent 事件 404", async () => {
  await req(
    "POST",
    "/events",
    {
      eventId: `unknown-${Date.now()}`,
      agentId: "999999999",
      action: "task.started",
      taskId: "x",
      timestamp: Math.floor(Date.now() / 1000),
    },
    404,
  );
});
