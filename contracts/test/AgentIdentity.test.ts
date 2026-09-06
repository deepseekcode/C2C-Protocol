import { expect } from "chai";
import { ethers } from "hardhat";

describe("AgentIdentity", function () {
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AgentIdentity");
    const c = await Factory.deploy();
    return { c, owner, alice, bob };
  }

  it("createAgent：铸造 NFT 并记录元数据", async function () {
    const { c, alice } = await deploy();
    await expect(c.connect(alice).createAgent("ipfs://agent-meta-1"))
      .to.emit(c, "AgentCreated")
      .withArgs(1, alice.address, "ipfs://agent-meta-1");

    expect(await c.ownerOf(1)).to.equal(alice.address);
    expect(await c.totalAgents()).to.equal(1);
    const meta = await c.getAgent(1);
    expect(meta.metadataURI).to.equal("ipfs://agent-meta-1");
    expect(meta.active).to.equal(true);
    expect(meta.createdAt).to.be.gt(0);
  });

  it("agentId 自增，多 Agent 独立", async function () {
    const { c, alice, bob } = await deploy();
    await c.connect(alice).createAgent("ipfs://a");
    await c.connect(bob).createAgent("ipfs://b");
    expect(await c.ownerOf(1)).to.equal(alice.address);
    expect(await c.ownerOf(2)).to.equal(bob.address);
    expect(await c.totalAgents()).to.equal(2);
  });

  it("updateMetadata：仅 owner 可更新", async function () {
    const { c, alice, bob } = await deploy();
    await c.connect(alice).createAgent("ipfs://a");
    await expect(c.connect(alice).updateMetadata(1, "ipfs://a2"))
      .to.emit(c, "MetadataUpdated")
      .withArgs(1, "ipfs://a2");
    await expect(c.connect(bob).updateMetadata(1, "ipfs://evil")).to.be.revertedWith(
      "AgentIdentity: not agent owner",
    );
  });

  it("deactivate：仅 owner 可停用", async function () {
    const { c, alice, bob } = await deploy();
    await c.connect(alice).createAgent("ipfs://a");
    await expect(c.connect(bob).deactivate(1)).to.be.revertedWith("AgentIdentity: not agent owner");
    await expect(c.connect(alice).deactivate(1)).to.emit(c, "AgentDeactivated").withArgs(1);
    expect((await c.getAgent(1)).active).to.equal(false);
  });

  it("getAgent：不存在的 agent 应 revert", async function () {
    const { c } = await deploy();
    await expect(c.getAgent(1)).to.be.revertedWith("AgentIdentity: nonexistent agent");
  });

  it("ownerOfAgent：返回控制权地址", async function () {
    const { c, alice } = await deploy();
    await c.connect(alice).createAgent("ipfs://a");
    expect(await c.ownerOfAgent(1)).to.equal(alice.address);
  });
});
