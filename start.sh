#!/usr/bin/env bash
# 塔吊作业冲突预演平台 —— 一键启动脚本（Linux / macOS）
# 用法:
#   ./start.sh           安装依赖 → 运行后端测试 → 构建前端 → 启动服务
#   ./start.sh dev       开发模式（前后端分别热更新，端口 5173 / 3001）
#   ./start.sh test      仅运行后端测试
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && builtin pwd)"
SERVER="$ROOT/server"
CLIENT="$ROOT/client"

echo "────────────────────────────────────────────"
echo "  🏗️  塔吊作业冲突预演平台 一键启动"
echo "────────────────────────────────────────────"

command -v node >/dev/null || { echo "✘ 未检测到 Node.js（需要 Node 18+），请先安装: https://nodejs.org"; exit 1; }
echo "✔ Node $(node -v)"

if [ "${1:-run}" = "test" ]; then
  cd "$SERVER"
  [ -d node_modules ] || npm install
  npm test
  exit 0
fi

# 1) 依赖安装
if [ ! -d "$SERVER/node_modules" ]; then
  echo "▶ 安装后端依赖..."
  (cd "$SERVER" && npm install)
else
  echo "✔ 后端依赖已就绪"
fi
if [ ! -d "$CLIENT/node_modules" ]; then
  echo "▶ 安装前端依赖..."
  (cd "$CLIENT" && npm install)
else
  echo "✔ 前端依赖已就绪"
fi

# 2) 运行测试（确保项目正常）
echo "▶ 运行后端测试..."
(cd "$SERVER" && npm test)

if [ "${1:-run}" = "dev" ]; then
  echo "▶ 开发模式启动..."
  echo "  前端: http://localhost:5173   后端: http://localhost:3001"
  (cd "$SERVER" && npm run dev) &
  BACK_PID=$!
  (cd "$CLIENT" && npm run dev) &
  FRONT_PID=$!
  trap "kill $BACK_PID $FRONT_PID 2>/dev/null || true" EXIT INT TERM
  wait
  exit 0
fi

# 3) 构建前端
echo "▶ 构建前端..."
(cd "$CLIENT" && npm run build)

# 4) 启动（Express 同时托管 API 与前端静态资源）
echo "────────────────────────────────────────────"
echo "  ✔ 启动完成！请在浏览器打开:"
echo "       http://localhost:3001"
echo "  按 Ctrl+C 停止"
echo "────────────────────────────────────────────"
cd "$SERVER"
exec node src/index.js
