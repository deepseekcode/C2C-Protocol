/**
 * SDK 快速上手示例 2：账户与余额查询
 *
 * 用 @avalanche-sdk/client 从私钥派生账户（EVM 地址 + X/P 链地址），
 * 并查询 C-Chain（EVM）上的原生 AVAX 余额。
 *
 * 准备：在仓库根目录 .env 中设置 FUJI_PRIVATE_KEY（可先用测试网水龙头领测试 AVAX）
 * 运行：pnpm sdk:balance   （在仓库根目录执行）
 *
 * 没有私钥时，可设置 CHECK_ADDRESS=<0x...> 只查询某个地址的余额（免私钥演示）。
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { createAvalancheClient } from "@avalanche-sdk/client";
import { privateKeyToAvalancheAccount } from "@avalanche-sdk/client/accounts";
// 注意：SDK 的 "@avalanche-sdk/client/chains" 子路径 re-export 了当前 viem 版本中
// 不存在的链（ekta），会抛 SyntaxError；avalancheFuji 等链配置直接从 viem/chains 导入。
import { avalancheFuji } from "viem/chains";
import { formatEther, isAddress } from "viem";

// .env 统一放仓库根目录（与 contracts 共用一份），见 info.ts 顶部说明。
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadDotenv({ path: path.join(ROOT_DIR, ".env") });

const RPC_URL =
  process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const RAW_KEY = (process.env.FUJI_PRIVATE_KEY ?? "").trim();

// 与 contracts/hardhat.config.ts 相同规则：仅接受 64 位 hex 且非全零占位符。
const PRIVATE_KEY =
  /^0x[0-9a-fA-F]{64}$/.test(RAW_KEY) && !/^0x0{64}$/i.test(RAW_KEY) ? RAW_KEY : "";
const CHECK_ADDRESS = (process.env.CHECK_ADDRESS ?? "").trim() as `0x${string}`;

async function main() {
  const client = createAvalancheClient({
    chain: avalancheFuji,
    transport: {
      type: "http",
      url: RPC_URL,
    },
  });

  console.log("== Avalanche SDK 账户与余额（Fuji Testnet）==\n");
  console.log("RPC:", RPC_URL);

  // 场景 A：有效私钥 → 派生账户，展示 EVM + X/P 地址并查余额
  if (PRIVATE_KEY) {
    const account = privateKeyToAvalancheAccount(PRIVATE_KEY);
    const evmAddress = account.getEVMAddress();
    const pChainAddress = account.getXPAddress("P", "fuji");
    const xChainAddress = account.getXPAddress("X", "fuji");

    console.log("\nEVM 地址  (C-Chain):", evmAddress);
    console.log("P 链地址           :", pChainAddress);
    console.log("X 链地址           :", xChainAddress);

    const balanceWei = await client.getBalance({ address: evmAddress });
    console.log("\nC-Chain 原生 AVAX 余额:", formatEther(balanceWei), "AVAX");
    return;
  }

  // 场景 B：无私钥但给了地址 → 只查余额（免私钥演示）
  if (CHECK_ADDRESS) {
    if (!isAddress(CHECK_ADDRESS)) {
      console.error(`\n错误: CHECK_ADDRESS 不是合法 EVM 地址: "${CHECK_ADDRESS}"`);
      process.exitCode = 1;
      return;
    }
    console.log("\n查询地址:", CHECK_ADDRESS);
    const balanceWei = await client.getBalance({ address: CHECK_ADDRESS });
    console.log("C-Chain 原生 AVAX 余额:", formatEther(balanceWei), "AVAX");
    return;
  }

  // 场景 C：都没有 → 给出引导
  console.error(
    "\n未配置查询目标。任选其一：\n" +
      "  1) 在仓库根目录 .env 设置 FUJI_PRIVATE_KEY（账户+余额演示）\n" +
      "     - 生成私钥（如 MetaMask / Avalanche 钱包）\n" +
      "     - Fuji 水龙头领测试 AVAX：https://core.app/tools/testnet-faucet/\n" +
      "  2) 在 .env 设置 CHECK_ADDRESS=0x... 只查某地址余额（免私钥）"
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("\n调用失败：", err?.message ?? err);
  process.exitCode = 1;
});
