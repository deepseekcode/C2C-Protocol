// Avalanche Hardhat 配置 (TypeScript)
// 使用 hardhat.config.ts 使 Hardhat 判定为 TypeScript 项目，从而自动收集 test/**/*.ts 测试。

import path from "path";
import { config as loadDotenv } from "dotenv";
import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

// .env 统一放在仓库根目录（README 约定）。dotenv 默认按 cwd 查找，
// 而 pnpm --dir/--prefix 会改变 cwd，因此这里基于配置文件位置显式解析。
loadDotenv({ path: path.resolve(__dirname, "../.env") });

const RAW_KEY = (process.env.FUJI_PRIVATE_KEY ?? "").trim();

// 仅接受 64 位 hex（0x 前缀）且非全零占位符的私钥。
// 全零占位会让 secp256k1 直接抛 "Expected valid bigint"（noble-curves），这里提前拦截。
const PRIVATE_KEY =
  /^0x[0-9a-fA-F]{64}$/.test(RAW_KEY) && !/^0x0{64}$/i.test(RAW_KEY) ? RAW_KEY : "";

if (process.env.FUJI_PRIVATE_KEY && !PRIVATE_KEY) {
  console.warn(
    "[hardhat] 警告: FUJI_PRIVATE_KEY 缺失或不是有效的 64 位 hex 私钥（含占位符 0x0000...）。\n" +
      "          fuji 网络的签名账户列表将为空，部署会在发送交易前失败。"
  );
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // OpenZeppelin 5.x 使用 mcopy（cancun 指令），hardhat 2.x 默认 paris 会编译失败。
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    // 本地持久 RPC（hardhat node），供 apps/api 与 e2e 使用
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Avalanche Fuji Testnet (C-Chain, EVM, Chain ID 43113)
    fuji: {
      url: process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    // Avalanche Mainnet (C-Chain, Chain ID 43114) — 需要时取消注释
    // avalanche: {
    //   url: process.env.AVAX_MAINNET_RPC_URL || "https://api.avax.network/ext/bc/C/rpc",
    //   chainId: 43114,
    //   accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    // },
  },
  etherscan: {
    apiKey: {
      fuji: process.env.SNOWTRACE_API_KEY || "",
    },
    customChains: [
      {
        network: "fuji",
        chainId: 43113,
        urls: {
          apiURL: "https://api-testnet.snowtrace.io/api",
          browserURL: "https://testnet.snowtrace.io",
        },
      },
    ],
  },
};

export default config;
