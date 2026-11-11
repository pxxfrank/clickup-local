#requires -Version 5.1
<#
.SYNOPSIS
  Builds the per-user Windows installer for ClickUp Local.

.DESCRIPTION
  Downloads/caches the official Node.js runtime and NSIS, stages a production
  build, then compiles release\ClickUp-Local-Setup-<version>.exe.
#>
[CmdletBinding()]
param(
  [string]$Version = '',
  [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$windowsDir = Join-Path $root 'packaging\windows'
$buildDir = Join-Path $root 'build\win'
$cacheDir = Join-Path $root 'build\cache'
$stageDir = Join-Path $buildDir 'stage'
$releaseDir = Join-Path $root 'release'
$nodeVersion = '24.14.0'
$nodeZipName = "node-v$nodeVersion-win-x64.zip"
$nodeZipPath = Join-Path $cacheDir $nodeZipName
$nodeExtractDir = Join-Path $cacheDir "node-v$nodeVersion-win-x64"
$nsisZipPath = Join-Path $cacheDir 'nsis-3.11.zip'
$nsisDir = Join-Path $root 'build\tools\nsis\nsis-3.11'
$makensis = Join-Path $nsisDir 'makensis.exe'
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeZipName"
$shasumsUrl = "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt"
$nsisUrl = 'https://sourceforge.net/projects/nsis/files/NSIS%203/3.11/nsis-3.11.zip/download'

function Write-Step([string]$Text) {
  Write-Host ''
  Write-Host "  $Text" -ForegroundColor Magenta
}

function Invoke-Download([string]$Url, [string]$Destination) {
  if (Test-Path -LiteralPath $Destination) { return }
  Write-Host "  Downloading $Url" -ForegroundColor DarkGray
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & $curl.Source --silent --show-error -L --fail --connect-timeout 30 --max-time 900 -o $Destination $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
  } else {
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
  }
}

if (-not $Version) {
  $packageJson = [System.IO.File]::ReadAllText((Join-Path $root 'package.json'), [System.Text.Encoding]::UTF8)
  $package = $packageJson | ConvertFrom-Json
  $Version = $package.version
}
$outFile = Join-Path $releaseDir "ClickUp-Local-Setup-$Version.exe"

Write-Step "ClickUp Local Windows installer builder"
Write-Host "  version: $Version"

# Required local tools.
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) { throw 'Node.js 24 and npm are required to build this project.' }

# Build the web frontend first.
if (-not $SkipWebBuild) {
  Write-Step 'Building web frontend'
  Push-Location $root
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
  } finally {
    Pop-Location
  }
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'dist\index.html'))) {
  throw 'dist/index.html is missing. Run npm run build first.'
}

# Node.js portable runtime.
Write-Step 'Preparing Node.js runtime'
New-Item -ItemType Directory -Force -Path $cacheDir, $buildDir, $releaseDir, (Join-Path $buildDir 'tmp') | Out-Null
Invoke-Download $nodeUrl $nodeZipPath
$shasumsPath = Join-Path $cacheDir 'SHASUMS256.txt'
Invoke-Download $shasumsUrl $shasumsPath
$expected = (Get-Content -LiteralPath $shasumsPath | Where-Object { $_ -match [regex]::Escape($nodeZipName) } | Select-Object -First 1).Split(' ')[0]
$actual = (Get-FileHash -LiteralPath $nodeZipPath -Algorithm SHA256).Hash.ToLower()
if ($expected -and $actual -ne $expected.ToLower()) {
  throw "Node.js checksum mismatch: expected $expected, got $actual"
}
if (-not (Test-Path -LiteralPath (Join-Path $nodeExtractDir 'node.exe'))) {
  $extractTemp = Join-Path $buildDir 'tmp\node'
  if (Test-Path -LiteralPath $extractTemp) { Remove-Item -LiteralPath $extractTemp -Recurse -Force }
  Expand-Archive -LiteralPath $nodeZipPath -DestinationPath $extractTemp -Force
  if (Test-Path -LiteralPath $nodeExtractDir) { Remove-Item -LiteralPath $nodeExtractDir -Recurse -Force }
  Move-Item -LiteralPath (Join-Path $extractTemp "node-v$nodeVersion-win-x64") -Destination $nodeExtractDir
  Remove-Item -LiteralPath $extractTemp -Recurse -Force -ErrorAction SilentlyContinue
}

# NSIS portable compiler.
Write-Step 'Preparing NSIS'
if (-not (Test-Path -LiteralPath $makensis)) {
  Invoke-Download $nsisUrl $nsisZipPath
  $nsisExtract = Join-Path $buildDir 'tools\nsis'
  if (Test-Path -LiteralPath $nsisExtract) { Remove-Item -LiteralPath $nsisExtract -Recurse -Force }
  Expand-Archive -LiteralPath $nsisZipPath -DestinationPath $nsisExtract -Force
}
if (-not (Test-Path -LiteralPath $makensis)) {
  $alt = Join-Path $nsisDir 'Bin\makensis.exe'
  if (Test-Path -LiteralPath $alt) { $makensis = $alt } else { throw 'makensis.exe not found.' }
}

