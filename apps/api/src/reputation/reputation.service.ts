import { Injectable, NotFoundException } from "@nestjs/common";
import { keccak256 } from "viem";
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

export type VerifyStatus = "verified" | "mismatch" | "no-proof" | "no-agent" | "chain-unreachable";

export interface VerifyResult {
  agentId: number;
  status: VerifyStatus;
  recomputed: string | null;
  onchain: string | null;
  matched: boolean;
  at: string;
}

/** Prisma Json 字段还原为 canonical JSON 字符串（存库时是 string；容错 object） */
function jsonToString(payload: unknown): string | null {
  if (typeof payload === "string") return payload;
  if (payload === null || payload === undefined) return null;
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
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

  /**
   * Proof 链上验证：读 DB 最新 Proof.payloadJson 原文 → 重算 keccak256 →
   * 与链上 ReputationRegistry.getVector().proofHash 比对（Path 3 /verify）。
   */
  async verifyAgainstChain(agentId: string): Promise<VerifyResult> {
    const chainId = Number(agentId);
    const at = new Date().toISOString();

    // 1. DB agent 存在性
    const agent = await this.prisma.agent.findUnique({ where: { chainAgentId: chainId } });
    if (!agent) {
      return { agentId: chainId, status: "no-agent", recomputed: null, onchain: null, matched: false, at };
    }

    // 2. 最新 Proof（DB 原文）
    const proof = await this.prisma.proof.findFirst({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
    });
    if (!proof) {
      return { agentId: chainId, status: "no-proof", recomputed: null, onchain: null, matched: false, at };
    }

    // 3. 重算 hash（与 ProofService.generateAndPin 同源：keccak256(utf8(canonicalJson))）
    const payloadJson = jsonToString(proof.payloadJson);
    if (!payloadJson) {
      return { agentId: chainId, status: "no-proof", recomputed: null, onchain: null, matched: false, at };
    }
    const recomputed = keccak256(new TextEncoder().encode(payloadJson));

    // 4. 链上读取（RPC 异常 → chain-unreachable）
    let onchain: string;
    try {
      const onChain = await this.attestation.readVector(BigInt(chainId));
      onchain = onChain.proofHash.toLowerCase();
    } catch {
      return { agentId: chainId, status: "chain-unreachable", recomputed, onchain: null, matched: false, at };
    }

    // 5. 比对
    const matched = onchain === recomputed.toLowerCase();
    return {
      agentId: chainId,
      status: matched ? "verified" : "mismatch",
      recomputed,
      onchain,
      matched,
      at,
    };
  }
}
