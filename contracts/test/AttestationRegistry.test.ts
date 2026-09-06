import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * AttestationRegistry — 第三方证明注册表（attest / revoke / verify）。
 * 证明全文存链下（IPFS 等），链上只锚定 keccak proofHash；issuer 可撤销。
 */
describe("AttestationRegistry", function () {
  async function deploy() {
    const [issuer, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AttestationRegistry");
    const c = await Factory.deploy();
    await c.waitForDeployment();
    return { c, issuer, bob };
  }

  const H = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

  it("attest：id 自增 + 事件 + verify + 总数", async function () {
    const { c, issuer } = await deploy();
    const h = H("proof-a");
    await expect(c.attest(7n, h))
      .to.emit(c, "Attested")
      .withArgs(1n, issuer.address, 7n, h);
    expect(await c.totalAttestations()).to.equal(1);
    expect(await c.verify(1n)).to.equal(true);
    const a = await c.attestations(1n);
    expect(a.issuer).to.equal(issuer.address);
    expect(a.subjectAgentId).to.equal(7n);
    expect(a.proofHash).to.equal(h);
    expect(a.timestamp).to.be.gt(0);
    expect(a.revoked).to.equal(false);
  });

  it("不同 issuer 各自 attest，id 继续自增", async function () {
    const { c, issuer, bob } = await deploy();
    await c.connect(issuer).attest(1n, H("a"));
    await c.connect(bob).attest(2n, H("b"));
    expect(await c.totalAttestations()).to.equal(2);
    expect((await c.attestations(2n)).issuer).to.equal(bob.address);
  });

  it("空 proofHash revert", async function () {
    const { c, issuer } = await deploy();
    await expect(c.connect(issuer).attest(1n, ethers.ZeroHash)).to.be.revertedWith(
      "AttestationRegistry: empty proof",
    );
    expect(await c.totalAttestations()).to.equal(0);
  });

  it("revoke：仅 issuer 可撤销，他人 revert", async function () {
    const { c, issuer, bob } = await deploy();
    await c.attest(1n, H("a"));
    await expect(c.connect(bob).revoke(1n)).to.be.revertedWith("AttestationRegistry: not issuer");
    await expect(c.revoke(1n)).to.emit(c, "Revoked").withArgs(1n, issuer.address);
    expect(await c.verify(1n)).to.equal(false);
  });

  it("重复 revoke revert", async function () {
    const { c } = await deploy();
    await c.attest(1n, H("a"));
    await c.revoke(1n);
    await expect(c.revoke(1n)).to.be.revertedWith("AttestationRegistry: already revoked");
  });

  it("revoke 不存在的 id revert", async function () {
    const { c } = await deploy();
    await expect(c.revoke(99n)).to.be.revertedWith("AttestationRegistry: nonexistent attestation");
  });

  it("verify 不存在的 id 返回 false（view 不 revert）", async function () {
    const { c } = await deploy();
    expect(await c.verify(42n)).to.equal(false);
  });
});
