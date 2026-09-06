import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const Greeter = await ethers.getContractFactory("Greeter");
  const greeter = await Greeter.deploy("Hello, Avalanche Fuji!");
  await greeter.waitForDeployment();

  const address = await greeter.getAddress();
  console.log(`Greeter deployed to: ${address}`);
  console.log(`Verify: npx hardhat verify --network fuji ${address} "Hello, Avalanche Fuji!"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
