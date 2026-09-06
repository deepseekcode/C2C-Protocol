import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * TaskRegistry — 任务登记（链下状态机 + 链上审计登记）。
 * 门禁：publish 幂等 / assign 仅一次 / complete 仅 publisher / 状态事件。
 */
describe("TaskRegistry", function () {
  async function deploy() {
    const [publisher, other, agentOwner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TaskRegistry");
    const c = await Factory.deploy();
    await c.waitForDeployment();
    return { c, publisher, other, agentOwner };
  }

  const H = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
  type TaskRegistry = Awaited<ReturnType<typeof deploy>>["c"];

  it("publishTask：登记 publisher/minScore + 事件 + totalTasks", async function () {
    const { c, publisher } = await deploy();
    const h = H("task-1");
    await expect(c.publishTask(h, 7000, 0))
      .to.emit(c, "TaskPublished")
      .withArgs(h, publisher.address, 7000);
    expect(await c.totalTasks()).to.equal(1);
    const t = await c.getTask(h);
    expect(t.publisher).to.equal(publisher.address);
    expect(t.minScore).to.equal(7000);
    expect(t.assigned).to.equal(false);
    expect(t.completed).to.equal(false);
    expect(t.createdAt).to.be.gt(0);
  });

  it("重复发布同一 taskHash revert", async function () {
    const { c } = await deploy();
    const h = H("dup");
    await c.publishTask(h, 0, 0);
    await expect(c.publishTask(h, 0, 0)).to.be.revertedWith("TaskRegistry: already published");
    expect(await c.totalTasks()).to.equal(1);
  });

  it("空 taskHash revert / minScore 越界 revert", async function () {
    const { c } = await deploy();
    await expect(c.publishTask(ethers.ZeroHash, 0, 0)).to.be.revertedWith(
      "TaskRegistry: empty taskHash",
    );
    await expect(c.publishTask(H("x"), 10001, 0)).to.be.revertedWith(
      "TaskRegistry: minScore out of range",
    );
    expect(await c.totalTasks()).to.equal(0);
  });

  it("assignTask：登记 agentId + 事件；未发布 revert", async function () {
    const { c, agentOwner } = await deploy();
    const h = H("assign-1");
    await c.publishTask(h, 5000, 0);
    await expect(c.connect(agentOwner).assignTask(h, 42n))
      .to.emit(c, "TaskAssigned")
      .withArgs(h, 42n, agentOwner.address);
    const t = await c.getTask(h);
    expect(t.assigned).to.equal(true);
    expect(t.agentId).to.equal(42n);
    expect(t.assignedAt).to.be.gt(0);

    await expect(c.connect(agentOwner).assignTask(H("nope"), 1n)).to.be.revertedWith(
      "TaskRegistry: not published",
    );
  });

  it("重复 assign 同一任务 revert；空 agentId revert", async function () {
    const { c, agentOwner } = await deploy();
    const h = H("assign-dup");
    await c.publishTask(h, 0, 0);
    await c.connect(agentOwner).assignTask(h, 7n);
    await expect(c.connect(agentOwner).assignTask(h, 8n)).to.be.revertedWith(
      "TaskRegistry: already assigned",
    );
    // 空 agentId（已发布但未 assign 的任务）
    const h2 = H("assign-empty");
    await c.publishTask(h2, 0, 0);
    await expect(c.connect(agentOwner).assignTask(h2, 0n)).to.be.revertedWith(
      "TaskRegistry: empty agentId",
    );
  });

  it("completeTask：仅 publisher；未 assign / 重复 complete revert", async function () {
    const { c, publisher, other, agentOwner } = await deploy();
    const h = H("complete-1");
    await c.publishTask(h, 0, 0);

    // 未 assign 直接 complete revert
    await expect(c.completeTask(h)).to.be.revertedWith("TaskRegistry: not assigned");

    await c.connect(agentOwner).assignTask(h, 3n);

    // 非 publisher complete revert
    await expect(c.connect(other).completeTask(h)).to.be.revertedWith(
      "TaskRegistry: not publisher",
    );

    // publisher complete → 事件 + 状态
    await expect(c.completeTask(h)).to.emit(c, "TaskCompleted").withArgs(h);
    const t = await c.getTask(h);
    expect(t.completed).to.equal(true);
    expect(t.completedAt).to.be.gt(0);

    // 重复 complete revert
    await expect(c.completeTask(h)).to.be.revertedWith("TaskRegistry: already completed");
  });
});