# Stage a clean production tree.
Write-Step 'Staging application files'
if (Test-Path -LiteralPath $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path `
  (Join-Path $stageDir 'runtime'), `
  (Join-Path $stageDir 'app'), `
  (Join-Path $stageDir 'scripts'), `
  (Join-Path $stageDir 'assets') | Out-Null

Copy-Item -LiteralPath (Join-Path $nodeExtractDir 'node.exe') -Destination (Join-Path $stageDir 'runtime\node.exe')
$nodeLicense = Join-Path $nodeExtractDir 'LICENSE'
if (Test-Path -LiteralPath $nodeLicense) {
  Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $stageDir 'runtime\LICENSE-node.txt')
}
Copy-Item -LiteralPath (Join-Path $root 'server') -Destination (Join-Path $stageDir 'app\server') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'dist') -Destination (Join-Path $stageDir 'app\dist') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'package.json') -Destination (Join-Path $stageDir 'app\package.json')
Copy-Item -LiteralPath (Join-Path $root 'package-lock.json') -Destination (Join-Path $stageDir 'app\package-lock.json')
Copy-Item -LiteralPath (Join-Path $windowsDir 'config\ClickUp.ps1') -Destination (Join-Path $stageDir 'scripts\ClickUp.ps1')
Copy-Item -LiteralPath (Join-Path $windowsDir 'config\console.cmd') -Destination (Join-Path $stageDir 'scripts\console.cmd')
Copy-Item -LiteralPath (Join-Path $windowsDir 'config\open.vbs') -Destination (Join-Path $stageDir 'scripts\open.vbs')
Copy-Item -LiteralPath (Join-Path $windowsDir 'config\start-hidden.vbs') -Destination (Join-Path $stageDir 'scripts\start-hidden.vbs')
Copy-Item -LiteralPath (Join-Path $windowsDir 'config\stop.vbs') -Destination (Join-Path $stageDir 'scripts\stop.vbs')
Copy-Item -LiteralPath (Join-Path $windowsDir 'config\README-Windows.txt') -Destination (Join-Path $stageDir 'README-Windows.txt')
Copy-Item -LiteralPath (Join-Path $windowsDir 'assets\clickup.ico') -Destination (Join-Path $stageDir 'assets\clickup.ico')

Write-Step 'Installing production dependencies'
Push-Location (Join-Path $stageDir 'app')
try {
  & npm.cmd ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Production dependency install failed.' }
} finally {
  Pop-Location
}

# Ensure scripts with non-ASCII text are UTF-8 with BOM for Windows PowerShell 5.1.
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
foreach ($file in @((Join-Path $stageDir 'scripts\ClickUp.ps1'))) {
  $text = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
  [System.IO.File]::WriteAllText($file, $text, $utf8Bom)
}

# Smoke check the bundled runtime.
$bundledVersion = & (Join-Path $stageDir 'runtime\node.exe') --version
if ($LASTEXITCODE -ne 0 -or -not $bundledVersion.StartsWith('v24.')) {
  throw "Bundled Node.js runtime failed: $bundledVersion"
}
Write-Host "  bundled runtime: $bundledVersion" -ForegroundColor DarkGray

# Compile NSIS installer.
Write-Step 'Compiling installer'
$nsiPath = Join-Path $windowsDir 'installer.nsi'
# NSIS reads UTF-8 scripts reliably with a BOM.
$nsiText = [System.IO.File]::ReadAllText($nsiPath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($nsiPath, $nsiText, $utf8Bom)

Push-Location $windowsDir
try {
  & $makensis "/DAPP_VERSION=$Version" "/DSTAGE=..\..\build\win\stage" "/DOUTFILE=..\..\release\ClickUp-Local-Setup-$Version.exe" 'installer.nsi'
  if ($LASTEXITCODE -ne 0) { throw 'NSIS compilation failed.' }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $outFile)) { throw "Installer was not created: $outFile" }
$hash = (Get-FileHash -LiteralPath $outFile -Algorithm SHA256).Hash.ToLower()
$sizeMb = [math]::Round((Get-Item -LiteralPath $outFile).Length / 1MB, 1)
@(
  "ClickUp Local Windows Installer"
  "Version: $Version"
  "File: $(Split-Path -Leaf $outFile)"
  "Size: $sizeMb MB"
  "SHA256: $hash"
  "Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
) | Set-Content -LiteralPath (Join-Path $releaseDir 'SHA256SUMS.txt') -Encoding ASCII

Write-Step 'Done'
Write-Host "  $outFile" -ForegroundColor Green
Write-Host "  size: $sizeMb MB" -ForegroundColor DarkGray
Write-Host "  sha256: $hash" -ForegroundColor DarkGray
