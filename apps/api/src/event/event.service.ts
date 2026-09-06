import { Injectable, Logger, BadRequestException, UnauthorizedException, NotFoundException } from "@nestjs/common";
import { verifyMessage } from "viem";
import type { Address } from "viem";
import { canonicalize, type C2CEventEnvelope } from "@c2c/agent-sdk";
import { updateVector, initialVector, compositeScore, type ReputationVector } from "@c2c/reputation-engine";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProofService } from "../proof/proof.service.js";
import { AttestationService } from "../attestation/attestation.service.js";
import { EVENT_FUTURE_SKEW_SEC, REQUIRE_SIGNATURE, SCORE_MIN_INTERVAL_MS } from "../config/env.js";

export type IngestStatus = "processed" | "duplicate";

/**
 * Path 2 事件入口编排（saga）：
 *   验签 → 幂等 → 时间戳单调 → 落库 Event → completed/failed 触发评分
 *   → ProofService(canonicalJson→keccak→Kubo) → AttestationService(EIP-712 签名)
 *   → submitScore 上链 → 回写 VectorSnapshot/Proof → trace 日志
 * per-agent mutex：同 agent 的“读 nonce→上链”串行化，避免 nonce 竞争。
 */
@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);
  private readonly agentLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly proof: ProofService,
    private readonly attestation: AttestationService,
  ) {}

  async ingest(env: C2CEventEnvelope): Promise<{ status: IngestStatus }> {
    // 幂等：已存在 eventId 直接返回（SDK 重试友好，不重复计算/上链）
    const existing = await this.prisma.event.findUnique({ where: { idempotencyKey: env.eventId } });
    if (existing) {
      this.logger.log(`duplicate eventId=${env.eventId} agent=${env.agentId}`);
      return { status: "duplicate" };
    }

    const agent = await this.prisma.agent.findUnique({ where: { chainAgentId: Number(env.agentId) } });
    if (!agent) throw new NotFoundException(`EVT_UNKNOWN_AGENT agent ${env.agentId}`);

    // 验签（EIP-191 personal_sign，canonicalize 与 SDK 同源）
    await this.verifySignature(env, agent.ownerAddress);

    // per-agent 串行化（同 agent 事件按序处理，防止 nonce/快照竞争）
    const lockKey = agent.id;
    const prev = this.agentLocks.get(lockKey) ?? Promise.resolve();
    const run = prev.then(() => this.processEvent(env, agent));
    // 关键：run 的 rejection 不能让链断掉（下一事件仍可处理），记录并抛给调用方
    this.agentLocks.set(lockKey, run.catch(() => undefined));
    return run;
  }

  private async verifySignature(env: C2CEventEnvelope, ownerAddress: string): Promise<void> {
    if (!env.signature) {
      // REQUIRE_SIGNATURE=false（默认）：匿名事件放行，便于裸 L0 调试（V1 开放协议）。
      // =true：强制签名，缺签名 401——生产/评审演示建议开启（信任锚 = 签名者密钥）。
      if (!REQUIRE_SIGNATURE) return;
      throw new UnauthorizedException("EVT_SIGNATURE_REQUIRED");
    }
    const canonical = canonicalize(env);
    try {
      const ok = await verifyMessage({
        address: ownerAddress as Address,
        message: canonical,
        signature: env.signature as `0x${string}`,
      });
      if (!ok) throw new Error("recovered address mismatch");
    } catch {
      throw new UnauthorizedException("EVT_BAD_SIGNATURE");
    }
  }

  private async processEvent(
    env: C2CEventEnvelope,
    agent: { id: string; chainAgentId: number | null },
  ): Promise<{ status: IngestStatus }> {
    // 时间戳单调
    const nowSec = Math.floor(Date.now() / 1000);
    if (env.timestamp > nowSec + EVENT_FUTURE_SKEW_SEC) {
      throw new BadRequestException("EVT_FUTURE");
    }
    const lastEvent = await this.prisma.event.findFirst({
      where: { agentId: agent.id },
      orderBy: { ts: "desc" },
    });
    if (lastEvent && env.timestamp < Number(lastEvent.ts)) {
      throw new BadRequestException("EVT_OUT_OF_ORDER");
    }

    // 落库 Event（副作用；返回行无需持有）
    await this.prisma.event.create({
      data: {
        idempotencyKey: env.eventId,
        agentId: agent.id,
        action: env.action,
        taskId: env.taskId,
        payload: (env.payload ?? {}) as object,
        ts: BigInt(env.timestamp),
      },
    });

    // 任务状态对账（幂等）：task.completed 事件若对应已领取任务 → 置 COMPLETED。
    // 仅当 Task 存在且处于 ASSIGNED；不在此处上链 completeTask（发布者确认在 /tasks/complete 做），
    // 也不影响下方评分逻辑。
    if (env.action === "task.completed") {
      await this.reconcileTaskCompleted(env, agent);
    }

    // 仅 completed/failed 触发评分
    if (env.action === "task.started" || env.action === "proof.submitted") {
      this.logger.log(`event recorded action=${env.action} eventId=${env.eventId} agent=${env.agentId}`);
      return { status: "processed" };
    }

    // task.claimed 只记账（不计分、不对账状态——领取状态由 /tasks/claim 驱动）
    if (env.action === "task.claimed") {
      this.logger.log(`event recorded action=${env.action} eventId=${env.eventId} agent=${env.agentId} (no-op for scoring)`);
      return { status: "processed" };
    }

    return this.scoreFromEvent(env, agent);
  }

  /** task.completed 对账：若 SDK taskId == Task.externalId 且已 ASSIGNED → COMPLETED（幂等，无链上副作用） */
  private async reconcileTaskCompleted(
    env: C2CEventEnvelope,
    agent: { id: string; chainAgentId: number | null },
  ): Promise<void> {
    try {
      const task = await this.prisma.task.findUnique({ where: { externalId: env.taskId } });
      if (!task) return; // 非市场任务（普通 SDK 上报），忽略
      if (task.status !== "ASSIGNED") return; // 幂等：已 COMPLETED/CANCELLED 不重复写
      // 领取 agent 必须与上报事件的 agent 一致（防串号）
      if (task.assignedAgentId !== agent.id) {
        this.logger.warn(`task.completed agent mismatch externalId=${env.taskId} eventAgent=${agent.id} taskAgent=${task.assignedAgentId}`);
        return;
      }
      await this.prisma.task.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      this.logger.log(`task reconciled COMPLETED externalId=${env.taskId}`);
    } catch (err) {
      // 对账失败不阻断事件主流程（评分照常）
      this.logger.warn(`reconcileTaskCompleted failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async scoreFromEvent(
    env: C2CEventEnvelope,
    agent: { id: string; chainAgentId: number | null },
  ): Promise<{ status: IngestStatus }> {
    // 频率限制（V1 反作弊底线）
    const lastSnapshot = await this.prisma.vectorSnapshot.findFirst({
      where: { agentId: agent.id },
      orderBy: { updatedAt: "desc" },
    });
    if (lastSnapshot && Date.now() - lastSnapshot.updatedAt.getTime() < SCORE_MIN_INTERVAL_MS) {
      throw new BadRequestException("EVT_RATE_LIMIT");
    }

    // 事件统计（该 agent 历史 completed/failed 计数，决定 tasksCompleted）
    const [completed, failed] = await Promise.all([
      this.prisma.event.count({ where: { agentId: agent.id, action: "task.completed" } }),
      this.prisma.event.count({ where: { agentId: agent.id, action: "task.failed" } }),
    ]);

    // 引擎算向量（EMA）
    const prev: ReputationVector = lastSnapshot
      ? {
          execution: lastSnapshot.execution,
          reliability: lastSnapshot.reliability,
          quality: lastSnapshot.quality,
          collaboration: lastSnapshot.collaboration,
        }
      : initialVector();
    const completedFlag = env.action === "task.completed";
    const payload = env.payload ?? {};
    const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : undefined;
    const qualitySelfReport =
      typeof payload.qualitySelfReport === "number" ? payload.qualitySelfReport : undefined;
    const vector = updateVector(prev, { completed: completedFlag, qualitySelfReport, durationMs });
    const score = compositeScore(vector);

    // Proof JSON → keccak → Kubo
    const eventsTotal = completed + failed;
    const proof = await this.proof.generateAndPin({
      schemaVersion: 1,
      agentId: env.agentId,
      chainAgentId: agent.chainAgentId ?? undefined,
      taskIds: [env.taskId],
      vector,
      score,
      eventsSummary: { completed, failed, total: eventsTotal },
      evaluatedAt: Math.floor(Date.now() / 1000),
    });

    // 链上 nonce 读取 + EIP-712 签名 + submitScore（mutex 内已串行，无竞争）
    const chainAgentId = agent.chainAgentId ?? Number(env.agentId);
    const nonce = await this.attestation.readNonce(BigInt(chainAgentId));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const { txHash } = await this.attestation.signAndSubmit(
      {
        agentId: BigInt(chainAgentId),
        execution: vector.execution,
        reliability: vector.reliability,
        quality: vector.quality,
        collaboration: vector.collaboration,
        tasksCompleted: BigInt(completed),
        proofHash: proof.proofHash,
      },
      nonce,
      deadline,
    );

    // 回写 VectorSnapshot + Proof + Agent.chainVerified
    await this.prisma.$transaction([
      this.prisma.vectorSnapshot.create({
        data: {
          agentId: agent.id,
          execution: vector.execution,
          reliability: vector.reliability,
          quality: vector.quality,
          collaboration: vector.collaboration,
          composite: score,
          proofHash: proof.proofHash,
          txHash,
        },
      }),
      this.prisma.proof.create({
        data: {
          agentId: agent.id,
          hash: proof.proofHash,
          cid: proof.cid,
          payloadJson: proof.proofJson as unknown as object,
        },
      }),
      this.prisma.agent.update({
        where: { id: agent.id },
        data: { chainVerified: true, lastScoreTx: txHash },
      }),
    ]);

    this.logger.log(
      `scored agent=${env.agentId} event=${env.eventId} vector=[${vector.execution},${vector.reliability},${vector.quality},${vector.collaboration}] score=${score} proofHash=${proof.proofHash} cid=${proof.cid} tx=${txHash}`,
    );
    return { status: "processed" };
  }
}
