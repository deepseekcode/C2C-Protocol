import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createWalletClient, getAddress, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hash } from "viem";
import { PrismaService } from "../prisma/prisma.service.js";
import { AttestationService } from "../attestation/attestation.service.js";
import { taskRegistryAbi } from "../chain/abis.js";
import { contractAddress, publicClient } from "../chain/client.js";
import { RPC_URL } from "../config/env.js";

export type TaskStatus = "OPEN" | "ASSIGNED" | "COMPLETED" | "CANCELLED";

export interface PublishTaskInput {
  externalId: string;
  title: string;
  description?: string;
  /** 发布者私钥（dev 模式直传，仿 /agents register ownerPrivateKey 先例） */
  publisherPrivateKey: string;
  /** 声誉门槛 0–10000（0 = 无门槛） */
  minScore?: number;
}

export interface ClaimTaskInput {
  /** Agent 私钥（= Agent owner / 事件签名身份） */
  agentPrivateKey: string;
  /** AgentIdentity tokenId（链上 agentId） */
  chainAgentId: number;
}

export interface TaskView {
  externalId: string;
  title: string;
  description: string | null;
  publisherAddr: string;
  minScore: number;
  status: TaskStatus;
  publishTx: string | null;
  assignTx: string | null;
  assignedChainAgent: number | null;
  assignedAgentName: string | null;
  assignedScore: number | null;
  createdAt: string;
  completedAt: string | null;
  /** 链上登记是否可查（TaskRegistry 已含该 taskHash） */
  chainRecorded: boolean;
}

/**
 * 任务市场登记（V1：链下状态机 OPEN→ASSIGNED→COMPLETED + TaskRegistry 链上审计登记）。
 *
 * 信任/权限模型：
 *  - 发布者持私钥（本地 dev 直传）→ 计算 taskHash → 调 TaskRegistry.publishTask 上链登记。
 *  - Agent 领取：服务端校验该 agent 链上 ReputationRegistry.compositeScore ≥ minScore，
 *    通过后才调 TaskRegistry.assignTask 登记（链上不裁决分数，只留可审计领取记录）。
 *  - 完成：由发布者确认后调 completeTask（API 上 complete 由事件对账触发，见 EventService）。
 *
 * 明确不做：支付 / 竞价 / 撮合（V1 红线）。
 */
