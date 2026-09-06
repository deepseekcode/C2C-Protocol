# Avalanche Builder 环境信息

> 本文件记录 `D:\avalanche` 开发环境的**实际状态**（版本、结构、已知坑、验证记录），
> 供后续会话/协作者快速对齐。最后更新：2026-XX（见 git log `a76f745`）。

## 1. 机器与工具链

| 项 | 值 |
| --- | --- |
| OS | Windows NT 10.0.26340 (win32) |
| Node.js | v22.13.1 |
| pnpm | 12.3.4 |
| Git | 2.42.0.windows.2 |
| Shell | PowerShell（脚本一律用 PowerShell 语法，勿混 bash/cmd） |

> 本机 npm 依赖 reify 会损坏（`cb() never called`），**必须用 pnpm**，勿退回 npm。

## 2. 仓库结构（两个独立 pnpm 工程 + root 编排）

```
D:\avalanche\
├── package.json          # root 编排脚本（无自身依赖）
├── .env                  # 统一环境变量（gitignore，勿提交）
├── .env.example          # 模板（占位私钥 0x0000... 会被拦截）
├── ENVIRONMENT.md        # 本文件
├── contracts/            # Hardhat 工程 @avalanche-env/contracts（CommonJS）
│   ├── hardhat.config.ts #   TS config：启用 .ts 测试收集 + fuji 网络 + verify 配置
│   ├── contracts/Greeter.sol
│   ├── scripts/deploy.ts
│   ├── test/Greeter.test.ts        # 2 passing
│   └── pnpm-workspace.yaml         # allowBuilds: keccak/secp256k1
└── scripts/              # SDK 脚本 @avalanche-env/scripts（ESM, type: module）
    ├── src/info.ts       #   Info API 演示（容错 getNodeID）
    ├── src/balance.ts    #   账户派生 + C 链余额查询
    └── pnpm-workspace.yaml         # allowBuilds: esbuild
```

**root 无 pnpm-workspace.yaml、无依赖** —— 是两个独立 pnpm 项目，
root 脚本用 `pnpm --dir <sub> <cmd>` 编排，**不是 pnpm workspace monorepo**。

## 3. 关键版本（实测自 node_modules）

| 依赖 | 版本 | 位置 |
| --- | --- | --- |
| hardhat | 2.29.1 | contracts |
| @nomicfoundation/hardhat-toolbox | 5.0.0 | contracts |
| ethers | 6.17.0（store 中另有 5.8.0 残留） | contracts (.pnpm) |
| mocha | 10.8.2 + 11.8.0 **双版本共存**（hardhat 2.29 依赖 mocha 11，toolbox peer 要 mocha ^10） | contracts (.pnpm) |
| typescript | 5.9.3 | contracts + scripts |
| @avalanche-sdk/client | 0.1.2 | scripts |
| viem | 2.56.3 | scripts |
| tsx | 4.23.13 | scripts |
| dotenv | 17.x | 两边 |

> mocha 双版本是 pnpm autoInstallPeers 的产物，`hardhat test` 走 hardhat 内部 mocha 11，
> 实测 2 passing，无实际影响，**勿手动"修"它**。

## 4. 网络配置（Fuji Testnet）

| 项 | 值 |
| --- | --- |
| Network Name | Avalanche Fuji Testnet |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc`（可用 FUJI_RPC_URL 覆盖） |
| Chain ID | 43113 |
| Info API networkID | 5 |
| C-Chain 区块链 ID | `yH8D7ThNJkxmtkuv2jgBa4P1Rn3Qpr4pPr7QYNfcdoS6k6HWp` |
| 节点版本 | avalanchego/1.15.0 |
| Explorer | https://testnet.snowtrace.io（Routescan 运营，原 Etherscan 版已于 2023-11 停用） |
| 水龙头 | https://core.app/tools/testnet-faucet/ |

Mainnet（未启用，config 里注释）：RPC `https://api.avax.network/ext/bc/C/rpc`，Chain ID 43114。

## 5. Root npm scripts（`pnpm <script>`）

| 命令 | 作用 |
| --- | --- |
| `pnpm install:all` | 分别安装 contracts/ 与 scripts/ 依赖 |
| `pnpm compile` | `hardhat compile`（contracts） |
| `pnpm test` | `hardhat test`（contracts，2 passing） |
| `pnpm run deploy:fuji` | `hardhat run scripts/deploy.ts --network fuji` |
| `pnpm sdk:info` | tsx 跑 scripts/src/info.ts |
| `pnpm sdk:balance` | tsx 跑 scripts/src/balance.ts |

子目录独立可用：`cd contracts && pnpm test` / `cd scripts && pnpm run typecheck`。

## 6. 环境变量（统一放 root .env，显式加载）

