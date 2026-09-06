import { Injectable, Logger } from "@nestjs/common";
import { keccak256, toBytes } from "viem";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IPFS_API_URL } from "../config/env.js";
import { KuboUploader, LocalUploader } from "./proof.uploader.js";

export interface ProofBundle {
  proofJson: string; // canonical JSON 原文（存库供 /verify 重算）
  proofBytes: Uint8Array;
  proofHash: `0x${string}`; // keccak256(utf8(proofJson))
  cid: string;
  provider: "kubo" | "local";
}

/**
 * Proof JSON（键序固定，字节稳定）：
 * proofHash = keccak256(UTF-8 bytes of canonical JSON) —— 与 CID 独立但同源。
 * attestation 签名/expiry 为外部 meta，不入 proofJson（哈希校验不依赖签名状态）。
 */
export interface ProofJsonInput {
  schemaVersion: 1;
  agentId: string; // SDK agentId（链下）
  chainAgentId?: number; // AgentIdentity tokenId
  taskIds: string[];
  vector: { execution: number; reliability: number; quality: number; collaboration: number };
  score: number;
  eventsSummary: { completed: number; failed: number; total: number };
  evaluatedAt: number; // epoch 秒
}

/** canonical 序列化：固定键序 + 无空白，保证字节级可重算 */
export function canonicalJson(obj: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = obj[key];
  }
  return JSON.stringify(out);
}

@Injectable()
export class ProofService {
  private readonly logger = new Logger(ProofService.name);
  private readonly kubo: KuboUploader;
  private readonly local: LocalUploader;

  constructor() {
    this.kubo = new KuboUploader(IPFS_API_URL);
    // 本地降级目录：apps/api/data/proofs（基于本文件位置）
    const here = path.dirname(fileURLToPath(import.meta.url));
    this.local = new LocalUploader(path.resolve(here, "../../data/proofs"));
  }

  /** 生成 canonical proof JSON → keccak256 → 上传 Kubo（失败降级 local） */
  async generateAndPin(input: ProofJsonInput): Promise<ProofBundle> {
    const proofJson = canonicalJson(input as unknown as Record<string, unknown>);
    const proofBytes = new TextEncoder().encode(proofJson);
    const proofHash = keccak256(toBytes(proofJson));

    let upload: { cid: string; provider: "kubo" | "local" };
    try {
      upload = await this.kubo.upload(proofBytes);
    } catch (err) {
      this.logger.warn(
        `Kubo 上传失败，降级本地存储: ${err instanceof Error ? err.message : String(err)}`,
      );
      upload = await this.local.upload(proofBytes, proofHash);
    }

    return { proofJson, proofBytes, proofHash, cid: upload.cid, provider: upload.provider };
  }
}
