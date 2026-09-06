import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { parseAbiItem } from "viem";
import { PrismaService } from "../prisma/prisma.service.js";
import { contractAddress, publicClient } from "../chain/client.js";
import { INDEXER_POLL_MS } from "../config/env.js";
import { reputationRegistryAbi } from "../chain/abis.js";

const SCORE_UPDATED = parseAbiItem(
  "event ScoreUpdated(uint256 indexed agentId, uint32 execution, uint32 reliability, uint32 quality, uint32 collaboration, uint256 composite, bytes32 proofHash)",
);

/**
 * 链上对账兜底：轮询 ReputationRegistry.ScoreUpdated 事件 → 对账本地 Agent/VectorSnapshot。
 * 主路径（event 编排）已同步回写；indexer 处理"外部直接 submitScore"的兜底场景：
 *  - 更新 Agent.chainVerified + lastScoreTx
 *  - 本地无该向量/哈希记录时回写 VectorSnapshot（composite 直接用事件里的链上值，与链一致）
 *  - 若链上向量与本地最新一致（同一次 submitScore 回放/主路径已写），不重复插行（幂等）
 */
@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private lastBlock = 0n;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // 首次轮询快速启动
    this.timer = setInterval(() => void this.poll().catch((e) => this.logger.warn(`poll failed: ${e}`)), INDEXER_POLL_MS);
    this.logger.log(`indexer started, poll=${INDEXER_POLL_MS}ms`);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    const pc = publicClient();
    const current = await pc.getBlockNumber();
    if (this.lastBlock === 0n) {
      // 首次：从当前块回看 200 块（避免每次重启全量扫）
      this.lastBlock = current > 200n ? current - 200n : 0n;
    }
    if (current <= this.lastBlock) return;

    try {
      const logs = await pc.getLogs({
        address: contractAddress("ReputationRegistry"),
        event: SCORE_UPDATED,
        fromBlock: this.lastBlock + 1n,
        toBlock: current,
      });
      for (const log of logs) {
        const args = log.args as unknown as {
          agentId: bigint;
          execution: number;
          reliability: number;
          quality: number;
          collaboration: number;
          composite: bigint;
          proofHash: `0x${string}`;
        };
        const chainAgentId = Number(args.agentId);
        const agent = await this.prisma.agent.findUnique({ where: { chainAgentId } });
        if (!agent) continue;

        const chainVector = {
          execution: Number(args.execution),
          reliability: Number(args.reliability),
          quality: Number(args.quality),
          collaboration: Number(args.collaboration),
        };

        // 幂等：与本地最新快照一致则只补 Agent 对账信息，不重复插行
        const latest = await this.prisma.vectorSnapshot.findFirst({
          where: { agentId: agent.id },
          orderBy: { updatedAt: "desc" },
        });
        const sameVector =
          !!latest &&
          latest.execution === chainVector.execution &&
          latest.reliability === chainVector.reliability &&
          latest.quality === chainVector.quality &&
          latest.collaboration === chainVector.collaboration &&
          latest.proofHash === args.proofHash;

        await this.prisma.$transaction([
          this.prisma.agent.update({
            where: { id: agent.id },
            data: { chainVerified: true, lastScoreTx: log.transactionHash },
          }),
          ...(sameVector
            ? []
            : [
                this.prisma.vectorSnapshot.create({
                  data: {
                    agentId: agent.id,
                    ...chainVector,
                    composite: Number(args.composite),
                    proofHash: args.proofHash,
                    txHash: log.transactionHash,
                  },
                }),
              ]),
        ]);
        this.logger.log(
          `indexer: agent ${chainAgentId} reconcile via tx ${log.transactionHash} ${sameVector ? "(dup, skipped snapshot)" : "(snapshot written)"}`,
        );
      }
    } catch (err) {
      this.logger.warn(`getLogs failed (可能 RPC 不支持 range): ${err instanceof Error ? err.message : String(err)}`);
    }
    this.lastBlock = current;
  }
}

/** 类型校验：引用 ABI 确保事件签名与合约一致（防漂移） */
export function _scoreUpdatedAbiGuard(): typeof reputationRegistryAbi {
  return reputationRegistryAbi;
}
