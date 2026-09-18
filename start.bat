@echo off
REM 塔吊作业冲突预演平台 - Windows 一键启动
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=4000

if /i "%1"=="test" (
  if not exist node_modules call npm install --no-audit --no-fund
  call npm test
  exit /b %errorlevel%
)
if /i "%1"=="stop" (
  docker compose down 2>nul
  exit /b 0
)

where docker >nul 2>nul
if %errorlevel%==0 (
  echo [*] 使用 Docker 启动，端口 %PORT% ...
  docker compose up -d --build
  if %errorlevel%==0 (
    echo [*] 启动完成: http://localhost:%PORT%
    exit /b 0
  )
  echo [!] Docker 启动失败，尝试本地 Node 模式
)

where node >nul 2>nul
if errorlevel 1 (
  echo [!] 未找到 Node.js ^(需要 v20+^): https://nodejs.org/
  exit /b 1
)
if not exist node_modules call npm install --no-audit --no-fund
if not exist dist call npm run build
if not exist data mkdir data
echo [*] 本地启动: http://localhost:%PORT%  （Ctrl+C 停止）
set DB_PATH=data\app.db
node server\index.js
