import { expect } from "chai";
import { ethers } from "hardhat";

describe("ReputationPassport (ERC1155, SBT)", function () {
  const BASE_URI = "ipfs://c2c-passport-meta/";

  async function deploy() {
    const [admin, minter, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ReputationPassport");
    const c = await Factory.deploy(BASE_URI);
    return { c, admin, minter, alice, bob };
  }

  it("MINTER_ROLE：admin 默认持有，可授予他人", async function () {
    const { c, admin, minter } = await deploy();
    expect(await c.hasRole(await c.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    expect(await c.hasRole(await c.MINTER_ROLE(), minter.address)).to.equal(false);
    await c.grantRole(await c.MINTER_ROLE(), minter.address);
    expect(await c.hasRole(await c.MINTER_ROLE(), minter.address)).to.equal(true);
  });

  it("mintPassport：MINTER 可铸造，事件与余额正确", async function () {
    const { c, minter, alice } = await deploy();
    await c.grantRole(await c.MINTER_ROLE(), minter.address);
    await expect(c.connect(minter).mintPassport(alice.address))
      .to.emit(c, "PassportMinted")
      .withArgs(alice.address);
    expect(await c.balanceOf(alice.address, 1)).to.equal(1);
    expect(await c.hasPassport(alice.address)).to.equal(true);
  });

  it("mintPassport：非 MINTER 调用 revert", async function () {
    const { c, alice, bob } = await deploy();
    await expect(c.connect(alice).mintPassport(bob.address)).to.be.reverted;
  });

  it("mintPassport：同一地址不可重复铸造", async function () {
    const { c, minter, alice } = await deploy();
    await c.grantRole(await c.MINTER_ROLE(), minter.address);
    await c.connect(minter).mintPassport(alice.address);
    await expect(c.connect(minter).mintPassport(alice.address)).to.be.revertedWith(
      "ReputationPassport: passport exists",
    );
  });

  it("mintPassport：零地址 revert", async function () {
    const { c, minter } = await deploy();
    await c.grantRole(await c.MINTER_ROLE(), minter.address);
    await expect(c.connect(minter).mintPassport(ethers.ZeroAddress)).to.be.revertedWith(
      "ReputationPassport: zero address",
    );
  });

  it("SBT：禁止用户间转账", async function () {
    const { c, minter, alice, bob } = await deploy();
    await c.grantRole(await c.MINTER_ROLE(), minter.address);
    await c.connect(minter).mintPassport(alice.address);
    await expect(
      c.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x"),
    ).to.be.revertedWith("ReputationPassport: SBT non-transferable");
  });

  it("SBT：禁止批量转账", async function () {
    const { c, minter, alice, bob } = await deploy();
    await c.grantRole(await c.MINTER_ROLE(), minter.address);
    await c.connect(minter).mintPassport(alice.address);
    await expect(
      c.connect(alice).safeBatchTransferFrom(alice.address, bob.address, [1], [1], "0x"),
    ).to.be.revertedWith("ReputationPassport: SBT non-transferable");
  });

  it("uri：返回动态 metadata baseURI", async function () {
    const { c } = await deploy();
    expect(await c.uri(1)).to.equal(BASE_URI);
  });
});
