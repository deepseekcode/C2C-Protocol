/**
 * @c2c/agent-sdk — L1 核心 SDK（零框架依赖）
 *
 * 设计原则（实施方案 §5，agent-agnostic）：
 * - 本包不依赖任何 Agent 框架与 Node-only API，Node >= 18 / Bun / Deno / 浏览器均可运行。
 * - 签名通过可选 `signer` 回调注入（EIP-191），SDK 核心不绑定任何钱包库。
 * - L2 适配器（DeepSeekCode 插件 / Claude Code hooks / Codex notify / LangChain ...）
 *   实现 AgentHarness 接口，把宿主 Agent 的生命周期翻译为本包事件流。
 */

// ─────────────────────────── L0 事件信封 ───────────────────────────

export type C2CEventAction =
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "proof.submitted";

/** L0 开放事件信封（POST /events，规范公开，任何语言可对接） */
export interface C2CEventEnvelope {
  /** 幂等键（UUID 等），同一 eventId 服务端只处理一次 */
  eventId: string;
  agentId: string;
  /** 自由文本元数据标签：deepseekcode / claude-code / codex / langchain / custom... */
  agentFramework?: string;
  action: C2CEventAction;
  taskId: string;
  payload?: Record<string, unknown>;
  timestamp: number;
  /** Agent 身份密钥对 canonical payload 的 EIP-191 签名（可选，由 signer 注入） */
  signature?: string;
}

// ─────────────────────────── L2 适配器接口 ───────────────────────────

export interface SessionContext {
  sessionId: string;
  startedAt: number;
  metadata?: Record<string, unknown>;
}

export interface TaskContext {
  taskId: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  resultURI?: string;
  qualitySelfReport?: number; // 0–1
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 统一适配器接口：任何 Agent（DeepSeekCode / Claude Code / Codex / 自研）
 * 实现本接口即可接入 C2C，协议/合约/后端零改动。
 */
export interface AgentHarness {
  readonly name: string;
  onSessionStart?(ctx: SessionContext): void | Promise<void>;
  onTaskStart?(ctx: TaskContext): void | Promise<void>;
  onTaskComplete?(ctx: TaskContext, result: TaskResult): void | Promise<void>;
  onTaskFailed?(ctx: TaskContext, error: unknown): void | Promise<void>;
}

// ─────────────────────────── Trace 日志（可选，默认关） ───────────────────────────

export type TraceLevel = "debug" | "info" | "warn" | "error";

export interface TraceEvent {
  ts: string; // ISO 8601
  level: TraceLevel;
  agentId: string;
  phase: string; // 稳定机器键：envelope.build / sign.start / http.send ...
  msg: string;
  extra?: Record<string, unknown>;
}

/** 同步 sink，禁止抛错（内部捕获，绝不中断 Agent 主流程） */
export type TraceSink = (ev: TraceEvent) => void;

export interface TraceOptions {
  level?: TraceLevel; // 默认 "info"
  sink?: TraceSink; // 默认 console 打印 [c2c-sdk] 前缀行
}

// ─────────────────────────── L1 C2CAgent ───────────────────────────

export interface C2CAgentOptions {
  apiKey: string;
  endpoint: string; // e.g. https://api.c2c.network
  agentId: string;
  agentFramework?: string;
  /** 可选 EIP-191 签名器：(canonicalMessage) => 0x 签名。由适配器/钱包注入。 */
  signer?: (message: string) => Promise<string>;
  /** 失败重试次数（指数退避），默认 3 */
  maxRetries?: number;
  /** trace 开关：true = {level:"info"}；或自定义 level/sink。默认关（零行为变化） */
  trace?: TraceOptions | boolean;
}

export interface ReputationInfo {
  vector: { execution: number; reliability: number; quality: number; collaboration: number };
  score: number;
  level: string;
  proofHash?: string;
  chainVerified: boolean;
}

export interface InitializeResult {
  passport: boolean;
  vector?: ReputationInfo["vector"];
  level?: string;
  snowtraceURL?: string;
}

interface TaskHandle {
  taskId: string;
  startedAt: number;
}

export class C2CAgent {
  private readonly opts: Required<Pick<C2CAgentOptions, "maxRetries">> & C2CAgentOptions;
  private queue: C2CEventEnvelope[] = [];
  private flushing = false;
  private readonly trace: ReturnType<typeof makeTrace>;

