# Proof 链上验证（/verify）设计文档

- 日期：2026-09-06
- 状态：已批准
- 关联：Path 3 — 声誉验证（可信消费）｜ doc/实施方案.md §8.3 页面地图

## 1. 背景与目标

C2C 协议的核心价值主张之一是"每一次真实协作产生可独立验证的链上证明"。当前：
- 后端 `ProofService` 生成 canonical proof JSON → `keccak256` → 得 `proofHash`，并上传 IPFS（Kubo，失败降级本地）；原始 `payloadJson` 存入 DB `Proof` 表（schema 注释即预留了 "/verify 可字节级重算比对"）。
- 前端 `ProofCard` 仅**展示** proofHash 与链上已验证状态，无任何验证交互。

**目标**：在现有单页内补上"验证 Proof"闭环——用户点一个按钮，后端**读 DB 原文重算哈希 → 与链上 ReputationRegistry 存储的 proofHash 比对**，前端就地展示"一致 / 不一致 / 数据缺失"结论。

这是 Path 3 声誉验证在产品 UI 上的落地点，也是 Demo 故事线 1:30–2:30 "链上证明可独立验证（现场重算比对 ✅）"的技术支撑。

## 2. 范围

### 做
- 后端新增 `GET /verify/:agentId` 端点（重算 + 链上比对）。
- 前端 `ProofCard` 增加"重新验证"按钮与三态结果展示。
- 类型与数据访问层扩展（`api.ts`）。

### 不做（YAGNI）
- 不做多 Agent 批量验证页。
- 不做独立的 `/verify` 路由页（用户已确认保持单页；如未来需要可平移组件）。
- 不改链上合约、不改 Proof 生成逻辑、不动 Database schema。
- 不做 IPFS CID 内容级验证（当前只验证 hash 一致性，CID 内容拉取属 V2 增强）。

## 3. 现状梳理（实现依据）

### 3.1 后端已有能力
- `ProofService.canonicalJson(obj)`：固定键序 + 无空白序列化（`apps/api/src/proof/proof.service.ts`）。
- `Proof` 表：`hash`（keccak hex，唯一）、`cid`、`payloadJson`（canonical proof JSON 原文）、`agentId`（Agent 的 DB uuid，非链上 agentId！）、`createdAt`。
- `reputationRegistryAbi.getVector(agentId: uint256)` → `{ execution, reliability, quality, collaboration, tasksCompleted, proofHash: bytes32, updatedAt }`（`apps/api/src/chain/abis.ts`）。
- 链上 agentId 是 AgentIdentity tokenId（`Agent.chainAgentId: Int?`，唯一），与 SDK agentId（字符串）不同。
- `chain/client.ts` 提供 `publicClient()` 与 `contractAddress("ReputationRegistry")`，自动按 `C2C_NETWORK`（hardhat/fuji）选链。

### 3.2 关键数据关系（易错点）
- `Proof.agentId` 指向 DB `Agent.id`（uuid 主键）。
- DB `Agent` 有 `chainAgentId`（Int，链上 tokenId）与 `ownerAddress`。
- 链上 `getVector` 需要**链上 agentId（uint256）**，即 `Agent.chainAgentId`。
- 端点入参 `:agentId` 用 **DB Agent 的 chainAgentId（Int）**（前端列表项 `AgentListItem.agentId` 即 chainAgentId 字符串化，需确认）。

### 3.3 前端现状
- `AgentListItem` 含 `agentId`（string）、`proofHash`、`chainVerified`。
- `ProofCard({ proofHash, chainVerified })` 纯展示。
- 组件为 `"use client"`，可加交互状态。

## 4. 接口设计

### 4.1 后端 `GET /verify/:chainAgentId`

放 `ProofModule`（新增 controller 方法或独立 controller），返回：

```jsonc
// 200 成功（三种情况都返回 200，用 status 区分，避免 4xx 语义混乱）
{
  "agentId": 1,            // 链上 agentId
  "status": "verified" | "mismatch" | "no-proof" | "no-agent" | "chain-unreachable",
  "recomputed": "0x...",   // DB payloadJson 重算结果（no-proof 时 null）
  "onchain": "0x...",      // 链上 registry 读取值（无 proof / 链不可达时 null）
  "matched": true | false, // status=verified 时 true；其余 false
  "at": "2026-09-06T12:00:00Z"
}
```

**status 语义**：
| status | 条件 |
|---|---|
| `verified` | 重算成功 且 链上读到 proofHash 且 相等 |
| `mismatch` | 重算成功 且 链上读到 proofHash 且 不相等（数据异常！） |
| `no-proof` | DB 无该 agent 的 Proof（从未评分） |
| `no-agent` | 该 chainAgentId 不存在于 DB Agent |
| `chain-unreachable` | DB 有 proof，但链上读取失败/无上链记录 |

**链上读取方式**：`publicClient().readContract({ address: contractAddress("ReputationRegistry"), abi: reputationRegistryAbi, functionName: "getVector", args: [BigInt(chainAgentId)] })` → 取 `proofHash`（bytes32，viem 返回 `0x...` hex，需与重算的 0x 小写 hex 直接比对）。

