#requires -Version 5.1
<#
.SYNOPSIS
  Uninstalls the ClickUp Local background service and desktop shortcut.
.PARAMETER RemoveData
  Also delete the local database and uploaded files. This cannot be undone.
#>
[CmdletBinding()]
param(
  [switch]$RemoveData
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$taskName = 'ClickUpLocal'

Write-Host ''
Write-Host '  ClickUp 本地版 · 卸载服务' -ForegroundColor Magenta
Write-Host '  ─────────────────────────' -ForegroundColor DarkGray

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host '  ✓ 已移除开机自启服务' -ForegroundColor Green
} else {
  Write-Host '  未找到已安装的服务。' -ForegroundColor DarkGray
}

$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ClickUp 本地版.url'
if (Test-Path -LiteralPath $shortcut) {
  Remove-Item -LiteralPath $shortcut -Force
  Write-Host '  ✓ 已移除桌面快捷方式' -ForegroundColor Green
}

if ($RemoveData) {
  $dataDir = Join-Path $root 'data'
  if (Test-Path -LiteralPath $dataDir) {
    $resolved = (Resolve-Path -LiteralPath $dataDir).Path
    if ($resolved -eq (Join-Path $root 'data')) {
      Remove-Item -LiteralPath $resolved -Recurse -Force
      Write-Host '  ✓ 已删除本地数据（数据库与附件）' -ForegroundColor Green
    }
  }
} else {
  Write-Host '  本地数据已保留在 data 目录中。' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  卸载完成。如需彻底删除，可直接删除整个项目文件夹。' -ForegroundColor DarkGray
Write-Host ''
