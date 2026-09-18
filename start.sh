#!/usr/bin/env bash
# 塔吊作业冲突预演平台 - 一键启动脚本
# 用法:
#   ./start.sh           优先使用 Docker 启动；无 Docker 时使用本地 Node
#   ./start.sh docker    强制使用 Docker (docker compose)
#   ./start.sh local     强制使用本地 Node (自动安装依赖 + 构建)
#   ./start.sh test      运行全部测试
#   ./start.sh stop      停止 Docker 容器
#   ./start.sh reset     停止容器并清除数据库卷
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-4000}"

log() { printf '\033[36m▶\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }

use_docker() {
  if docker compose version >/dev/null 2>&1; then echo "compose"; return 0; fi
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && { echo "docker"; return 0; }
  return 1
}

start_docker() {
  log "使用 Docker 构建并启动（端口 ${PORT}）…"
  if docker compose version >/dev/null 2>&1; then
    PORT="$PORT" docker compose up -d --build
    log "容器已启动，健康检查中…"
    sleep 6
    docker compose ps
  else
    warn "未检测到 docker compose v2，回退 docker run…"
    docker build -t tower-crane-platform:latest .
    docker rm -f tower-crane-platform >/dev/null 2>&1 || true
    docker run -d --name tower-crane-platform \
      -p "${PORT}:4000" \
      -v crane-data:/app/data \
      --restart unless-stopped \
      tower-crane-platform:latest
  fi
  log "启动完成： http://localhost:${PORT}"
}

start_local() {
  command -v node >/dev/null 2>&1 || { echo "未找到 Node.js（需要 >= 20），请先安装： https://nodejs.org/"; exit 1; }
  log "本地模式：检查依赖…"
  if [ ! -d node_modules ]; then
    log "安装依赖（better-sqlite3 为原生模块，首次安装需要编译）…"
    npm install --no-audit --no-fund
  fi
  if [ ! -d dist ]; then
    log "构建前端…"
    npm run build
  fi
  mkdir -p data
  log "启动服务（端口 ${PORT}），Ctrl+C 停止…"
  PORT="$PORT" DB_PATH="data/app.db" node server/index.js
}

run_tests() {
  [ -d node_modules ] || npm install --no-audit --no-fund
  npm test
}

MODE="${1:-auto}"
case "$MODE" in
  docker)
    start_docker
    ;;
  local)
    start_local
    ;;
  test)
    run_tests
    ;;
  stop)
    if docker compose version >/dev/null 2>&1; then docker compose down; else docker rm -f tower-crane-platform; fi
    log "已停止"
    ;;
  reset)
    if docker compose version >/dev/null 2>&1; then docker compose down -v; else docker rm -f tower-crane-platform && docker volume rm crane-data 2>/dev/null || true; fi
    rm -rf data
    log "已停止并清除数据"
    ;;
  auto)
    if [ -n "$(use_docker 2>/dev/null || true)" ]; then
      start_docker
    else
      warn "Docker 不可用，使用本地 Node 模式"
      start_local
    fi
    ;;
  *)
    echo "用法: $0 [auto|docker|local|test|stop|reset]"
    exit 1
    ;;
esac