  constructor(options: C2CAgentOptions) {
    if (!options.apiKey) throw new Error("C2CAgent: apiKey is required");
    if (!options.endpoint) throw new Error("C2CAgent: endpoint is required");
    if (!options.agentId) throw new Error("C2CAgent: agentId is required");
    this.opts = { maxRetries: 3, ...options };
    this.trace = makeTrace(options.trace, options.agentId);
  }

  /** 初始化：校验身份并拉取链上声誉快照 */
  async initialize(): Promise<InitializeResult> {
    const t0 = Date.now();
    try {
      const res = await this.request<InitializeResult>(
        "GET",
        `/agents/${encodeURIComponent(this.opts.agentId)}/snapshot`,
      );
      this.trace("info", "initialize", "ok", { durationMs: Date.now() - t0, passport: res.passport, level: res.level ?? null });
      return res;
    } catch (err) {
      this.trace("error", "initialize", "failed", { durationMs: Date.now() - t0, errorMessage: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  readonly task = {
    start: async (input: { taskId: string; type?: string; metadata?: Record<string, unknown> }): Promise<TaskHandle> => {
      await this.track("task.started", input.taskId, { type: input.type, ...input.metadata });
      this.trace("info", "task.start", "ok", { taskId: input.taskId, type: input.type ?? null });
      return { taskId: input.taskId, startedAt: Date.now() };
    },
    complete: async (handle: TaskHandle, result: TaskResult = {}): Promise<void> => {
      const durationMs = result.durationMs ?? Date.now() - handle.startedAt;
      await this.track("task.completed", handle.taskId, { ...result, durationMs });
      this.trace("info", "task.complete", "ok", { taskId: handle.taskId, durationMs, qualitySelfReport: result.qualitySelfReport ?? null });
    },
    fail: async (handle: TaskHandle, error: unknown): Promise<void> => {
      await this.track("task.failed", handle.taskId, {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - handle.startedAt,
      });
      this.trace("warn", "task.fail", "recorded", { taskId: handle.taskId, errorMessage: error instanceof Error ? error.message : String(error) });
    },
  };

  readonly proof = {
    submit: async (input: { taskId: string; proofCID: string }): Promise<void> => {
      await this.track("proof.submitted", input.taskId, { proofCID: input.proofCID });
      this.trace("info", "proof.submit", "ok", { taskId: input.taskId, proofCID: input.proofCID });
    },
  };

  readonly reputation = {
    get: async (agentId: string): Promise<ReputationInfo> => {
      const t0 = Date.now();
      try {
        const res = await this.request<ReputationInfo>("GET", `/reputation/${encodeURIComponent(agentId)}`);
        this.trace("info", "reputation.get", "ok", { agentId, score: res.score, level: res.level, chainVerified: res.chainVerified, durationMs: Date.now() - t0 });
        return res;
      } catch (err) {
        this.trace("error", "reputation.get", "failed", { agentId, errorMessage: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    },
  };

  /** 原始事件上报（L0 信封构造 + 队列 + 重试）。Agent 主流程永不阻塞。 */
  async track(action: C2CEventAction, taskId: string, payload?: Record<string, unknown>): Promise<void> {
    const envelope: C2CEventEnvelope = {
      eventId: crypto.randomUUID(),
      agentId: this.opts.agentId,
      agentFramework: this.opts.agentFramework,
      action,
      taskId,
      payload,
      timestamp: Math.floor(Date.now() / 1000),
    };
    this.trace("debug", "envelope.build", "built", { eventId: envelope.eventId, action, taskId });
    if (this.opts.signer) {
      this.trace("debug", "sign.start", "signing", { eventId: envelope.eventId });
      try {
        envelope.signature = await this.opts.signer(canonicalize(envelope));
        this.trace("debug", "sign.ok", "signed", { eventId: envelope.eventId });
      } catch (err) {
        this.trace("warn", "sign.fail", "signer threw; envelope stays unsigned", {
          eventId: envelope.eventId,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.queue.push(envelope);
    this.trace("debug", "enqueue", "queued", { eventId: envelope.eventId, queueLength: this.queue.length });
    void this.flush(); // fire-and-forget，不阻塞调用方
  }

  /** 供 L2 适配器直接注入已构造信封 */
  async submitEnvelope(envelope: C2CEventEnvelope): Promise<void> {
    this.queue.push(envelope);
    this.trace("debug", "enqueue", "queued (external envelope)", { eventId: envelope.eventId, action: envelope.action, queueLength: this.queue.length });
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    this.trace("debug", "flush.start", "flush begin", { queueLength: this.queue.length });
    try {
      while (this.queue.length > 0) {
        const env = this.queue[0];
        try {
          await this.requestWithRetry("POST", "/events", env);
          this.queue.shift();
          this.trace("debug", "flush.end", "envelope delivered", { eventId: env.eventId, action: env.action });
        } catch {
          // 重试耗尽：保留在队列中，下次 track 时继续；进程内降级
          this.trace("debug", "drop.silent", "final failure; envelope retained (silent-failure contract)", {
            eventId: env.eventId,
            action: env.action,
            queued: true,
            queueLength: this.queue.length,
          });
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async requestWithRetry(method: string, path: string, body?: unknown): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      try {
        await this.request(method, path, body);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < this.opts.maxRetries) {
          const backoff = 2 ** attempt * 500;
          this.trace("debug", "retry", "request failed; retrying", {
            method,
            path,
            attempt: attempt + 1,
            of: this.opts.maxRetries,
            backoffMs: backoff,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          await sleep(backoff); // 指数退避：500ms, 1s, 2s
        }
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    this.trace("error", "http.fail", "request failed after retries", { method, path, errorMessage: msg });
    throw lastErr;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T>;
  private async request(method: string, path: string, body?: unknown): Promise<void>;
  private async request<T>(method: string, path: string, body?: unknown): Promise<T | void> {
    const t0 = Date.now();
    const res = await fetch(new URL(path, this.opts.endpoint), {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      this.trace("warn", "http.send", "non-ok response", { method, path, status: res.status, durationMs: Date.now() - t0, responseBody: errBody.slice(0, 200) });
      throw new Error(`C2C API ${method} ${path} failed: ${res.status} ${errBody}`);
    }
    this.trace("debug", "http.send", "ok", { method, path, status: res.status, durationMs: Date.now() - t0 });
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

/** L0 信封的 canonical 序列化（签名输入；键序固定，与服务端验签规则一致） */
export function canonicalize(env: Omit<C2CEventEnvelope, "signature">): string {
  return JSON.stringify({
    eventId: env.eventId,
    agentId: env.agentId,
    agentFramework: env.agentFramework ?? null,
    action: env.action,
    taskId: env.taskId,
    payload: env.payload ?? null,
    timestamp: env.timestamp,
  });
}

const LOG_LEVELS: Record<TraceLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** 构造一个不抛错的 trace 发射器（sink 抛错会被吞掉，trace 只观察不干预） */
function makeTrace(opts: C2CAgentOptions["trace"], agentId: string): (level: TraceLevel, phase: string, msg: string, extra?: Record<string, unknown>) => void {
  if (!opts) return () => {};
  const conf: TraceOptions = opts === true ? { level: "info" } : opts;
  const min = conf.level ?? "info";
  const sink: TraceSink =
    conf.sink ??
    ((ev) => {
      const line = `[c2c-sdk] ${ev.ts} ${ev.level.padEnd(5)} agent=${ev.agentId} phase=${ev.phase} ${ev.msg}`;
      if (ev.level === "warn" || ev.level === "error") console.warn(line);
      else console.log(line);
    });
  return (level, phase, msg, extra) => {
    if (LOG_LEVELS[level] < LOG_LEVELS[min]) return;
    try {
      sink({ ts: new Date().toISOString(), level, agentId, phase, msg, extra });
    } catch {
      /* trace 永不抛出 */
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
