/**
 * 内联最小 ABI（仅含 api 用到的函数/事件）。
 * 与 contracts/contracts/*.sol 保持同步；完整 ABI 见 contracts/artifacts。
 * 注意：如需 full 形态可运行时从 artifacts 读取，但 contracts 为独立工程，api 不依赖其产物，
 * 故内联最小集合并在此注释契约版本（0.8.24 / OZ 5.x）。
 */

export const agentIdentityAbi = [
  {
    type: "function",
    name: "createAgent",
    stateMutability: "nonpayable",
    inputs: [{ name: "metadataURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalAgents",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "AgentCreated",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "metadataURI", type: "string", indexed: false },
    ],
  },
] as const;

export const reputationRegistryAbi = [
  {
    type: "function",
    name: "submitScore",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "att",
        type: "tuple",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "execution", type: "uint32" },
          { name: "reliability", type: "uint32" },
          { name: "quality", type: "uint32" },
          { name: "collaboration", type: "uint32" },
          { name: "tasksCompleted", type: "uint256" },
          { name: "proofHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint64" },
        ],
      },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getVector",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "execution", type: "uint32" },
          { name: "reliability", type: "uint32" },
          { name: "quality", type: "uint32" },
          { name: "collaboration", type: "uint32" },
          { name: "tasksCompleted", type: "uint256" },
          { name: "proofHash", type: "bytes32" },
          { name: "updatedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "compositeScore",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "domainSeparator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

export const reputationPassportAbi = [
  {
    type: "function",
    name: "mintPassport",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "hasPassport",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
