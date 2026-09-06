import { expect } from "chai";
import { ethers } from "hardhat";

describe("Greeter", function () {
  it("deploys with the initial greeting", async function () {
    const Greeter = await ethers.getContractFactory("Greeter");
    const greeter = await Greeter.deploy("Hello, Avalanche!");
    await greeter.waitForDeployment();

    expect(await greeter.greeting()).to.equal("Hello, Avalanche!");
  });

  it("updates the greeting and emits an event", async function () {
    const Greeter = await ethers.getContractFactory("Greeter");
    const greeter = await Greeter.deploy("Hello, Avalanche!");
    await greeter.waitForDeployment();

    const [signer] = await ethers.getSigners();
    await expect(greeter.setGreeting("gm fuji"))
      .to.emit(greeter, "GreetingChanged")
      .withArgs(signer.address, "gm fuji");

    expect(await greeter.greeting()).to.equal("gm fuji");
  });
});
