# Avalanche Builder Environment

Avalanche Builder Hub / Hackathon 起步环境（Windows 可用）。包含：

- **Node.js 20+** + **pnpm** 管理的两个独立工程：`contracts`（Hardhat）与 `scripts`（SDK 脚本），由根目录 npm scripts 统一编排
- **Hardhat** Solidity 开发环境，预配置 **Fuji Testnet (Chain ID 43113)**
- **@avalanche-sdk/client** TypeScript SDK 示例（连接 Fuji、读网络信息、查余额）
- `.env.example` 模板（Fuji RPC / 私钥 / Snowtrace API Key）

## 环境要求

| 工具 | 版本 | 检查 |
| --- | --- | --- |
| Node.js | >= 20 | `node -v` |
| pnpm | >= 10 | `pnpm -v` |
| Git | 任意 | `git --version` |

> 为什么用 pnpm：本机 npm 的依赖 reify 在此工程上会损坏（`ERR_ERR_REIFY_...`/`cb() never called`），
> pnpm 可稳定安装。若你坚持用 npm，请先修复本机 npm 环境。

钱包：建议 Core Wallet + MetaMask，网络添加 Fuji Testnet (Chain ID `43113`, Currency `AVAX`)，
测试 AVAX 从 Fuji Faucet 领取（见下文）。

## 快速开始

```bash
pnpm install:all       # 分别安装 contracts/ 与 scripts/ 依赖
pnpm compile           # 编译 contracts (Hardhat)
pnpm test              # 跑 Hardhat 测试 (Solidity 单测)
pnpm sdk:info          # SDK 读取 Fuji 网络信息 (Info API)
pnpm sdk:balance       # SDK 查询 C-Chain 余额（需在 .env 配 FUJI_PRIVATE_KEY 或 CHECK_ADDRESS）
```

也可分别进入子目录操作：

```bash
cd contracts && pnpm test            # Hardhat 测试
cd scripts   && pnpm run typecheck   # SDK 脚本类型检查
```

## 目录结构

```
avalanche/
├── package.json          # 根编排脚本 (pnpm compile/test/sdk:*)
├── .env.example          # 环境变量模板
├── contracts/            # Hardhat 工程 (Solidity)，独立 pnpm 项目
│   ├── hardhat.config.ts #   TS 配置（启用 .ts 测试收集）
│   ├── contracts/        #   智能合约源码 (Greeter.sol)
│   ├── scripts/          #   部署脚本 (deploy.ts)
│   └── test/             #   测试 (Greeter.test.ts)
└── scripts/              # @avalanche-sdk/client TS 脚本，独立 pnpm 项目 (ESM, tsx)
    └── src/
        ├── info.ts       #   Info API：网络 ID/名称/节点版本/C 链 ID
        └── balance.ts    #   账户派生 + C-Chain 余额查询
```

## Fuji 网络配置

| 项 | 值 |
| --- | --- |
| Network Name | Avalanche Fuji Testnet |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc` |
| Chain ID | `43113` |
| Currency | `AVAX` |
| Explorer | `https://testnet.snowtrace.io` |

## 环境变量

```bash
cp .env.example .env
```

| 变量 | 用途 |
| --- | --- |
| `FUJI_RPC_URL` | 可选，覆盖 Fuji RPC（默认官方公共端点） |
| `FUJI_PRIVATE_KEY` | 部署 / 账户演示私钥（Fuji 测试网，勿用主网钱包！） |
| `SNOWTRACE_API_KEY` | 可选，合约验证用 |
| `CHECK_ADDRESS` | 可选，`pnpm sdk:balance` 免私钥查任意地址余额 |

## 部署到 Fuji

1. `cp .env.example .env`，填入你自己的 Fuji 测试私钥
2. `pnpm run deploy:fuji`

> ⚠️ 永远不要在 .env 里放主网/主钱包私钥。Fuji 用单独的钱包（wallet-dev / wallet-test）。

## 合约测试与验证

```bash
pnpm test                          # 合约单测（本地 hardhat 网络）
cd contracts
npx hardhat verify --network fuji DEPLOYED_CONTRACT_ADDRESS <constructor_args...>
```

## 已知坑

- **Hardhat 收集 .ts 测试**：项目必须用 `hardhat.config.ts`（而非 `.js`），
  Hardhat 依据 config 扩展名判断是否 TypeScript 项目，否则会静默跳过 `test/**/*.ts`。
- **Node >= 22 实验性 TS type-stripping**：若直接 `node foo.ts` 跑 TS 会走 ESM 解析导致
  `hardhat`/`ethers` 的 CJS named import 失败；统一走 `tsx` / `ts-node` 或本仓库 scripts。
- **@avalanche-sdk/client@0.1.2 的 `chains` 子路径**：它 re-export 了当前 viem 版本不存在的
  链（如 `ekta`），`import ... from "@avalanche-sdk/client/chains"` 会抛 SyntaxError。
  本仓库示例改用 `import { avalancheFuji } from "viem/chains"`（等价）。
- **公共 RPC 限制**：`info.getNodeID` 等敏感方法在公共节点被禁用属正常现象，示例脚本已做容错。

## 测试 AVAX（Fuji Faucet）

- Core Wallet 内建的 Fuji 水龙头
- https://faucet.avax.network （网页版，需登录钱包）
- https://core.app/tools/testnet-faucet/

## Mainnet 参考

| 项 | 值 |
| --- | --- |
| Network Name | Avalanche Mainnet |
| RPC URL | `https://api.avax.network/ext/bc/C/rpc` |
| Chain ID | `43114` |
| Currency | `AVAX` |

> 警告：部署到 Mainnet 前先做安全审计，并使用独立的多签/冷钱包。
