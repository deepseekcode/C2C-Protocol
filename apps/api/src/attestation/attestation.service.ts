import { Injectable } from "@nestjs/common";
import { reputationRegistryAbi } from "../chain/abis.js";
import { contractAddress, evaluatorAccount, evaluatorWalletClient, publicClient } from "../chain/client.js";

export interface ScoreAttestationInput {
  agentId: bigint;
  execution: number;
  reliability: number;
  quality: number;
  collaboration: number;
  tasksCompleted: bigint;
  proofHash: `0x${string}`;
}

export interface SubmitResult {
  txHash: `0x${string}`;
  nonce: bigint;
  deadline: bigint;
}

/**
 * 信任机制核心（实施方案 §6.1）：后端 EVALUATOR 私钥对 ScoreAttestation 做 EIP-712 签名，
 * 任何人可携带签名调 submitScore，合约只做验签。信任根 = EVALUATOR 密钥，不是 API 服务器。
 */
@Injectable()
export class AttestationService {
  private readonly registryAddress = contractAddress("ReputationRegistry");

  /** 构造 EIP-712 domain（与合约 EIP712("C2C ReputationRegistry","1") 完全一致） */
  private domain() {
    const chainId = publicClient().chain.id;
    return {
      name: "C2C ReputationRegistry",
      version: "1",
      chainId,
      verifyingContract: this.registryAddress,
    } as const;
  }

  private static readonly types = {
    ScoreAttestation: [
      { name: "agentId", type: "uint256" },
      { name: "execution", type: "uint32" },
      { name: "reliability", type: "uint32" },
      { name: "quality", type: "uint32" },
      { name: "collaboration", type: "uint32" },
      { name: "tasksCompleted", type: "uint256" },
      { name: "proofHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ],
  } as const;

  /** 读取链上当前 nonce（mutex 内调用防竞争） */
  async readNonce(agentId: bigint): Promise<bigint> {
    const pc = publicClient();
    return pc.readContract({
      address: this.registryAddress,
      abi: reputationRegistryAbi,
      functionName: "nonces",
      args: [agentId],
    });
  }

  /** EIP-712 签名并 submitScore 上链。nonce 由调用方（event mutex 内）读取后传入。 */
  async signAndSubmit(att: ScoreAttestationInput, nonce: bigint, deadline: bigint): Promise<SubmitResult> {
    const wallet = evaluatorWalletClient();
    const account = evaluatorAccount();

    const attForSign = {
      ...att,
      nonce,
      deadline,
    };

    const signature = await wallet.signTypedData({
      domain: this.domain(),
      types: AttestationService.types,
      primaryType: "ScoreAttestation",
      message: attForSign,
    });

    const txHash = await wallet.writeContract({
      address: this.registryAddress,
      abi: reputationRegistryAbi,
      functionName: "submitScore",
      // 便捷方式：submitScore 的 ABI 是 (tuple, bytes)，viem 支持直接传对象
      args: [
        {
          agentId: att.agentId,
          execution: att.execution,
          reliability: att.reliability,
          quality: att.quality,
          collaboration: att.collaboration,
          tasksCompleted: att.tasksCompleted,
          proofHash: att.proofHash,
          nonce,
          deadline,
        },
        signature,
      ],
      account: account.address,
      chain: publicClient().chain,
    });

    return { txHash, nonce, deadline };
  }

  /** 读取链上当前 vector（供 reputation/seed 比对） */
  async readVector(agentId: bigint) {
    const pc = publicClient();
    return pc.readContract({
      address: this.registryAddress,
      abi: reputationRegistryAbi,
      functionName: "getVector",
      args: [agentId],
    });
  }

  /** 读取链上 compositeScore */
  async readComposite(agentId: bigint): Promise<bigint> {
    const pc = publicClient();
    return pc.readContract({
      address: this.registryAddress,
      abi: reputationRegistryAbi,
      functionName: "compositeScore",
      args: [agentId],
    });
  }
}
