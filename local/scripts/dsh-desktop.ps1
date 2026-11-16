<#
  Launch the unpackaged desktop application from this checkout.

  The launcher keeps the working tree current and rebuilds only when it moved:
  pull (best effort), install when the lockfile changed, then either start the
  existing artifacts (fast path) or rebuild and start through the desktop dev
  launcher. Packaging an installer is not involved.

  -NoPull     skip the git pull
  -NoBuild    skip the rebuild even when the tree changed
  -BuildOnly  run the build steps and exit without launching the app
#>
param(
  [switch]$NoPull,
  [switch]$NoBuild,
  [switch]$BuildOnly
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo

$tmp = Join-Path $repo '.tmp'
New-Item -ItemType Directory -Force $tmp | Out-Null
$log = Join-Path $tmp 'desktop-launch.log'
$stamp = Join-Path $tmp 'desktop-build.stamp'

function Write-Step([string]$message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $message
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

function Invoke-Pnpm([string[]]$arguments) {
  & "$env:APPDATA\npm\pnpm.cmd" @arguments
  if ($LASTEXITCODE -ne 0) { throw ('pnpm {0} failed with exit code {1}' -f ($arguments -join ' '), $LASTEXITCODE) }
}

Write-Step "repo: $repo"

if (-not $NoPull) {
  try {
    $pulled = & git pull --ff-only --no-rebase 2>&1
    foreach ($line in $pulled) { Write-Step ([string]$line) }
  } catch {
    Write-Step "git pull skipped: $($_.Exception.Message)"
  }
}

$modules = Join-Path $repo 'node_modules'
$lock = Join-Path $repo 'pnpm-lock.yaml'
$needsInstall = (-not (Test-Path $modules)) -or ((Get-Item $lock).LastWriteTime -gt (Get-Item $modules).LastWriteTime)
if ($needsInstall) {
  Write-Step 'installing dependencies'
  Invoke-Pnpm @('install', '--frozen-lockfile')
} else {
  Write-Step 'dependencies up to date'
}

$head = (& git rev-parse HEAD).Trim()
$status = (& git status --porcelain) -join "`n"
$fingerprint = $head + "`n" + $status
$previous = ''
if (Test-Path $stamp) { $previous = (Get-Content $stamp -Raw).Trim() }

# The client build writes esbuild temp files; keep them inside the checkout so the
# whole toolchain stays on one volume and cleanup stays fast.
$savedTemp = $env:TEMP
$savedTmp = $env:TMP
$env:TEMP = $tmp
$env:TMP = $tmp
try {
  if ($BuildOnly) {
    Write-Step 'build only: compiling artifacts and the desktop shell'
    Invoke-Pnpm @('run', 'build:artifacts')
    Push-Location (Join-Path $repo 'apps\desktop')
    try { Invoke-Pnpm @('run', 'build') } finally { Pop-Location }
    Set-Content -Path $stamp -Value $fingerprint -Encoding UTF8
    Write-Step 'build only: done'
    return
  }
  if ($NoBuild) {
    Write-Step 'rebuild skipped (-NoBuild)'
    Invoke-Pnpm @('run', 'start:desktop')
    return
  }
  if ($previous -eq $fingerprint.Trim()) {
    Write-Step 'tree unchanged since the last build; starting from existing artifacts'
    Invoke-Pnpm @('run', 'start:desktop')
    return
  }
  Write-Step 'tree changed; rebuilding and starting'
  Invoke-Pnpm @('run', 'dev:desktop')
  Set-Content -Path $stamp -Value $fingerprint -Encoding UTF8
} finally {
  $env:TEMP = $savedTemp
  $env:TMP = $savedTmp
}
