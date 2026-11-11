@echo off
chcp 65001 >nul
title ClickUp 本地版
cd /d "%~dp0"

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:23090/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
  echo.
  echo  ClickUp 本地版已在运行，正在打开浏览器...
  start "" "http://127.0.0.1:23090"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] 未检测到 Node.js。
  echo      请安装 Node.js 24 或更高版本：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo  正在安装依赖，请稍候...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :error
)

if not exist "dist\index.html" (
  echo  正在构建前端...
  call npm run build
  if errorlevel 1 goto :error
)

echo.
echo  正在启动 ClickUp 本地版...
echo  浏览器将自动打开；关闭此窗口即可停止服务。
echo.
node server\index.js --open
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo  启动失败，请查看上方错误信息。
pause
exit /b 1
