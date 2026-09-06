// Avalanche Hardhat 配置 (TypeScript)
// 使用 hardhat.config.ts 使 Hardhat 判定为 TypeScript 项目，从而自动收集 test/**/*.ts 测试。
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import type { HardhatUserConfig } from "hardhat/config";

const PRIVATE_KEY = process.env.FUJI_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
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
  mocha: {
    // Node >=22 原生 TS type-stripping 会以 ESM 方式解析 .ts，破坏 hardhat/ethers 的 CJS named import，
    // 因此测试脚本通过 NODE_OPTIONS=--no-experimental-strip-types 启动（见 package.json scripts）。
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
