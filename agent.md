# agent.md — C2C Protocol 环境操作指引

> 本文件供 AI agent 每轮交互前读取。
> 项目 = **C2C Protocol**（Credit-to-Collaborate）：Avalanche 上第一个 Agent Reputation
> Infrastructure Protocol——为 Human-Agent 经济提供可验证、可携带的声誉结算层。
> 当前仓库 = Avalanche Builder 起步环境（Hardhat 合约工程 + @avalanche-sdk/client 脚本，
> 连接 **Fuji Testnet**）+ 产品/技术文档（`doc/`），正按 `doc/实施方案.md` 演进为完整协议工程。
> 详细环境状态见 `ENVIRONMENT.md`（含实测版本、坑记录、验证记录）。

## 0. 方案基线（设计决策以文档为准，勿凭记忆改动）

- **实施方案（最新 V2.1）→ `doc/实施方案.md`**：技术架构与 8 周实施计划的唯一权威来源。
- 核心决策速览（细节一律查文档）：
  - **MVP 只做三条核心路径**：Agent 注册（Path 1）/ Agent 行为记录（Path 2）/ 声誉验证（Path 3）。
  - **Reputation Vector 四维模型**：Execution 30% + Reliability 30% + Quality 25% + Collaboration 15%（0–10000），与 Dashboard 雷达图 1:1。
  - **信任机制 EIP-712**：后端签发 ScoreAttestation 签名，合约只做验签（EVALUATOR_ROLE），不做后端直接改分。
  - **Agent-agnostic**：任何 Agent（DeepSeekCode / Claude Code / Codex / LangChain / 自研）均可接入；
    L0 开放事件协议（HTTP+签名信封）→ L1 零框架依赖核心 SDK → L2 AgentHarness 适配器。
  - **4 合约**：AgentIdentity(ERC721) / ReputationPassport(ERC1155, SBT 禁转账) / ReputationRegistry(Vector 状态) / AttestationRegistry。
- **V1 禁止事项**（`doc/产品设计.md` §九）：不做 CT Token / AMM / Lending / DAO / 跨链 / 支付结算；
  Task Marketplace 仅 mock 演示数据。
- 链上/链下边界：AI 计算、评分过程、任务详情在链下；链上只放 Vector 状态、Proof Hash、NFT 所有权、Attestation。

## 1. 环境硬约束（违反会白费功夫）

- **包管理一律用 pnpm**，禁止 npm（本机 npm reify 会损坏：`cb() never called`）。
- 运行 TS 一律走 `tsx` / `hardhat`，**禁止 `node foo.ts`**（Node 22 type-stripping 会破坏 hardhat/ethers 的 CJS named import）。
- 两个子工程（contracts / scripts）是**独立 pnpm 项目**，非 monorepo；root 无自身依赖，用 `pnpm --dir <sub> <cmd>` 编排。
- `.env` 统一放仓库根，**基于文件位置显式加载**（勿改回按 cwd 加载）；`.env` 已 gitignore，**禁止提交私钥**。
- 占位私钥 `0x0000...` 会被拦截并给友好提示（`hardhat.config.ts` 与 `balance.ts` 各有一份判定逻辑，改时保持同步）。
- 仓库目录当前为 `D:\C2C Protocol`（计划重命名为 `D:\c2c-protocol`，因会话占用未完成，见 `.workbuddy/memory/` 日志）；文档中残留的 `D:\avalanche` 均指本仓库。

## 2. 常用命令（在仓库根执行）

| 目的 | 命令 |
| --- | --- |
| 安装全部依赖 | `pnpm install:all` |
| 编译合约 | `pnpm compile`（= contracts `hardhat compile`） |
| 跑合约测试 | `pnpm test`（Greeter，当前 2 passing） |
| 部署到 Fuji | `pnpm run deploy:fuji`（需 `.env` 填真实私钥） |
| SDK 读网络信息 | `pnpm sdk:info` |
| SDK 查 C 链余额 | `pnpm sdk:balance`（可用 `.env` 的 `CHECK_ADDRESS` 免私钥） |
| SDK 类型检查 | `cd scripts && pnpm run typecheck` |

> 网络：Fuji C-Chain，Chain ID `43113`，RPC `https://api.avax-test.network/ext/bc/C/rpc`。
> Mainnet（43114）在 hardhat.config.ts 中注释，默认不启用。
> 实施方案新增命令（`dev:api` / `dev:web` / `sdk:demo` / `seed` / `typecheck`）随 Sprint 0 落地后补充到 root package.json。

