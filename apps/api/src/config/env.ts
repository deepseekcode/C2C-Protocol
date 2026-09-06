/**
 * 配置加载：基于本文件位置上溯到仓库根，显式读取根 .env（与 hardhat.config.ts 同原则）。
 * tsx 直跑，无 dotenv 依赖 → 用 node 内置方式注入。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

function resolveRepoRoot(): string {
  // tsx 直跑：本文件在 apps/api/src/config/，上溯 4 层 = 仓库根
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
}

export const REPO_ROOT = resolveRepoRoot();

function loadRootEnv(): Record<string, string> {
  const root = REPO_ROOT;
  const envFile = path.join(root, ".env");
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(envFile, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    /* .env 缺失时仅用 process.env */
  }
  return out;
}

const fileEnv = loadRootEnv();

// 把根 .env 的值回填进 process.env（仅当 shell 未显式设置时，保留外部优先级）。
// 修复：多处代码直读 process.env.*（agent.service OPERATOR_PRIVATE_KEY、
// prisma.service DATABASE_URL、seed 脚本等），此前 .env 值只进 fileEnv 导致脱节。
for (const [k, v] of Object.entries(fileEnv)) {
  process.env[k] ??= v;
}

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fileEnv[key] ?? fallback;
}

// 供 @c2c/shared loadDeployments 解析仓库根（pnpm 软链下 import.meta.url 不可靠）
process.env.C2C_PROTOCOL_ROOT ??= REPO_ROOT;

export const NETWORK = (env("C2C_NETWORK", "hardhat") === "fuji" ? "fuji" : "hardhat") as "fuji" | "hardhat";
export const RPC_URL = env("C2C_RPC_URL", NETWORK === "fuji" ? "https://api.avax-test.network/ext/bc/C/rpc" : "http://127.0.0.1:8545");
export const CHAIN_ID = Number(env("C2C_CHAIN_ID", NETWORK === "fuji" ? "43113" : "31337"));
export const API_PORT = Number(env("API_PORT", "3000"));
export const DATABASE_URL = env("DATABASE_URL", "postgresql://c2c:c2c_dev_pw@localhost:5432/c2c?schema=public");
export const EVALUATOR_PRIVATE_KEY = env("EVALUATOR_PRIVATE_KEY", "");
export const OPERATOR_PRIVATE_KEY = env("OPERATOR_PRIVATE_KEY", "");
export const IPFS_API_URL = env("IPFS_API_URL", "http://127.0.0.1:5001");
export const IPFS_GATEWAY_URL = env("IPFS_GATEWAY_URL", "http://127.0.0.1:8080");
export const SCORE_MIN_INTERVAL_MS = Number(env("SCORE_MIN_INTERVAL_MS", "1000"));
export const EVENT_FUTURE_SKEW_SEC = Number(env("EVENT_FUTURE_SKEW_SEC", "300"));
export const INDEXER_POLL_MS = Number(env("INDEXER_POLL_MS", "5000"));
/** 事件验签策略：true=强制 EIP-191 签名（缺签名 401）；false=匿名放行（L0 调试，默认关） */
export const REQUIRE_SIGNATURE = env("REQUIRE_SIGNATURE", "false") === "true";
