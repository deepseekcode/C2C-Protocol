/**
 * SDK 快速上手示例 1：读取网络信息
 *
 * 用 @avalanche-sdk/client 连接 Avalanche Fuji Testnet，调用 Info API
 * 读取网络基本信息。部分方法（如 info.getNodeID）在公共 RPC 节点上被禁用，
 * 脚本会对单个方法失败做容错提示，不影响其余输出。
 *
 * 运行：pnpm sdk:info   （或 npm run sdk:info）
 */
import { createAvalancheClient } from "@avalanche-sdk/client";
// 注意：SDK 的 "@avalanche-sdk/client/chains" 子路径 re-export 了当前 viem 版本中
// 不存在的链（ekta），会抛 SyntaxError；avalancheFuji 等链配置直接从 viem/chains 导入。
import { avalancheFuji } from "viem/chains";
import "dotenv/config";

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

  // Info API 方法（client.info.* 直接调用节点 JSON-RPC）
  // getNetworkID / getNetworkName / getNodeVersion / getBlockchainID 在公共节点可用；
  // getNodeID 等敏感方法常被公共 RPC 禁用，这里也演示一下容错写法。
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["Network ID", () => client.info.getNetworkID()],
    ["Network Name", () => client.info.getNetworkName()],
    ["Node Version", () => client.info.getNodeVersion()],
    ["C-Chain ID", () => client.info.getBlockchainID({ alias: "C" })],
    ["Node ID", () => client.info.getNodeID()], // 公共 RPC 通常禁用，演示容错
  ];

  for (const [label, fn] of calls) {
    try {
      const r = (await fn()) as Record<string, string>;
      console.log(label.padEnd(14), ":", Object.values(r)[0]);
    } catch (err) {
      console.log(label.padEnd(14), ":", "不可用 -", (err as Error).message.split("\n")[0]);
    }
  }
}

main().catch((err) => {
  console.error("\n调用失败：", err?.message ?? err);
  process.exitCode = 1;
});
