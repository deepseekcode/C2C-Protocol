import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, avalancheFuji } from "viem/chains";
import type { Address } from "viem";
import { loadDeployments } from "@c2c/shared";
import { CHAIN_ID, EVALUATOR_PRIVATE_KEY, NETWORK, OPERATOR_PRIVATE_KEY, REPO_ROOT, RPC_URL } from "../config/env.js";

/**
 * 链客户端工厂：按 C2C_NETWORK 选 viem chain 与 RPC。
 * 合约地址从 contracts/deployments/<network>.json（@c2c/shared loadDeployments）解析。
 */
const chain = CHAIN_ID === 43113 ? avalancheFuji : hardhat;

export function publicClient() {
  return createPublicClient({ chain, transport: http(RPC_URL) });
}

function accountFrom(key: string): ReturnType<typeof privateKeyToAccount> {
  if (!key) throw new Error(`缺少私钥配置（EVALUATOR_PRIVATE_KEY / OPERATOR_PRIVATE_KEY）`);
  return privateKeyToAccount(key as `0x${string}`);
}

export function evaluatorAccount() {
  return accountFrom(EVALUATOR_PRIVATE_KEY);
}

export function operatorAccount() {
  return accountFrom(OPERATOR_PRIVATE_KEY);
}

export function evaluatorWalletClient() {
  return createWalletClient({ chain, transport: http(RPC_URL), account: evaluatorAccount() });
}

export function operatorWalletClient() {
  return createWalletClient({ chain, transport: http(RPC_URL), account: operatorAccount() });
}

/** 部署地址解析（缺文件时抛清晰错误）；REPO_ROOT 显式传入规避 pnpm 软链路径问题 */
export function contractAddress(
  name:
    | "AgentIdentity"
    | "ReputationRegistry"
    | "ReputationPassport"
    | "AttestationRegistry"
    | "TaskRegistry",
): Address {
  try {
    const d = loadDeployments(REPO_ROOT, NETWORK);
    const c = d.contracts[name];
    if (!c) throw new Error(`deployments/${NETWORK}.json 缺少 ${name}`);
    return c.address as Address;
  } catch (err) {
    throw new Error(
      `读取合约地址失败: ${err instanceof Error ? err.message : String(err)}。请先在本地 hardhat 网络执行 contracts deploy 生成 deployments/${NETWORK}.json。`,
    );
  }
}
