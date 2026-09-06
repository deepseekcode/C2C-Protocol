/**
 * 读取 contracts 部署输出（contracts/deployments/<network>.json）。
 * 由 deploy.ts 在部署后生成；本函数基于本文件位置解析仓库根，与 .env 加载同原则。
 * network 默认 "fuji"（向后兼容），本地 hardhat 全链路验证传 "hardhat"。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContractName, DeploymentRecord, DeployNetwork } from "./chain.js";

/**
 * 仓库根解析优先级：
 *   1. C2C_PROTOCOL_ROOT 环境变量（最可靠，.env 由 apps/api env.ts 注入）
 *   2. 本文件物理位置（workspace 直连 / tsx 直跑时上溯 3 层有效）
 * pnpm 会把 @c2c/shared 软链进 node_modules/.pnpm，import.meta.url 指向物理 store，
 * 上溯会落在 .pnpm 内而非仓库根——因此依赖方应设 C2C_PROTOCOL_ROOT。
 */
function resolveRepoRoot(): string {
  const fromEnv = process.env.C2C_PROTOCOL_ROOT;
  if (fromEnv) return fromEnv;
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

/** 从仓库根读取部署记录；rootDir/network 可显式覆盖（默认按 C2C_PROTOCOL_ROOT / 文件位置上溯 + fuji） */
export function loadDeployments(rootDir?: string, network: DeployNetwork = "fuji"): DeploymentRecord {
  const root = rootDir ?? resolveRepoRoot();
  const file = path.join(root, "contracts", "deployments", `${network}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as DeploymentRecord;
}

export function getContractAddress(
  name: ContractName,
  rootDir?: string,
  network: DeployNetwork = "fuji",
): `0x${string}` {
  const d = loadDeployments(rootDir, network);
  const c = d.contracts[name];
  if (!c) throw new Error(`contract ${name} not found in deployments/${network}.json`);
  return c.address as `0x${string}`;
}
