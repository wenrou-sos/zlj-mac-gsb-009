@echo off
REM 塔吊作业冲突预演平台 —— 一键启动脚本（Windows）
REM 用法: start.bat        安装依赖 -> 测试 -> 构建 -> 启动
REM       start.bat dev    开发模式
REM       start.bat test   仅运行测试
setlocal
set ROOT=%~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo [X] 未检测到 Node.js（需要 Node 18+），请先安装 https://nodejs.org
  exit /b 1
)

if /I "%~1"=="test" (
  cd /d "%ROOT%server"
  if not exist node_modules call npm install
  call npm test
  exit /b %errorlevel%
)

if not exist "%ROOT%server\node_modules" (
  echo ^> 安装后端依赖...
  cd /d "%ROOT%server" && call npm install
)
if not exist "%ROOT%client\node_modules" (
  echo ^> 安装前端依赖...
  cd /d "%ROOT%client" && call npm install
)

echo ^> 运行后端测试...
cd /d "%ROOT%server"
call npm test || exit /b 1

if /I "%~1"=="dev" (
  echo ^> 开发模式: 前端 http://localhost:5173  后端 http://localhost:3001
  start "crane-server" cmd /c "cd /d %ROOT%server && npm run dev"
  start "crane-client" cmd /c "cd /d %ROOT%client && npm run dev"
  exit /b 0
)

echo ^> 构建前端...
cd /d "%ROOT%client" && call npm run build || exit /b 1

echo --------------------------------------------
echo   启动完成，请在浏览器打开: http://localhost:3001
echo   按 Ctrl+C 停止
echo --------------------------------------------
cd /d "%ROOT%server"
node src\index.js
