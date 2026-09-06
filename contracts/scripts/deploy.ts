import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

/**
 * C2C Protocol 部署脚本（双模式）。
 *
 * 模式由 hardhat network.name 决定：
 *   - fuji      → 用 .env FUJI_PRIVATE_KEY（占位符拦截见 hardhat.config.ts），输出 deployments/fuji.json
 *   - hardhat / localhost → 本地验证模式，用默认账户（零 .env 依赖），输出 deployments/hardhat.json
 *
 * 角色授予（V1 单一后端 operator）：
 *   - ReputationRegistry.EVALUATOR_ROLE → evaluator（fuji 取 .env EVALUATOR_ADDRESS 或 deployer；本地 = hardhat accounts[1]）
 *   - ReputationPassport.MINTER_ROLE    → evaluator（同一 operator）
 *   - AgentIdentity 无需授权（createAgent 开放）
 *
 * 每步输出 [deploy] 链上痕迹日志：txHash / blockNumber / gas / 耗时。
 */

// contracts 为独立 CJS 工程，不依赖 packages/*；此处与 packages/shared CONTRACT_NAMES 同序同义。
const CONTRACT_NAMES = [
  "AgentIdentity",
  "ReputationPassport",
  "ReputationRegistry",
  "AttestationRegistry",
  "TaskRegistry",
] as const;

// hardhat 固定助记词账户 #1（私钥 0x59c6...，与 apps/api .env EVALUATOR_PRIVATE_KEY 默认一致）
const LOCAL_EVALUATOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function logTx(label: string, txHash: string, blockNumber: number, gasUsed: bigint, ms: number): void {
  console.log(
    `[deploy] ${label} tx=${txHash} block=${blockNumber} gas=${gasUsed.toString()} ${ms}ms`,
  );
}

/** 各合约构造函数参数（按 CONTRACT_NAMES 顺序）。无参返回空数组。 */
async function ctorArgs(name: (typeof CONTRACT_NAMES)[number]): Promise<unknown[]> {
  switch (name) {
    case "ReputationPassport":
      return ["ipfs://c2c-passport-meta/"];
    default:
      return [];
  }
}

interface ContractEntry {
  address: string;
  txHash: string;
  blockNumber: number;
}

async function main() {
  const isFuji = network.name === "fuji";
  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    console.error(
      "\n错误: 当前网络没有可用签名账户。\n" +
        "  → 本地 hardhat/localhost 网络自带测试账户，无需配置。\n" +
        "  → fuji 需在仓库根 .env 设置有效 FUJI_PRIVATE_KEY（64 位 hex，勿用占位符 0x0000...）。\n" +
        "    参考: .env.example",
    );
    process.exitCode = 1;
    return;
  }

  const evaluator = isFuji
    ? (process.env.EVALUATOR_ADDRESS?.trim() || deployer.address)
    : LOCAL_EVALUATOR;

  console.log(
    `[deploy] network=${network.name} chainId=${(await ethers.provider.getNetwork()).chainId} deployer=${deployer.address} evaluator=${evaluator}`,
  );

  const contracts: Record<string, ContractEntry> = {};
  for (const name of CONTRACT_NAMES) {
    const t0 = Date.now();
    const Factory = await ethers.getContractFactory(name);
    const inst = await Factory.deploy(...(await ctorArgs(name)));
    const receipt = await inst.waitForDeployment();
    const txReceipt = await receipt.deploymentTransaction()!.wait();
    contracts[name] = {
      address: await inst.getAddress(),
      txHash: txReceipt!.hash,
      blockNumber: txReceipt!.blockNumber,
    };
    logTx(
      `deploy ${name} @ ${contracts[name].address}`,
      txReceipt!.hash,
      txReceipt!.blockNumber,
      txReceipt!.gasUsed,
      Date.now() - t0,
    );
  }

  // 角色授予（都指向同一 operator；本地模式 evaluator = accounts[1]）
  const registry = await ethers.getContractAt("ReputationRegistry", contracts.ReputationRegistry.address);
  const passport = await ethers.getContractAt("ReputationPassport", contracts.ReputationPassport.address);

  const t1 = Date.now();
  const grantEval = await registry.grantRole(await registry.EVALUATOR_ROLE(), evaluator);
  const rEval = await grantEval.wait();
  logTx(`grantRole EVALUATOR_ROLE -> ${evaluator}`, rEval!.hash, rEval!.blockNumber, rEval!.gasUsed, Date.now() - t1);

  const t2 = Date.now();
  const grantMint = await passport.grantRole(await passport.MINTER_ROLE(), evaluator);
  const rMint = await grantMint.wait();
  logTx(`grantRole MINTER_ROLE -> ${evaluator}`, rMint!.hash, rMint!.blockNumber, rMint!.gasUsed, Date.now() - t2);

  const networkName = isFuji ? "fuji" : "hardhat";
  const record = {
    network: networkName,
    chainId: isFuji ? 43113 : Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts,
  };

  const outDir = path.resolve(__dirname, "../deployments");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${networkName}.json`);
  writeFileSync(outFile, JSON.stringify(record, null, 2) + "\n");
  console.log(`[deploy] wrote ${outFile}`);
  console.log(
    `[deploy] EVALUATOR_ROLE/MINTER_ROLE operator=${evaluator} (apps/api EVALUATOR_PRIVATE_KEY 需与此地址对应)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
