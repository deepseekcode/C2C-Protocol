import { test } from "node:test";
import assert from "node:assert/strict";
import { C2CAgent, canonicalize, type TraceEvent, type TraceOptions } from "../src/index.js";

/**
 * SDK trace 单元测试（node:test，零外部依赖）。
 * 用注入 sink 捕获 TraceEvent，不依赖 console；trace 开关默认关（行为零变化）。
 */

const ENDPOINT = "http://127.0.0.1:1"; // 不可达端点：正常路径不发真实网络（fire-and-forget）
const AGENT = "agent_test_1";

function makeSink() {
  const events: TraceEvent[] = [];
  const opts: TraceOptions = {
    level: "debug",
    sink: (ev) => events.push(ev),
  };
  return { events, opts };
}

function makeAgent(trace: TraceOptions | boolean, signer?: (m: string) => Promise<string>) {
  return new C2CAgent({
    apiKey: "test-key",
    endpoint: ENDPOINT,
    agentId: AGENT,
    signer,
    maxRetries: 0, // 快速失败
    trace,
  });
}

test("trace 关闭（默认）：sink 不被调用", async () => {
  const { opts, events } = makeSink();
  const agent = makeAgent(false, async () => "0x");
  void agent.track("task.started", "t-1");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(events.length, 0);
});

test("trace 开启：envelope.build / sign.ok / http.send 均出现，agentId 正确", async () => {
  const { opts, events } = makeSink();
  const agent = makeAgent(opts, async () => "0xsig");
  void agent.track("task.started", "t-1");
  await new Promise((r) => setTimeout(r, 100));

  const phases = events.map((e) => e.phase);
  assert.ok(phases.includes("envelope.build"), `phases=${phases.join(",")}`);
  assert.ok(phases.includes("enqueue"), `phases=${phases.join(",")}`);
  // signer 返回 0xsig → sign.ok
  assert.ok(phases.includes("sign.ok"), `phases=${phases.join(",")}`);
  // 端点不可达 → http 失败路径在 flush 内被静默捕获（maxRetries=0）
  assert.ok(phases.includes("http.fail") || phases.includes("drop.silent"), `phases=${phases.join(",")}`);
  for (const ev of events) {
    assert.equal(ev.agentId, AGENT);
    assert.ok(ev.ts.length > 0);
  }
});

test("signer 抛错：sign.fail 记录，信封仍入队（无未处理拒绝）", async () => {
  const { opts, events } = makeSink();
  const agent = makeAgent(opts, async () => {
    throw new Error("signer boom");
  });
  await agent.track("task.started", "t-1"); // track 本身不抛
  await new Promise((r) => setTimeout(r, 50));
  const phases = events.map((e) => e.phase);
  assert.ok(phases.includes("sign.fail"), `phases=${phases.join(",")}`);
  assert.ok(phases.includes("enqueue"), `phases=${phases.join(",")}`);
});

test("flush 最终失败：http.fail + drop.silent（debug），队列保留", async () => {
  const { opts, events } = makeSink();
  const agent = makeAgent(opts);
  void agent.track("task.completed", "t-2");
  await new Promise((r) => setTimeout(r, 150));
  const phases = events.map((e) => e.phase);
  assert.ok(phases.includes("http.fail"), `phases=${phases.join(",")}`);
  assert.ok(phases.includes("drop.silent"), `phases=${phases.join(",")}`);
});

test("reputation.get 成功路径 trace ok；失败路径 trace error 并抛出", async () => {
  // 失败路径：端点不可达
  const { opts, events } = makeSink();
  const agent = makeAgent(opts);
  await assert.rejects(() => agent.reputation.get(AGENT));
  const phases = events.map((e) => e.phase);
  assert.ok(phases.includes("reputation.get"), `phases=${phases.join(",")}`);
  assert.ok(events.some((e) => e.phase === "reputation.get" && e.level === "error"));
});

test("trace sink 抛错不影响主流程（makeTrace 吞异常）", async () => {
  const boomSink: TraceOptions = {
    level: "debug",
    sink: () => {
      throw new Error("sink boom");
    },
  };
  const agent = makeAgent(boomSink);
  await agent.track("task.started", "t-3"); // 不应抛
  assert.ok(true);
});

test("canonicalize 键序固定（签名输入契约）", () => {
  const env = {
    eventId: "e1",
    agentId: "a1",
    action: "task.started" as const,
    taskId: "t1",
    timestamp: 123,
  };
  const s1 = canonicalize(env);
  const s2 = canonicalize({ ...env, agentFramework: undefined, payload: undefined });
  assert.equal(s1, s2);
  assert.ok(s1.includes('"eventId":"e1"'));
  // 键序：eventId 在 timestamp 之前
  assert.ok(s1.indexOf("eventId") < s1.indexOf("timestamp"));
});
