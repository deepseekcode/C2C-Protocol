import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createWalletClient, getAddress, http, parseEventLogs } from "viem";
import type { Address, Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PrismaService } from "../prisma/prisma.service.js";
import { toLevel } from "@c2c/reputation-engine";
import { agentIdentityAbi, reputationPassportAbi } from "../chain/abis.js";
import { contractAddress, evaluatorWalletClient, publicClient } from "../chain/client.js";
import { RPC_URL } from "../config/env.js";

export interface RegisterAgentInput {
  name: string;
  metadataURI?: string;
  /** 期望 owner；缺省用链上 operator（hardhat account#0） */
  ownerAddress?: Address;
  /** dev 模式自持 mint 密钥；缺省用 operator */
  ownerPrivateKey?: string;
}

export interface RegisterAgentResult {
  chainAgentId: number;
  txHash: string;
  metadataURI: string;
  owner: Address;
}

export interface SnapshotResult {
  agentId: string;
  name: string;
  metadataURI: string | null;
  ownerAddress: string;
  active: boolean;
  passport: boolean;
  vector?: { execution: number; reliability: number; quality: number; collaboration: number };
  score?: number;
  level?: string;
  proofHash?: string;
  chainVerified: boolean;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Path 1：注册 Agent。
   * 链上：AgentIdentity.createAgent 由 owner 账户调用（决定 NFT owner）。
   * 链下：User/Agent 行。owner = mint 账户地址（真实签名者，后续事件验签的信任锚）。
   */
  async register(input: RegisterAgentInput): Promise<RegisterAgentResult> {
    // 决定 mint 账户：显式 ownerPrivateKey > operator
    const mintKey = input.ownerPrivateKey ?? process.env.OPERATOR_PRIVATE_KEY;
    if (!mintKey) throw new Error("AGENT_REG_NO_KEY: 缺 ownerPrivateKey / OPERATOR_PRIVATE_KEY");
    const owner = privateKeyToAccount(mintKey as `0x${string}`);
    const expectedOwner = input.ownerAddress ? getAddress(input.ownerAddress) : owner.address;
    if (getAddress(expectedOwner) !== getAddress(owner.address)) {
      // ownerAddress 与 mint 私钥不一致：拒绝（防 DB 记录与链上 owner 脱节）
      throw new Error(`AGENT_REG_OWNER_MISMATCH: ownerAddress=${expectedOwner} 与 mint 账户 ${owner.address} 不一致`);
    }

    // 自持 wallet 发起 mint
    const pc = publicClient();
    const wallet = createWalletClient({
      chain: pc.chain,
      transport: http(RPC_URL),
      account: owner,
    });
    const txHash: Hash = await wallet.writeContract({
      address: contractAddress("AgentIdentity"),
      abi: agentIdentityAbi,
      functionName: "createAgent",
      args: [input.metadataURI ?? ""],
    });
    const receipt = await pc.waitForTransactionReceipt({ hash: txHash });

    // 从 AgentCreated 事件解析 agentId（唯一可靠来源，避免 totalAgents 竞态）
    const parsed = parseEventLogs({
      abi: agentIdentityAbi,
      logs: receipt.logs,
      eventName: "AgentCreated",
    });
    if (parsed.length !== 1) throw new Error(`AGENT_REG_NO_EVENT: ${JSON.stringify(receipt.logs)}`);
    const agentId = Number(parsed[0].args.agentId);
    const realOwner = getAddress(parsed[0].args.owner);

    // 链下 User/Agent
    let user = await this.prisma.user.findUnique({ where: { walletAddress: realOwner.toLowerCase() } });
    if (!user) {
      user = await this.prisma.user.create({ data: { walletAddress: realOwner.toLowerCase() } });
    }
    await this.prisma.agent.upsert({
      where: { chainAgentId: agentId },
      create: {
        ownerId: user.id,
        chainAgentId: agentId,
        ownerAddress: realOwner.toLowerCase(),
        name: input.name,
        metadataURI: input.metadataURI ?? null,
        active: true,
      },
      update: { name: input.name, metadataURI: input.metadataURI ?? null },
    });

    // 铸造声誉护照（ReputationPassport.mintPassport，MINTER_ROLE = EVALUATOR 私钥）。
    // 失败不阻断注册：护照可在链上已有 mint 时跳过（require balance==0），并记录日志。
    try {
      const minter = evaluatorWalletClient();
      await minter.writeContract({
        address: contractAddress("ReputationPassport"),
        abi: reputationPassportAbi,
        functionName: "mintPassport",
        args: [realOwner],
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // 已有护照（幂等重试/外部已 mint）不视为失败；其余原因上抛会让"注册成功但护照缺失"可见。
      if (!/passport exists|already minted/i.test(reason)) {
        this.logger.warn(`passport mint failed agent=${agentId} owner=${realOwner}: ${reason}`);
      }
    }

    return { chainAgentId: agentId, txHash, metadataURI: input.metadataURI ?? "", owner: realOwner };
  }

  /** SDK initialize() 拉取快照 */
  async snapshot(agentId: string): Promise<SnapshotResult> {
    const chainId = Number(agentId);
    const agent = await this.prisma.agent.findUnique({ where: { chainAgentId: chainId } });
    if (!agent) throw new NotFoundException(`agent ${agentId} 未注册`);

    const passport = await this.hasPassport(agent.ownerAddress);

    const latest = await this.prisma.vectorSnapshot.findFirst({
      where: { agentId: agent.id },
      orderBy: { updatedAt: "desc" },
    });

    const result: SnapshotResult = {
      agentId,
      name: agent.name,
      metadataURI: agent.metadataURI,
      ownerAddress: agent.ownerAddress,
      active: agent.active,
      passport,
      chainVerified: agent.chainVerified,
    };
    if (latest) {
      result.vector = {
        execution: latest.execution,
        reliability: latest.reliability,
        quality: latest.quality,
        collaboration: latest.collaboration,
      };
      result.score = latest.composite;
      result.level = toLevel(latest.composite);
      result.proofHash = latest.proofHash ?? undefined;
    }
    return result;
  }

  /** 查链上 Passport 持有状态（readContract hasPassport）。链不可用时返回 false 并告警。 */
  private async hasPassport(ownerAddress: string): Promise<boolean> {
    try {
      const pc = publicClient();
      const passportAddr = contractAddress("ReputationPassport");
      const ok = await pc.readContract({
        address: passportAddr,
        abi: reputationPassportAbi,
        functionName: "hasPassport",
        args: [ownerAddress as Address],
      });
      return ok;
    } catch (err) {
      this.logger.warn(`hasPassport 读取失败 owner=${ownerAddress}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Dashboard：Agent 列表（含最新声誉快照），按注册时间倒序 */
  async list(): Promise<SnapshotResult[]> {
    const agents = await this.prisma.agent.findMany({
      orderBy: { createdAt: "desc" },
    });
    const snapshots = await this.prisma.vectorSnapshot.findMany({
      orderBy: { updatedAt: "desc" },
    });
    const latestByAgent = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots) {
      if (!latestByAgent.has(s.agentId)) latestByAgent.set(s.agentId, s);
    }
    // 批量查链上护照（避免 N+1 顺序读）
    const passportByOwner = await this.batchHasPassport(agents.map((a) => a.ownerAddress));
    return agents.map((a) => {
      const latest = latestByAgent.get(a.id);
      const r: SnapshotResult = {
        agentId: a.chainAgentId !== null ? String(a.chainAgentId) : a.id,
        name: a.name,
        metadataURI: a.metadataURI,
        ownerAddress: a.ownerAddress,
        active: a.active,
        passport: passportByOwner.get(a.ownerAddress) ?? false,
        chainVerified: a.chainVerified,
      };
      if (latest) {
        r.vector = {
          execution: latest.execution,
          reliability: latest.reliability,
          quality: latest.quality,
          collaboration: latest.collaboration,
        };
        r.score = latest.composite;
        r.level = toLevel(latest.composite);
        r.proofHash = latest.proofHash ?? undefined;
      }
      return r;
    });
  }

  /** 批量护照查询：Promise.all 并发 readContract（本地/RPC 均可），任一失败回退 false。 */
  private async batchHasPassport(owners: string[]): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    const uniq = [...new Set(owners)];
    if (uniq.length === 0) return out;
    try {
      const pc = publicClient();
      const passportAddr = contractAddress("ReputationPassport");
      const results = await Promise.all(
        uniq.map(async (owner) => {
          const ok = await pc.readContract({
            address: passportAddr,
            abi: reputationPassportAbi,
            functionName: "hasPassport",
            args: [owner as Address],
          });
          return [owner, ok] as const;
        }),
      );
      for (const [owner, ok] of results) out.set(owner, ok);
    } catch (err) {
      this.logger.warn(`batchHasPassport 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    return out;
  }
}
