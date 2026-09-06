// 只读探针：拉 Fuji 链上 ScoreUpdated 事件（ReputationRegistry 0x57aa0De8109ea10347e6bAB122437F2264eA7190）
import { createPublicClient, http, parseAbiItem } from "viem";
import { avalancheFuji } from "viem/chains";

const REG = "0x57aa0De8109ea10347e6bAB122437F2264eA7190";
const DEPLOY_BLOCK = 58216725n; // ReputationRegistry 部署块

const client = createPublicClient({ chain: avalancheFuji, transport: http("https://api.avax-test.network/ext/bc/C/rpc") });

const event = parseAbiItem(
  "event ScoreUpdated(uint256 indexed agentId, uint32 execution, uint32 reliability, uint32 quality, uint32 collaboration, uint256 composite, bytes32 proofHash)"
);

const latest = await client.getBlockNumber();
console.log("Fuji latest block:", latest.toString());

// 分页拉事件（每页 2000 块），上限防超时
const logs = [];
let from = DEPLOY_BLOCK;
let to = from + 1999n;
let pages = 0;
while (from <= latest && pages < 40) {
  const page = await client
    .getLogs({ address: REG, event, fromBlock: from, toBlock: to < latest ? to : latest })
    .catch((e) => { console.error("page err", from, e.shortMessage ?? e.message); return []; });
  logs.push(...page);
  pages++;
  from = to + 1n;
  to = from + 1999n;
  if (page.length === 0 && pages > 2) break; // 无日志则提前停
}

console.log("ScoreUpdated events found:", logs.length);
for (const l of logs) {
  console.log(
    `block=${l.blockNumber} agentId=${l.args.agentId} E=${l.args.execution} R=${l.args.reliability} Q=${l.args.quality} C=${l.args.collaboration} composite=${l.args.composite} proof=${String(l.args.proofHash).slice(0,18)} tx=${String(l.transactionHash).slice(0,18)}`
  );
}
