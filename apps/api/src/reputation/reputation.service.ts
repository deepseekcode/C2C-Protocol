import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AttestationService } from "../attestation/attestation.service.js";
import { toLevel } from "@c2c/reputation-engine";

export interface ReputationInfo {
  vector: { execution: number; reliability: number; quality: number; collaboration: number };
  score: number;
  level: string;
  proofHash?: string;
  chainVerified: boolean;
}

/**
 * Path 3 声誉查询：读链上 ReputationRegistry.getVector + compositeScore，
 * 与本地最新 VectorSnapshot 比对 → chainVerified（链上链下一致才算 verified）。
 */
@Injectable()
export class ReputationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attestation: AttestationService,
  ) {}

  async get(agentId: string): Promise<ReputationInfo> {
    const chainId = Number(agentId);
    const agent = await this.prisma.agent.findUnique({ where: { chainAgentId: chainId } });
    if (!agent) throw new NotFoundException(`agent ${agentId} 未注册`);

    // 链上 vector（全 0 = 从未上链）
    const onChain = await this.attestation.readVector(BigInt(chainId));
    const zero = Number(onChain.execution) === 0 && Number(onChain.reliability) === 0;
    if (zero) throw new NotFoundException(`agent ${agentId} 尚无链上声誉`);

    const vector = {
      execution: Number(onChain.execution),
      reliability: Number(onChain.reliability),
      quality: Number(onChain.quality),
      collaboration: Number(onChain.collaboration),
    };

    // 本地最新快照
    const latest = await this.prisma.vectorSnapshot.findFirst({
      where: { agentId: agent.id },
      orderBy: { updatedAt: "desc" },
    });

    // chainVerified = 链上 vector 与本地快照 4 维一致
    const chainVerified =
      !!latest &&
      latest.execution === vector.execution &&
      latest.reliability === vector.reliability &&
      latest.quality === vector.quality &&
      latest.collaboration === vector.collaboration;

    const score = Number(await this.attestation.readComposite(BigInt(chainId)));
    return {
      vector,
      score,
      level: toLevel(score),
      proofHash: latest?.proofHash ?? undefined,
      chainVerified,
    };
  }
}
