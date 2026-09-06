#!/usr/bin/env bash
# C2C Protocol 本地全链路 e2e 编排（Windows git-bash / WSL / mac / linux 通用）
# 依赖：Docker(PG) + node + pnpm；Kubo 可选（缺省 proof 降级 local）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"

echo "[e2e] 1/5 PostgreSQL 容器"
docker compose -f "$ROOT/compose.yaml" up -d --pull never
for i in $(seq 1 30); do
  if docker exec c2c-postgres pg_isready -U c2c -d c2c >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "[e2e] 2/5 数据库迁移"
export DATABASE_URL="postgresql://c2c:c2c_dev_pw@localhost:5432/c2c?schema=public"
(cd "$API_DIR" && pnpm prisma:migrate >/dev/null)

echo "[e2e] 3/5 启动 hardhat node + 部署"
# 后台 hardhat node（持久 RPC），等待 8545 就绪
"$ROOT/contracts/node_modules/.bin/hardhat" node --hostname 127.0.0.1 >/tmp/c2c-hardhat.log 2>&1 &
HH_PID=$!
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://127.0.0.1:8545; then break; fi
  sleep 1
done
# 对运行中的 node 部署（deploy.ts 用 --network localhost）
(cd "$ROOT/contracts" && pnpm exec hardhat run scripts/deploy.ts --network localhost >/tmp/c2c-deploy.log 2>&1)

echo "[e2e] 4/5 启动 api"
(cd "$API_DIR" && C2C_NETWORK=hardhat pnpm start >/tmp/c2c-api.log 2>&1) &
API_PID=$!
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://127.0.0.1:3000/health; then break; fi
  sleep 1
done

echo "[e2e] 5/5 运行 e2e 测试"
set +e
(cd "$API_DIR" && pnpm test:e2e)
CODE=$?
set -e

kill $API_PID $HH_PID 2>/dev/null || true
echo "[e2e] exit=$CODE"
exit $CODE