@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly attestation: AttestationService,
  ) {}

  /** taskHash = keccak(chainId, publisher, externalId, minScore) —— 与合约/重算保持同源 */
  private taskHash(publisher: Address, externalId: string, minScore: number): `0x${string}` {
    const pc = publicClient();
    return keccak256(
      toHex(
        JSON.stringify({
          chainId: pc.chain.id,
          publisher: getAddress(publisher),
          externalId,
          minScore,
        }),
      ),
    ) as `0x${string}`;
  }

  /** 发布任务：上链登记 + 落库 OPEN */
  async publish(input: PublishTaskInput): Promise<TaskView> {
    if (!input.externalId?.trim()) throw new BadRequestException("TASK_EMPTY_EXTERNAL_ID");
    if (!input.title?.trim()) throw new BadRequestException("TASK_EMPTY_TITLE");
    const minScore = input.minScore ?? 0;
    if (!Number.isInteger(minScore) || minScore < 0 || minScore > 10000) {
      throw new BadRequestException("TASK_BAD_MIN_SCORE");
    }

    // 发布者 = 私钥对应地址（dev 模式；生产改为钱包签名）
    const publisherKey = input.publisherPrivateKey?.trim();
    if (!publisherKey) throw new BadRequestException("TASK_PUBLISHER_KEY_REQUIRED");
    const publisher = privateKeyToAccount(publisherKey as `0x${string}`);

    // externalId 唯一（幂等）
    const dup = await this.prisma.task.findUnique({ where: { externalId: input.externalId.trim() } });
    if (dup) throw new ConflictException(`TASK_EXTERNAL_ID_EXISTS ${input.externalId}`);

    // 上链登记 publishTask
    const hash = this.taskHash(publisher.address, input.externalId.trim(), minScore);
    const pc = publicClient();
    const wallet = createWalletClient({
      chain: pc.chain,
      transport: http(RPC_URL),
      account: publisher,
    });
    const txHash = (await wallet.writeContract({
      address: contractAddress("TaskRegistry"),
      abi: taskRegistryAbi,
      functionName: "publishTask",
      args: [hash, BigInt(minScore), 0n],
    })) as Hash;

    const row = await this.prisma.task.create({
      data: {
        externalId: input.externalId.trim(),
        title: input.title.trim(),
        description: input.description?.trim() || null,
        publisherAddr: publisher.address.toLowerCase(),
        minScore,
        status: "OPEN",
        publishTx: txHash,
      },
    });

    this.logger.log(`task published externalId=${row.externalId} publisher=${publisher.address} tx=${txHash} minScore=${minScore}`);
    return this.toView(row);
  }

  /** 市场列表（含状态过滤） */
  async list(status?: string): Promise<TaskView[]> {
    const rows = await this.prisma.task.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(rows.map((r) => this.toView(r)));
  }

  /** 单任务详情 */
  async get(externalId: string): Promise<TaskView> {
    const row = await this.prisma.task.findUnique({ where: { externalId } });
    if (!row) throw new NotFoundException(`TASK_NOT_FOUND ${externalId}`);
    return this.toView(row);
  }

  /** 领取任务：校验 Agent 存在 + 链上声誉 ≥ 门槛 → TaskRegistry.assignTask → ASSIGNED */
  async claim(externalId: string, input: ClaimTaskInput): Promise<TaskView> {
    const row = await this.prisma.task.findUnique({ where: { externalId } });
    if (!row) throw new NotFoundException(`TASK_NOT_FOUND ${externalId}`);
    if (row.status !== "OPEN") throw new ConflictException(`TASK_NOT_OPEN status=${row.status}`);

    // Agent 链上身份
    const agent = await this.prisma.agent.findUnique({ where: { chainAgentId: input.chainAgentId } });
    if (!agent) throw new NotFoundException(`TASK_AGENT_NOT_FOUND ${input.chainAgentId}`);

    // 领取人签名 = Agent owner（与事件验签同一账户）
    const agentKey = input.agentPrivateKey?.trim();
    if (!agentKey) throw new BadRequestException("TASK_AGENT_KEY_REQUIRED");
    const signer = privateKeyToAccount(agentKey as `0x${string}`);
    if (getAddress(signer.address) !== getAddress(agent.ownerAddress)) {
      throw new ForbiddenException("TASK_AGENT_KEY_MISMATCH");
    }

    // 声誉门槛校验（链上 compositeScore）
    if (row.minScore > 0) {
      let score: bigint;
      try {
        score = await this.attestation.readComposite(BigInt(agent.chainAgentId!));
      } catch (err) {
        this.logger.warn(`readComposite failed agent=${agent.chainAgentId}: ${err instanceof Error ? err.message : String(err)}`);
        throw new ForbiddenException("TASK_AGENT_NO_REPUTATION");
      }
      if (Number(score) < row.minScore) {
        throw new ForbiddenException(
          `TASK_REPUTATION_TOO_LOW score=${Number(score)} required=${row.minScore}`,
        );
      }
    }

    // 上链登记 assignTask（链上不校验分数，只登记领取事实）
    const hash = this.taskHash(row.publisherAddr as Address, row.externalId, row.minScore);
    const pc = publicClient();
    const wallet = createWalletClient({
      chain: pc.chain,
      transport: http(RPC_URL),
      account: signer,
    });
    const txHash = (await wallet.writeContract({
      address: contractAddress("TaskRegistry"),
      abi: taskRegistryAbi,
      functionName: "assignTask",
      args: [hash, BigInt(agent.chainAgentId!)],
    })) as Hash;

    const updated = await this.prisma.task.update({
      where: { id: row.id },
      data: {
        status: "ASSIGNED",
        assignTx: txHash,
        assignedAgentId: agent.id,
        assignedChainAgent: agent.chainAgentId,
      },
    });

    this.logger.log(`task claimed externalId=${externalId} agent=${agent.chainAgentId} tx=${txHash}`);
    return this.toView(updated);
  }

  /** 完成（发布者确认）：仅 publisher 可完成；仅 ASSIGNED → COMPLETED */
  async complete(externalId: string, publisherPrivateKey?: string): Promise<TaskView> {
    const row = await this.prisma.task.findUnique({ where: { externalId } });
    if (!row) throw new NotFoundException(`TASK_NOT_FOUND ${externalId}`);
    if (row.status !== "ASSIGNED") throw new ConflictException(`TASK_NOT_ASSIGNED status=${row.status}`);

    // 可选：发布者验签（若传入 key）
    if (publisherPrivateKey) {
      const publisher = privateKeyToAccount(publisherPrivateKey as `0x${string}`);
      if (getAddress(publisher.address) !== getAddress(row.publisherAddr)) {
        throw new ForbiddenException("TASK_NOT_PUBLISHER");
      }
      // 上链登记 completeTask（仅 publisher 可调）
      const hash = this.taskHash(row.publisherAddr as Address, row.externalId, row.minScore);
      const pc = publicClient();
      const wallet = createWalletClient({
        chain: pc.chain,
        transport: http(RPC_URL),
        account: publisher,
      });
      await wallet.writeContract({
        address: contractAddress("TaskRegistry"),
        abi: taskRegistryAbi,
        functionName: "completeTask",
        args: [hash],
      });
    }

    const updated = await this.prisma.task.update({
      where: { id: row.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    this.logger.log(`task completed externalId=${externalId}`);
    return this.toView(updated);
  }

  /** 取消（仅 OPEN，发布者） */
  async cancel(externalId: string, publisherPrivateKey: string): Promise<TaskView> {
    const row = await this.prisma.task.findUnique({ where: { externalId } });
    if (!row) throw new NotFoundException(`TASK_NOT_FOUND ${externalId}`);
    if (row.status !== "OPEN") throw new ConflictException(`TASK_NOT_OPEN status=${row.status}`);
    const publisher = privateKeyToAccount(publisherPrivateKey.trim() as `0x${string}`);
    if (getAddress(publisher.address) !== getAddress(row.publisherAddr)) {
      throw new ForbiddenException("TASK_NOT_PUBLISHER");
    }
    const updated = await this.prisma.task.update({
      where: { id: row.id },
      data: { status: "CANCELLED" },
    });
    return this.toView(updated);
  }

  /** DB 行 → API 视图（附领取 Agent 名/分；chainRecorded 标记链上存在性） */
  private async toView(row: {
    externalId: string;
    title: string;
    description: string | null;
    publisherAddr: string;
    minScore: number;
    status: string;
    publishTx: string | null;
    assignTx: string | null;
    assignedAgentId: string | null;
    assignedChainAgent: number | null;
    createdAt: Date;
    completedAt: Date | null;
  }): Promise<TaskView> {
    let assignedAgentName: string | null = null;
    let assignedScore: number | null = null;
    if (row.assignedAgentId) {
      const agent = await this.prisma.agent.findUnique({ where: { id: row.assignedAgentId } });
      assignedAgentName = agent?.name ?? null;
      if (agent) {
        const snap = await this.prisma.vectorSnapshot.findFirst({
          where: { agentId: agent.id },
          orderBy: { updatedAt: "desc" },
        });
        assignedScore = snap?.composite ?? null;
      }
    }

    // 链上登记存在性（尽力而为：链不可用不阻断列表展示）
    let chainRecorded = false;
    try {
      const pc = publicClient();
      const t = await pc.readContract({
        address: contractAddress("TaskRegistry"),
        abi: taskRegistryAbi,
        functionName: "getTask",
        args: [this.taskHash(row.publisherAddr as Address, row.externalId, row.minScore)],
      });
      chainRecorded = t.createdAt > 0n;
    } catch {
      chainRecorded = false;
    }

    return {
      externalId: row.externalId,
      title: row.title,
      description: row.description,
      publisherAddr: row.publisherAddr,
      minScore: row.minScore,
      status: row.status as TaskStatus,
      publishTx: row.publishTx,
      assignTx: row.assignTx,
      assignedChainAgent: row.assignedChainAgent,
      assignedAgentName,
      assignedScore,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      chainRecorded,
    };
  }
}
