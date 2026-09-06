/**
 * @c2c/shared — 链配置与协议常量
 *
 * 注意：链配置一律从 viem/chains 导入。
 * 禁止使用 "@avalanche-sdk/client/chains"（其 re-export 了 viem 不存在的 ekta 链，会抛 SyntaxError）。
 */
import { avalancheFuji, avalanche } from "viem/chains";
import type { Chain } from "viem/chains";

/** Fuji Testnet（C2C V1 生产目标网络） */
export const C2C_CHAIN: Chain = avalancheFuji;
export const C2C_CHAIN_ID = 43113 as const;

/** 本地 Hardhat 网络（开发/端到端验证用；chainId 31337 为 hardhat node 默认） */
export const HARDHAT_CHAIN_ID = 31337 as const;

export type DeployNetwork = "fuji" | "hardhat";

/** Mainnet 预留（V1 不启用） */
export const C2C_MAINNET_CHAIN: Chain = avalanche;
export const C2C_MAINNET_CHAIN_ID = 43114 as const;

export const FUJI_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc";
export const FUJI_EXPLORER = "https://testnet.snowtrace.io";

/** 合约名（与 contracts/contracts/ 下文件名一致） */
export const CONTRACT_NAMES = [
  "AgentIdentity",
  "ReputationPassport",
  "ReputationRegistry",
  "AttestationRegistry",
] as const;
export type ContractName = (typeof CONTRACT_NAMES)[number];

/** Reputation Vector 权重（基点，总和 100 = 100%）——与 ReputationRegistry.sol 保持一致 */
export const VECTOR_WEIGHTS = {
  execution: 30,
  reliability: 30,
  quality: 25,
  collaboration: 15,
} as const;

/** 信用等级阈值（综合分 0–10000） */
export const LEVEL_THRESHOLDS = {
  Bronze: 3000,
  Silver: 5000,
  Gold: 7000,
  Platinum: 8500,
  Diamond: 9000,
} as const;
export type ReputationLevel = keyof typeof LEVEL_THRESHOLDS;

/** 部署信息（contracts/scripts/deploy.ts 输出，deployments/<network>.json） */
export interface DeploymentRecord {
  network: DeployNetwork;
  chainId: typeof C2C_CHAIN_ID | typeof HARDHAT_CHAIN_ID;
  deployedAt: string;
  deployer: string;
  contracts: Record<ContractName, { address: string; txHash: string; blockNumber: number }>;
}

/** Snowtrace 交易/地址链接 */
export function snowtraceTx(txHash: string): string {
  return `${FUJI_EXPLORER}/tx/${txHash}`;
}
export function snowtraceAddress(address: string): string {
  return `${FUJI_EXPLORER}/address/${address}`;
}
