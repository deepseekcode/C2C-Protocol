// 链上 getVector 完整读取（7 字段）— 确认 agent 6/7/8 proofHash
import { createPublicClient, http } from "viem";
import { avalancheFuji } from "viem/chains";

const rpc = "https://api.avax-test.network/ext/bc/C/rpc";
const registry = "0x57aa0De8109ea10347e6bAB122437F2264eA7190";
const pc = createPublicClient({ chain: avalancheFuji, transport: http(rpc) });

const abi = [{
  name: "getVector", type: "function", stateMutability: "view",
  inputs: [{ name: "agentId", type: "uint256" }],
  outputs: [{
    components: [
      { name: "execution", type: "uint32" }, { name: "reliability", type: "uint32" },
      { name: "quality", type: "uint32" }, { name: "collaboration", type: "uint32" },
      { name: "tasksCompleted", type: "uint256" }, { name: "proofHash", type: "bytes32" },
      { name: "updatedAt", type: "uint256" },
    ], name: "", type: "tuple",
  }],
}] as const;

for (const id of [6, 7, 8]) {
  const v = await pc.readContract({ address: registry, abi, functionName: "getVector", args: [BigInt(id)] }) as unknown as {
    execution: bigint; reliability: bigint; quality: bigint; collaboration: bigint;
    tasksCompleted: bigint; proofHash: `0x${string}`; updatedAt: bigint;
  };
  console.log(`agent ${id}: exec=${v.execution} reliab=${v.reliability} qual=${v.quality} collab=${v.collaboration} tasks=${v.tasksCompleted}`);
  console.log(`   proofHash=${v.proofHash}`);
}