| 变量 | 用途 |
| --- | --- |
| `FUJI_RPC_URL` | 可选，覆盖默认 Fuji RPC |
| `FUJI_PRIVATE_KEY` | 部署/账户私钥（64 位 hex，`0x` 开头） |
| `SNOWTRACE_API_KEY` | 合约 verify 用（**现状存疑，见 §9**） |
| `CHECK_ADDRESS` | 可选，`sdk:balance` 免私钥查任意地址余额 |

**加载机制（关键，勿改回）**：dotenv 默认按 cwd 找 `.env`，而 `pnpm --dir` 会切 cwd 到子目录，
因此各入口都改为**基于文件位置显式解析 root `.env`**：
- `contracts/hardhat.config.ts`：`dotenv.config({ path: path.resolve(__dirname, "../.env") })`
- `scripts/src/info.ts` / `balance.ts`：由 `import.meta.url` 向上定位 root
- 效果：从 root 或子目录运行都读到同一份 `.env`（已探针验证）

> 另注：hardhat 2.29 启动时自身也会显示 `injected env (N) from ..\.env`（新版内置注入），
> 与 config 手动加载并存无害。

**占位私钥拦截**：全零 `0x0000...` 或非 64-hex 会被判定无效 → fuji 账户列表为空 →
deploy 输出友好引导（而非 secp256k1 抛 `Expected valid bigint` 崩溃）。
判定逻辑在 `hardhat.config.ts` 与 `balance.ts` 各有一份（保持同步！）。

## 7. 已踩坑记录（勿重蹈）

1. **npm 不可用** → 一律 pnpm。
2. **hardhat 静默跳过 .ts 测试**：必须 `hardhat.config.ts`（TS config），
   `.js` config 会让 Hardhat 判定为 JS 项目而忽略 `test/**/*.ts`。当时症状：0 tests。
3. **Node 22 原生 TS type-stripping**：直接 `node foo.ts` 会以 ESM 解析 TS，破坏
   hardhat/ethers 的 CJS named import。跑 TS 统一用 tsx / ts-node / hardhat。
4. **ts-node 找 tsconfig 从 cwd 向上**：在 `D:\avalanche`（root）跑 contracts 的
   ts-node 会误用/找不到 config → TS5109 等。**必须在 `contracts/` 内执行**。
5. **@avalanche-sdk/client@0.1.2 的 `chains` 子路径是坏的**：re-export 了当前 viem
   没有的链（`ekta`），`import ... from "@avalanche-sdk/client/chains"` 直接 SyntaxError。
   正确做法：链配置从 `viem/chains` 导入（`avalancheFuji`）。
6. **`@avalanche-sdk/client/accounts` 与 `utils` 是独立子路径**：`privateKeyToAvalancheAccount`
   不在主入口，须 `from "@avalanche-sdk/client/accounts"`。`formatEther`/`isAddress` 直接用 viem。
7. **公共 RPC 禁用部分 Info 方法**：`info.getNodeID` 返回
   "method does not exist / is not available" —— 正常，示例已容错。
8. **root 空 pnpm-lock.yaml**：在 root 跑 pnpm 命令会生成无 importer 的空 lockfile，
   已 gitignore（`/pnpm-lock.yaml`）。
9. **allowBuilds 需要显式声明**（pnpm 12 默认拦截构建脚本）：contracts 需 keccak/secp256k1、
   scripts 需 esbuild，分别写在各自 pnpm-workspace.yaml。

## 8. 验证记录（实测通过）

- `hardhat compile`：Nothing to compile（已编译缓存）✅
- `hardhat test`：Greeter 2 passing ✅
- contracts + scripts `tsc --noEmit`：0 error ✅
- `pnpm sdk:info`：Network ID 5 / fuji / avalanchego 1.15.0 / C 链 ID ✅
- `pnpm sdk:balance`（CHECK_ADDRESS=0x19E7...）：余额 0.128 AVAX ✅
- 部署（FUJI_PRIVATE_KEY=0x1111...，测试网）：Greeter 真实部署成功
  `0x853595d2742215A7a1616721815E0EACa37a6674` ✅
- verify 无 API key 时正确报错引导（链路通）✅

## 9. 待办 / 存疑

- **Snowtrace verify 现状存疑**：原 Etherscan 版 Snowtrace 2023-11-30 停用，现 snowtrace.io
  由 Routescan 运营（仅浏览器）。hardhat-verify 内置的 Fuji 端点仍是
  `api-testnet.snowtrace.io/api`（旧配置），很可能已失效。需要合约验证时再实测并迁移
  （候选：Routescan / 官方 explorer 的 verify API）。**在确认前不必申请 SNOWTRACE_API_KEY。**
- 钱包私钥：需用户自行生成（`viem/accounts` 的 `generatePrivateKey` 或 Core/MetaMask 导出），
  测试 AVAX 从 https://core.app/tools/testnet-faucet/ 领取。
- 部署前记得 `.env` 填**真实**私钥（占位符会被拦截）。
