@echo off
chcp 65001 >nul
setlocal
title ClickUp 本地版 - 调试控制台
cd /d "%~dp0.."
set "CLICKUP_DATA_DIR=%LOCALAPPDATA%\ClickUpLocal\data"
set "HOST=127.0.0.1"
set "PORT=23090"

if not exist "%CLICKUP_DATA_DIR%" mkdir "%CLICKUP_DATA_DIR%"

echo.
echo  ============================================
echo   ClickUp 本地版 · 调试控制台
echo  ============================================
echo   地址：http://127.0.0.1:23090
echo   数据：%CLICKUP_DATA_DIR%
echo.
echo   此窗口会持续显示运行日志；关闭窗口即停止服务。
echo   如提示端口被占用，请先在开始菜单运行「停止后台服务」。
echo.

"runtime\node.exe" "app\server\index.js" --port 23090

echo.
echo  服务已退出。如果这是非预期退出，请复制上方日志用于排查。
pause
