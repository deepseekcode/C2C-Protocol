import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    console.error(
      "\n错误: 当前网络没有可用签名账户。\n" +
        "  → 本地 hardhat 网络会自带测试账户，无需配置。\n" +
        "  → 部署到 fuji 需在仓库根目录 .env 中设置有效的 FUJI_PRIVATE_KEY（64 位 hex，勿用占位符 0x0000...）。\n" +
        "    参考: .env.example"
    );
    process.exitCode = 1;
    return;
  }

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
