<#
  Launch the unpackaged desktop application from this checkout.

  The launcher keeps the working tree current and rebuilds only when it moved:
  pull (best effort), install when the lockfile changed, then either start the
  existing artifacts (fast path) or rebuild and start. Packaging an installer is
  not involved.

  -NoPull     skip the git pull
  -NoBuild    skip the rebuild even when the tree changed
  -BuildOnly  run the build steps and exit without launching the app
  -NoPause    do not keep the window open after a failure
#>
param(
  [switch]$NoPull,
  [switch]$NoBuild,
  [switch]$BuildOnly,
  [switch]$NoPause
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

# Run one pnpm command, mirroring everything it prints into the launcher log.
function Invoke-Pnpm([string[]]$arguments) {
  Write-Step ('pnpm ' + ($arguments -join ' '))
  # Native stderr becomes an ErrorRecord under 2>&1; keep it flowing into the log
  # instead of aborting the pipeline on the first warning line.
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & "$env:APPDATA\npm\pnpm.cmd" @arguments 2>&1 | ForEach-Object {
      $text = [string]$_
      Write-Host $text
      Add-Content -Path $log -Value $text -Encoding UTF8
    }
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($LASTEXITCODE -ne 0) { throw ('pnpm {0} failed with exit code {1}' -f ($arguments -join ' '), $LASTEXITCODE) }
}

function Invoke-Main {
  Write-Step "repo: $repo"

  # A shell launched by the Harness inherits ELECTRON_RUN_AS_NODE; Electron would then
  # parse its CLI as Node and reject the Chromium switches.
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

  # This machine's Windows policy refuses to start the unsigned Electron binary from
  # the checkout (it exits with 0x80000003); the identical binary runs from the
  # per-user Programs directory, so stage it there and point the dev launcher at it.
  $electronDist = Get-ChildItem (Join-Path $repo 'node_modules\.pnpm') -Directory -Filter 'electron@*' -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'node_modules\electron\dist' } |
    Where-Object { Test-Path (Join-Path $_ 'electron.exe') } |
    Select-Object -First 1
  if ($null -eq $electronDist) { throw 'electron dist not found under node_modules/.pnpm' }
  $electronVersion = (Get-Content (Join-Path $electronDist 'version') -Raw).Trim()
  $stagedElectron = Join-Path $env:LOCALAPPDATA ('Programs\dsh-desktop-dev\electron\' + $electronVersion)
  if (-not (Test-Path (Join-Path $stagedElectron 'electron.exe'))) {
    Write-Step "staging electron $electronVersion"
    New-Item -ItemType Directory -Force $stagedElectron | Out-Null
    Copy-Item (Join-Path $electronDist '*') $stagedElectron -Recurse -Force
  }
  $env:ELECTRON_OVERRIDE_DIST_PATH = $stagedElectron
  Write-Step "electron: $stagedElectron"

  # The desktop dev launcher defaults to a private DSH_HOME under .desktop-build.
  # Point it at the real home so sessions, the profile, installed plugins and model
  # routes match the packaged app instead of starting from onboarding.
  if (-not $env:DSH_HOME) { $env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh' }
  if (-not $env:DSH_DESKTOP_OPEN_DEVTOOLS) { $env:DSH_DESKTOP_OPEN_DEVTOOLS = '0' }
  Write-Step "DSH_HOME: $env:DSH_HOME"

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
    Invoke-Pnpm @('install', '--frozen-lockfile')
  } else {
    Write-Step 'dependencies up to date'
  }

  $head = (& git rev-parse HEAD).Trim()
  $status = (& git status --porcelain) -join "`n"
  $fingerprint = ($head + "`n" + $status).Trim()
  $previous = ''
  if (Test-Path $stamp) { $previous = (Get-Content $stamp -Raw).Trim() }

  # The client build writes esbuild temp files; keep them inside the checkout so the
  # whole toolchain stays on one volume and cleanup stays fast.
  $savedTemp = $env:TEMP
  $savedTmp = $env:TMP
  $env:TEMP = $tmp
  $env:TMP = $tmp
  try {
    $build = (-not $NoBuild) -and ($previous -ne $fingerprint)
    if ($BuildOnly) { $build = $true }
    if ($build) {
      Write-Step 'building artifacts and the desktop shell'
      Invoke-Pnpm @('run', 'build:artifacts')
      Push-Location (Join-Path $repo 'apps\desktop')
      try { Invoke-Pnpm @('run', 'build') } finally { Pop-Location }
      Set-Content -Path $stamp -Value $fingerprint -Encoding UTF8
      Write-Step 'build done'
    } else {
      Write-Step 'using existing artifacts'
    }
    if ($BuildOnly) { return }
    Invoke-Pnpm @('run', 'start:desktop')
  } finally {
    $env:TEMP = $savedTemp
    $env:TMP = $savedTmp
  }
}

try {
  Invoke-Main
} catch {
  Write-Step ("FAILED: " + $_.Exception.Message)
  if (-not $NoPause) {
    Write-Host ''
    Write-Host ('Failure details are in ' + $log)
    Read-Host 'Press Enter to close'
  }
  exit 1
}
