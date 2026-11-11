#requires -Version 5.1
<#
.SYNOPSIS
  Installs ClickUp Local as a background service (Windows scheduled task at logon).
.DESCRIPTION
  Creates a hidden scheduled task, a desktop shortcut, and starts the server.
  Data stays in the project's data directory. Re-run this script to update the port.
.PARAMETER Port
  HTTP port. Default 23090.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-service.ps1
#>
[CmdletBinding()]
param(
  [int]$Port = 23090
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$taskName = 'ClickUpLocal'
$launcher = Join-Path $root 'scripts\run-hidden.vbs'
$url = "http://127.0.0.1:$Port"

Write-Host ''
Write-Host '  ClickUp 本地版 · 安装为开机自启服务' -ForegroundColor Magenta
Write-Host '  ─────────────────────────────────────' -ForegroundColor DarkGray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw '未找到 Node.js。请先安装 Node.js 24 或更高版本：https://nodejs.org/'
}
if (-not (Test-Path -LiteralPath $launcher)) {
  throw "缺少启动器：$launcher"
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\express\package.json'))) {
  Write-Host '  正在安装依赖...' -ForegroundColor Yellow
  Push-Location $root
  try { & npm.cmd install --no-audit --no-fund } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'dist\index.html'))) {
  Write-Host '  正在构建前端...' -ForegroundColor Yellow
  Push-Location $root
  try { & npm.cmd run build } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw '前端构建失败。' }
}

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "  更新已有服务 $taskName ..." -ForegroundColor DarkGray
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$nodePath = (Get-Command node).Source
$action = New-ScheduledTaskAction `
  -Execute 'wscript.exe' `
  -Argument ('"{0}" {1} "{2}"' -f $launcher, $Port, $nodePath) `
  -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$description = "ClickUp Local - self-hosted team workspace (http://127.0.0.1:$Port)"
Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description $description `
  -Force | Out-Null

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'ClickUp 本地版.url'
@"
[InternetShortcut]
URL=$url
IconFile=%SystemRoot%\System32\SHELL32.dll
IconIndex=13
"@ | Set-Content -LiteralPath $shortcutPath -Encoding ASCII

$running = $false
try {
  $response = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 2
  $running = $response.StatusCode -eq 200
} catch {
  $running = $false
}

if (-not $running) {
  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 2
}

Write-Host ''
Write-Host '  ✓ 安装完成' -ForegroundColor Green
Write-Host "    访问地址：$url" -ForegroundColor White
Write-Host "    桌面快捷方式：$shortcutPath" -ForegroundColor DarkGray
Write-Host '    服务名称：ClickUpLocal（登录 Windows 时自动启动）' -ForegroundColor DarkGray
Write-Host ''
Write-Host '    演示账号：demo@clickup.local / demo1234' -ForegroundColor DarkGray
Write-Host '    卸载服务：powershell -ExecutionPolicy Bypass -File scripts\uninstall-service.ps1' -ForegroundColor DarkGray
Write-Host ''

try { Start-Process $url } catch { Write-Host "  请手动在浏览器打开：$url" }
