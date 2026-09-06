"use client";

import { shortHash } from "@/lib/api";

export default function ProofCard({
  proofHash,
  chainVerified,
}: {
  proofHash?: string;
  chainVerified: boolean;
}) {
  return (
    <div className="proof-card">
      <div className="proof-head">
        <span className="proof-label">链上证明</span>
        {chainVerified ? (
          <span className="proof-badge ok">Confirmed</span>
        ) : (
          <span className="proof-badge pending">Pending</span>
        )}
      </div>
      <div className="proof-grid">
        <div>
          <div className="k">Network</div>
          <div className="v">Avalanche C-Chain</div>
        </div>
        <div>
          <div className="k">Status</div>
          <div className="v" style={{ color: chainVerified ? "#34d399" : "#5c6b8a" }}>
            {chainVerified ? "链上已验证" : "未上链"}
          </div>
        </div>
        <div className="wide">
          <div className="k">Proof Hash</div>
          <div className="v mono" title={proofHash}>
            {shortHash(proofHash)}
          </div>
        </div>
        <div className="wide">
          <div className="k">Source</div>
          <div className="v">
            EIP-712 签名 · EVALUATOR 验签写入 · 链上 ReputationRegistry
          </div>
        </div>
      </div>
    </div>
  );
}
