/**
 * SDK 快速上手示例 1：读取网络信息
 *
 * 用 @avalanche-sdk/client 连接 Avalanche Fuji Testnet，调用 Info API
 * 读取网络基本信息。部分方法（如 info.getNodeID）在公共 RPC 节点上被禁用，
 * 脚本会对单个方法失败做容错提示，不影响其余输出。
 *
 * 运行：pnpm sdk:info   （在仓库根目录执行）
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { createAvalancheClient } from "@avalanche-sdk/client";
// 注意：SDK 的 "@avalanche-sdk/client/chains" 子路径 re-export 了当前 viem 版本中
// 不存在的链（ekta），会抛 SyntaxError；avalancheFuji 等链配置直接从 viem/chains 导入。
import { avalancheFuji } from "viem/chains";

// .env 统一放仓库根目录（与 contracts 共用一份）。dotenv 默认按 cwd 查找，
// pnpm --dir scripts 会把 cwd 切到本目录，故基于本文件位置向上解析到仓库根。
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadDotenv({ path: path.join(ROOT_DIR, ".env") });

const RPC_URL =
  process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

async function main() {
  // 创建 Avalanche 客户端（transport 可省略 url，SDK 会用 chain 默认 RPC；
  // 这里显式传入，便于覆盖为自己的节点 / 第三方 RPC）
  const client = createAvalancheClient({
    chain: avalancheFuji,
    transport: {
      type: "http",
      url: RPC_URL,
    },
  });

  console.log("== Avalanche SDK Info API（Fuji Testnet）==\n");
  console.log("RPC:", RPC_URL);

  const { getNetworkID, getNetworkName, getNodeVersion, getBlockchainID, getNodeID } = client.info;

  // 每个方法独立 try/catch：公共 RPC 常禁用 getNodeID 等敏感方法，降级提示不影响其余输出。
  const show = (label: string, value: unknown) =>
    console.log(label.padEnd(14), ":", String(value));

  try {
    const { networkID } = await getNetworkID();
    show("Network ID", networkID);
  } catch (err) {
    show("Network ID", `不可用 - ${(err as Error).message.split("\n")[0]}`);
  }

  try {
    const { networkName } = await getNetworkName();
    show("Network Name", networkName);
  } catch (err) {
    show("Network Name", `不可用 - ${(err as Error).message.split("\n")[0]}`);
  }

  try {
    const { version } = await getNodeVersion();
    show("Node Version", version);
  } catch (err) {
    show("Node Version", `不可用 - ${(err as Error).message.split("\n")[0]}`);
  }

  try {
    const { blockchainID } = await getBlockchainID({ alias: "C" });
    show("C-Chain ID", blockchainID);
  } catch (err) {
    show("C-Chain ID", `不可用 - ${(err as Error).message.split("\n")[0]}`);
  }

  try {
    const { nodeID } = await getNodeID(); // 公共 RPC 通常禁用，演示容错
    show("Node ID", nodeID);
  } catch (err) {
    show("Node ID", `不可用 - ${(err as Error).message.split("\n")[0]}`);
  }
}

main().catch((err) => {
  console.error("\n调用失败：", err?.message ?? err);
  process.exitCode = 1;
});
