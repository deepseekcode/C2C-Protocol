/**
 * Proof 上传器接口 + Kubo HTTP RPC 实现 + 本地降级实现。
 * 决策：Kubo 通过 HTTP RPC（/api/v0/add）上传，不 spawn 子进程（避免孤儿进程/路径问题）。
 * Kubo 不可用时降级 LocalUploader（cid 为 "local:<proofHash>"，不冒充真 IPFS CID）。
 */

export interface UploadResult {
  cid: string;
  provider: "kubo" | "local";
}

export interface ProofUploader {
  readonly name: string;
  upload(jsonBytes: Uint8Array, proofHash?: string): Promise<UploadResult>;
}

/** Kubo RPC：POST /api/v0/add?pin=true，multipart 字段 file=proof JSON */
export class KuboUploader implements ProofUploader {
  readonly name = "kubo";
  constructor(private readonly endpoint: string) {}

  async upload(jsonBytes: Uint8Array): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", new Blob([jsonBytes as BlobPart], { type: "application/json" }), "proof.json");
    const url = `${this.endpoint}/api/v0/add?pin=true`;
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) {
      throw new Error(`Kubo add failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    const data = (await res.json()) as { Hash?: string };
    if (!data.Hash) throw new Error(`Kubo add 响应缺少 Hash: ${JSON.stringify(data)}`);
    return { cid: data.Hash, provider: "kubo" };
  }
}

/** 本地降级：proof JSON 落盘到 apps/api/data/proofs/<proofHash>.json，cid=local:<proofHash> */
export class LocalUploader implements ProofUploader {
  readonly name = "local";
  constructor(private readonly dir: string) {}

  async upload(jsonBytes: Uint8Array, proofHash: string): Promise<UploadResult> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(this.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${proofHash.slice(2)}.json`), Buffer.from(jsonBytes));
    return { cid: `local:${proofHash}`, provider: "local" };
  }
}