**重算方式**：查最新一条 `Proof`（按 createdAt 倒序取首条）→ `keccak256(new TextEncoder().encode(payloadJson))`（与 ProofService 完全一致；payloadJson 已是 canonical 存储，直接编码即可，不必二次 canonicalJson——需在实现时确认存入的是 canonicalJson 产物）。

**异常处理**：链上 RPC 抛错 → 捕获返回 `chain-unreachable`（200）；DB 查询异常 → 500。

### 4.2 前端 `api.ts`

```ts
export interface VerifyResult {
  agentId: number;
  status: "verified" | "mismatch" | "no-proof" | "no-agent" | "chain-unreachable";
  recomputed: string | null;
  onchain: string | null;
  matched: boolean;
  at: string;
}
export async function verifyProof(chainAgentId: string | number): Promise<VerifyResult>
```

### 4.3 前端 ProofCard 交互

- 展示区不变（Network / Status / Proof Hash / Source）。
- 下方新增操作行：`[🔍 重新验证 Proof]` 按钮。
- 点击后三态：
  - **loading**：按钮转 spinner + "正在重算并与链上比对…"
  - **verified**：绿色 ✓ "Proof 验证通过 · 链下重算与链上一致"（附 recomputed/onchain 短 hash + 时间）
  - **mismatch**：红色 ✗ "哈希不一致！（需排查）" 附两个 hash
  - **no-proof / no-agent / chain-unreachable**：琥珀色 ⚠ 对应文案
- 结果区含 `hashEqual 视觉化`：两行 hash（recomputed / onchain）+ 中间比对标记，便于 Demo 讲解。

## 5. 数据流

```
[ProofCard 点击 重新验证]
   │ GET /verify/:chainAgentId
   ▼
[ProofService/Controller]
   ├─ 1. DB: 查 Agent(chainAgentId) → 无 → {status:"no-agent"}
   ├─ 2. DB: 查该 agent 最新 Proof.payloadJson → 无 → {status:"no-proof"}
   ├─ 3. 重算 keccak256(payloadJson) → recomputed
   ├─ 4. 链上 getVector(chainAgentId).proofHash → onchain
   │      （RPC 异常 → {status:"chain-unreachable"}）
   └─ 5. recomputed === onchain ? verified : mismatch
   ▼
[ProofCard 展示三态结果]
```

## 6. 错误处理汇总

| 场景 | 返回 | 前端展示 |
|---|---|---|
| 链上 agentId 无对应 DB Agent | 200 `no-agent` | 琥珀 "未找到该 Agent 记录" |
| 有 Agent 无 Proof | 200 `no-proof` | 琥珀 "该 Agent 尚无 Proof（未评分）" |
| 链上不可达/无上链记录 | 200 `chain-unreachable` | 琥珀 "链上读取失败（检查网络/是否已上链）" |
| 重算≠链上 | 200 `mismatch` | 红色 "哈希不一致" |
| 重算=链上 | 200 `verified` | 绿色 "验证通过" |
| DB 内部错误 | 500 | 红色 "服务器错误" |

## 7. 测试计划

后端（apps/api e2e 或单测）：
1. seed 已有 agent（chainAgentId=1 有 proof）→ GET /verify/1 → `verified` 且 recomputed===onchain。
2. 篡改场景难构造（hash 由链上权威）——以 verified 为正向；补一个"无 proof agent"→ `no-proof`（可用新注册未评分 agent）。
3. 不存在 agentId（如 9999）→ `no-agent`。
4. 链停时调用 → `chain-unreachable`（可在 e2e 里停 hardhat 或 mock RPC，视成本；若难做则人工验证）。

前端：
5. 页面加载正常；对 seed 数据点验证 → 显示绿色通过。
6. 断网/后端停 → 显示错误态不白屏（按钮 catch）。

## 8. 涉及文件

| 文件 | 改动 |
|---|---|
| `apps/api/src/proof/proof.controller.ts`（新） | `GET /verify/:chainAgentId` |
| `apps/api/src/proof/proof.module.ts` | 注册 controller，注入 Prisma/ChainService |
| `apps/api/src/proof/proof.service.ts` | 加 `verifyAgainstChain(chainAgentId)` 方法（读 DB + 重算 + 链上比对） |
| `apps/api/src/chain/abis.ts` | 已含 getVector（无需改）；如需要 `getVector` 输出类型复用 |
| `apps/web/src/lib/api.ts` | `VerifyResult` 类型 + `verifyProof()` |
| `apps/web/src/components/ProofCard.tsx` | 按钮 + 三态结果 UI（loading/verified/mismatch/error） |
| `apps/web/src/app/globals.css` | ProofCard 结果态样式（少量追加） |

## 9. 验收标准

- `pnpm --dir apps/api run test:e2e` 全绿（含新增 verify 用例）。
- `pnpm typecheck` 0 error。
- 前端 3001 页面：选中已 seed agent → 点"重新验证" → 绿色"验证通过 · 链下重算与链上一致"，展示 recomputed/onchain 两 hash 一致。
- Demo 可用性：此交互可在 3 分钟故事线 1:30–2:30 中现场演示。