## 3. 目录结构（现状 → 目标）

```
D:\C2C Protocol\                        # 现状
├── agent.md / README.md / ENVIRONMENT.md
├── .env / .env.example                 # 环境变量（.env 勿提交）
├── package.json                        # root 编排脚本（无依赖）
├── contracts/                          # Hardhat 工程（CJS，保持独立）
│   ├── hardhat.config.ts               #   TS config（收集 .ts 测试 + fuji）
│   ├── contracts/Greeter.sol           #   占位合约 → Sprint 1 起新增 4 个业务合约
│   ├── scripts/deploy.ts               #   → 扩展为按序部署 + 输出 deployments/fuji.json
│   └── test/Greeter.test.ts
├── scripts/                            # @avalanche-sdk/client 脚本（ESM, tsx）
│   └── src/info.ts · balance.ts        #   → Sprint 0 迁入 packages/shared
└── doc/                                # 产品与技术文档（UTF-8 无 BOM）
    ├── 产品说明.md · 产品设计.md · 产品 ui.md
    ├── 技术架构.md · 实施方案.md          # 实施方案 = 最新权威方案（V2.1）
    ├── C2C_Protocol_Product_Design.html # 可交互原型（暗色科技风，UI 设计基准）
    └── README.md                       # doc 索引

# Sprint 0 起新增（详见 实施方案.md §2.3）：
# packages/agent-sdk · packages/reputation-engine · packages/shared
# apps/api（NestJS+Prisma+PostgreSQL）· apps/web（Next.js 14）
```

## 4. 已知坑速查（详见 ENVIRONMENT.md §7）

- **hardhat 静默跳过 .ts 测试** → 必须用 `hardhat.config.ts`（勿改成 .js）。
- **`@avalanche-sdk/client` 的 `chains` 子路径是坏的**（re-export 了 viem 没有的 `ekta`）→ 链配置从 `viem/chains` 导入（`avalancheFuji`）。
- `privateKeyToAvalancheAccount` 在 `@avalanche-sdk/client/accounts`（独立子路径），不在主入口。
- 公共 RPC 禁用 `info.getNodeID` 等 → 属正常，脚本已容错。
- pnpm 12 默认拦截构建脚本 → allowBuilds（keccak/secp256k1 / esbuild）在各子工程 pnpm-workspace.yaml 已声明；新增包时同步维护。
- mocha 双版本共存（10+11）是 pnpm autoInstallPeers 产物，实测无影响，**勿手动修**。
- Snowtrace verify API 存疑（Etherscan 版已停用）→ 需要合约验证时先实测，勿盲目申请 SNOWTRACE_API_KEY。

## 5. 代码规范与协作

- 遵循现有风格：合约 Solidity 0.8.24 + optimizer + OpenZeppelin 5.x；脚本 TS strict；root 脚本用 `pnpm --dir` 编排。
- **改动前先读 `git status` 与 ENVIRONMENT.md**：本目录可能有多实例并行编辑，文件改动以增量 edit 为主，勿整体覆盖他人未提交的改动。
- 新增功能应补测试（Hardhat test 目录）；测试后跑 `pnpm test` 与子工程 `tsc --noEmit` 确认 0 error。
- 合约测试门禁：权限分支、EIP-712 验签分支（过期/重放/错误签名人 revert）、SBT 转账 revert 必须覆盖。
- 文档流转：产品文案 → `doc/产品*.md`；技术/合约设计 → `doc/技术架构.md`；实施计划/Builder Hub 方案 → `doc/实施方案.md`；原型 → `doc/C2C_Protocol_Product_Design.html`。
- 提交信息风格参考现有 log（`docs:`/`fix:`/`chore:` 前缀，中文描述）。

## 6. 关联项目（dogfood 接入方）

- **DeepSeekCode**（`C:\Users\HUAWEI\Desktop\deepseekcode`）：Bun + 多包 workspace 的 AI coding agent，
  插件体系见 `packages/plugins/`（trajectory 等，订阅宿主事件流机制）。
  C2C 的首个真实接入方：`@c2c/adapter-deepseekcode` 以其插件形式实现（实施方案 §5.4）。
