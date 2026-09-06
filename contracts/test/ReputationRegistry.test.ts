import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * ReputationRegistry — EIP-712 ScoreAttestation 验签 + nonce 防重放 + deadline 防过期。
 *
 * 签名构造关键：domain 必须与合约构造函数 EIP712("C2C ReputationRegistry", "1")
 * 派生的 domain separator 完全一致（name/version/chainId/verifyingContract）。
 * ethers v6 Signer.signTypedData 由 hardhat 签名账户私钥直接签名，无需钱包私钥。
 */
describe("ReputationRegistry (EIP-712 ScoreAttestation)", function () {
  interface AttInput {
    agentId: bigint;
    execution: number;
    reliability: number;
    quality: number;
    collaboration: number;
    tasksCompleted: number;
    proofHash: string;
    nonce: bigint;
    deadline: bigint;
  }

  const TYPES = {
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

  async function deploy() {
    const [admin, evaluator, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ReputationRegistry");
    const c = await Factory.deploy();
    await c.waitForDeployment();
    await c.grantRole(await c.EVALUATOR_ROLE(), evaluator.address);
    return { c, admin, evaluator, stranger };
  }

  type Registry = Awaited<ReturnType<typeof deploy>>["c"];

  async function signAtt(signer: HardhatEthersSigner, c: Registry, att: AttInput): Promise<string> {
    const domain = {
      name: "C2C ReputationRegistry",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await c.getAddress(),
    };
    return signer.signTypedData(domain, TYPES, att);
  }

  function att(over: Partial<AttInput> = {}): AttInput {
    const now = BigInt(Math.floor(Date.now() / 1000));
    return {
      agentId: 1n,
      execution: 6000,
      reliability: 6000,
      quality: 4000,
      collaboration: 4000,
      tasksCompleted: 5,
      proofHash: ethers.keccak256(ethers.toUtf8Bytes("proof-1")),
      nonce: 0n,
      deadline: now + 3600n,
      ...over,
    };
  }

  it("合法提交：写入 vector、递增 nonce、事件含综合分", async function () {
    const { c, evaluator } = await deploy();
    const a = att();
    const sig = await signAtt(evaluator, c, a);
    await expect(c.submitScore(a as never, sig))
      .to.emit(c, "ScoreUpdated")
      .withArgs(1n, 6000, 6000, 4000, 4000, 5200, a.proofHash);

    const v = await c.getVector(1n);
    expect(v.execution).to.equal(6000);
    expect(v.reliability).to.equal(6000);
    expect(v.quality).to.equal(4000);
    expect(v.collaboration).to.equal(4000);
    expect(v.tasksCompleted).to.equal(5n);
    expect(v.proofHash).to.equal(a.proofHash);
    expect(v.updatedAt).to.be.gt(0);
    expect(await c.compositeScore(1n)).to.equal(5200);
    expect(await c.nonces(1n)).to.equal(1n);
  });

  it("compositeScore 权重：全 10000 → 10000；30/30/25/15 加权", async function () {
    const { c, evaluator } = await deploy();
    const a = att({ execution: 10000, reliability: 10000, quality: 10000, collaboration: 10000 });
    await c.submitScore(a as never, await signAtt(evaluator, c, a));
    expect(await c.compositeScore(1n)).to.equal(10000);

    // 权重校验：(6000·30 + 6000·30 + 4000·25 + 4000·15)/100 = 5200（上方合法用例已断言）
    const b = att({ agentId: 2n, nonce: 0n, execution: 0, reliability: 10000, quality: 0, collaboration: 0 });
    await c.submitScore(b as never, await signAtt(evaluator, c, b));
    expect(await c.compositeScore(2n)).to.equal(3000); // 仅 reliability 满分 → 30%
  });

  it("per-agent nonce：不同 agent 独立递增", async function () {
    const { c, evaluator } = await deploy();
    const a1 = att();
    await c.submitScore(a1 as never, await signAtt(evaluator, c, a1));
    const a2 = att({ agentId: 2n });
    await c.submitScore(a2 as never, await signAtt(evaluator, c, a2));
    expect(await c.nonces(1n)).to.equal(1n);
    expect(await c.nonces(2n)).to.equal(1n);
  });

  it("重放同 nonce revert", async function () {
    const { c, evaluator } = await deploy();
    const a = att();
    const sig = await signAtt(evaluator, c, a);
    await c.submitScore(a as never, sig);
    await expect(c.submitScore(a as never, sig)).to.be.revertedWith("ReputationRegistry: bad nonce");
  });

  it("deadline 过期 revert", async function () {
    const { c, evaluator } = await deploy();
    const a = att({ deadline: 1n });
    await expect(c.submitScore(a as never, await signAtt(evaluator, c, a))).to.be.revertedWith(
      "ReputationRegistry: attestation expired",
    );
    expect(await c.nonces(1n)).to.equal(0n); // 未消耗
  });

  it("非 EVALUATOR 签名人 revert（nonce 不消耗，原子回滚）", async function () {
    const { c, stranger } = await deploy();
    const a = att();
    await expect(c.submitScore(a as never, await signAtt(stranger, c, a))).to.be.revertedWith(
      "ReputationRegistry: invalid evaluator",
    );
    expect(await c.nonces(1n)).to.equal(0n);
  });

  it("EVALUATOR_ROLE 撤销后同一签名者 revert", async function () {
    const { c, admin, evaluator } = await deploy();
    const a0 = att();
    await c.submitScore(a0 as never, await signAtt(evaluator, c, a0));
    await c.revokeRole(await c.EVALUATOR_ROLE(), evaluator.address);
    const a1 = att({ nonce: 1n });
    await expect(c.submitScore(a1 as never, await signAtt(evaluator, c, a1))).to.be.revertedWith(
      "ReputationRegistry: invalid evaluator",
    );
  });

  it("未注册 agentId 也可提交（Registry 不耦合 AgentIdentity）", async function () {
    const { c, evaluator } = await deploy();
    const a = att({ agentId: 999n });
    await c.submitScore(a as never, await signAtt(evaluator, c, a));
    expect((await c.getVector(999n)).execution).to.equal(6000);
  });

  it("domainSeparator 可读且随 verifyingContract 变化", async function () {
    const { c } = await deploy();
    expect(await c.domainSeparator()).to.not.equal(ethers.ZeroHash);
    const { c: c2 } = await deploy();
    expect(await c2.domainSeparator()).to.not.equal(await c.domainSeparator());
  });
});
