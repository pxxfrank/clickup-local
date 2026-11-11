[CmdletBinding()]
param(
  [ValidateSet('Open', 'StartService', 'Stop', 'StopQuiet', 'Status', 'OpenLogs')]
  [string]$Action = 'Open'
)

$ErrorActionPreference = 'Stop'
$installRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = Join-Path $installRoot 'runtime\node.exe'
$serverEntry = Join-Path $installRoot 'app\server\index.js'
$port = 23090
$url = "http://127.0.0.1:$port"
$appStateDir = Join-Path $env:LOCALAPPDATA 'ClickUpLocal'
$dataDir = Join-Path $appStateDir 'data'
$logDir = Join-Path $appStateDir 'logs'
$outLog = Join-Path $logDir 'server.out.log'
$errLog = Join-Path $logDir 'server.err.log'
$pidFile = Join-Path $logDir 'server.pid'

New-Item -ItemType Directory -Force -Path $dataDir, $logDir | Out-Null
$env:CLICKUP_DATA_DIR = $dataDir
$env:HOST = '127.0.0.1'
$env:PORT = [string]$port

function Show-Message {
  param(
    [string]$Text,
    [string]$Title = 'ClickUp 本地版',
    [string]$Icon = 'Information'
  )
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $boxIcon = [System.Windows.Forms.MessageBoxIcon]::Information
    if ($Icon -eq 'Error') { $boxIcon = [System.Windows.Forms.MessageBoxIcon]::Error }
    if ($Icon -eq 'Warning') { $boxIcon = [System.Windows.Forms.MessageBoxIcon]::Warning }
    [System.Windows.Forms.MessageBox]::Show($Text, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $boxIcon) | Out-Null
  } catch {
    # If the window station is unavailable (for example during a service start),
    # the caller still gets a non-zero exit code when appropriate.
  }
}

function Test-ClickUpHealth {
  try {
    $response = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2 -ErrorAction Stop
    return ($response.name -eq 'ClickUp Local')
  } catch {
    return $false
  }
}

function Get-ClickUpProcesses {
  try {
    return @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop | Where-Object {
      $_.CommandLine -and $_.CommandLine.Contains($serverEntry)
    })
  } catch {
    return @()
  }
}

function Rotate-Logs {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  if (Test-Path -LiteralPath $outLog) {
    Move-Item -LiteralPath $outLog -Destination (Join-Path $logDir "server-$stamp-out.log") -Force
  }
  if (Test-Path -LiteralPath $errLog) {
    Move-Item -LiteralPath $errLog -Destination (Join-Path $logDir "server-$stamp-err.log") -Force
  }
  Get-ChildItem -LiteralPath $logDir -Filter 'server-*.log' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 20 |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

function Start-ClickUpBackground {
  if (Test-ClickUpHealth) {
    return $true
  }

  $existing = @(Get-ClickUpProcesses)
  if ($existing.Count -gt 0) {
    for ($i = 0; $i -lt 16; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-ClickUpHealth) { return $true }
    }
    throw "检测到 ClickUp 进程，但健康检查没有通过。`n`n请打开「查看运行日志」排查，或先运行「停止后台服务」后重试。"
  }

  if (-not (Test-Path -LiteralPath $nodeExe)) {
    throw "未找到内置 Node.js 运行时：`n$nodeExe"
  }
  if (-not (Test-Path -LiteralPath $serverEntry)) {
    throw "未找到应用程序文件：`n$serverEntry"
  }

  Rotate-Logs
  $process = Start-Process `
    -FilePath $nodeExe `
    -ArgumentList @("`"$serverEntry`"", '--port', "$port") `
    -WorkingDirectory $installRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

  Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ASCII

  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ClickUpHealth) { return $true }
    if ($process.HasExited) { break }
  }

  throw "服务未能在 20 秒内启动。`n`n日志文件：`n$outLog`n$errLog"
}

function Stop-ClickUpBackground {
  $processes = @(Get-ClickUpProcesses)
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  return $processes.Count
}

switch ($Action) {
  'StartService' {
    try {
      Start-ClickUpBackground | Out-Null
      exit 0
    } catch {
      Show-Message ("ClickUp 本地版后台服务启动失败。`n`n" + $_.Exception.Message + "`n`n日志目录：`n$logDir") 'ClickUp 本地版' 'Error'
      exit 1
    }
  }
  'Open' {
    try {
      Start-ClickUpBackground | Out-Null
      Start-Process $url
      exit 0
    } catch {
      Show-Message ("ClickUp 本地版启动失败。`n`n" + $_.Exception.Message + "`n`n日志目录：`n$logDir") 'ClickUp 本地版' 'Error'
      exit 1
    }
  }
  'Stop' {
    $count = Stop-ClickUpBackground
    if ($count -gt 0) {
      Show-Message "已停止 ClickUp 本地版后台服务。" 'ClickUp 本地版'
    } else {
      Show-Message "ClickUp 本地版当前没有在后台运行。" 'ClickUp 本地版'
    }
    exit 0
  }
  'StopQuiet' {
    Stop-ClickUpBackground | Out-Null
    exit 0
  }
  'Status' {
    if (Test-ClickUpHealth) {
      Show-Message "ClickUp 本地版正在运行。`n`n$url`n`n数据目录：`n$dataDir`n`n日志目录：`n$logDir" 'ClickUp 本地版'
    } else {
      Show-Message "ClickUp 本地版当前没有运行。" 'ClickUp 本地版'
    }
    exit 0
  }
  'OpenLogs' {
    Start-Process explorer.exe $logDir
    exit 0
  }
}
