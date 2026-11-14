# DeepSeek Harness 启动器（Windows）：后台起 dsh web，日志落盘，就绪后开浏览器。
# 本脚本在 local\scripts\ 下：仓库根默认是脚本上两级，可用 DSH_REPO 覆盖。
# 端口默认 3080，可用 DSH_PORT 覆盖；日志与 pid 落在 $DSH_HOME（默认 %USERPROFILE%\.dsh）。

$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
$repo = if ($env:DSH_REPO) { $env:DSH_REPO } else { (Resolve-Path (Join-Path $scriptDir '..\..')).Path }
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$port = if ($env:DSH_PORT) { $env:DSH_PORT } else { 3080 }
$logDir = Join-Path $dshHome 'logs'
$runDir = Join-Path $dshHome 'run'
$log = Join-Path $logDir 'dsh-web.log'
$err = Join-Path $logDir 'dsh-web.err.log'
$pidFile = Join-Path $runDir 'dsh-web.pid'
$urlPattern = 'http://[^\s]*:' + $port + '/\?token=\S+'

function Fail([string]$text) { Write-Host "dsh-start: $text" -ForegroundColor Red; exit 1 }

function Get-RunningUrl {
    if (-not (Test-Path $log)) { return $null }
    $hit = Select-String -Path $log -Pattern $urlPattern -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($hit) { return $hit.Matches[0].Value }
    return $null
}

# 1. 前置检查
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Fail '没有找到 node，请先安装 Node.js >= 24.9' }
node -e 'const need=[24,9,0],cur=process.versions.node.split(".").map(Number);for(let i=0;i<3;i++){if(cur[i]>need[i])process.exit(0);if(cur[i]<need[i])process.exit(1)}process.exit(0)'
if ($LASTEXITCODE -ne 0) { Fail ("node 版本过低（" + (node -v) + "），本仓库要求 >= 24.9") }

if (-not (Test-Path (Join-Path $repo 'apps\cli\src\bin.ts'))) { Fail "这不像 dsh 仓库根：$repo（用 DSH_REPO 指定正确的目录）" }
if (-not (Test-Path (Join-Path $repo 'node_modules'))) { Fail "仓库还没装依赖：先执行 cd `"$repo`" ; pnpm install" }

# 2. 已经在跑就直接开页面
if (Test-Path $pidFile) {
    $existingPid = "$(Get-Content $pidFile -Raw -ErrorAction SilentlyContinue)".Trim()
    $proc = if ($existingPid) { Get-Process -Id $existingPid -ErrorAction SilentlyContinue } else { $null }
    if ($proc) {
        $url = Get-RunningUrl
        if (-not $url) { $url = "http://127.0.0.1:$port/" }
        Write-Host "dsh 已在运行（pid $existingPid），直接打开：$url"
        Start-Process $url
        exit 0
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

$busy = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($busy) {
    $url = Get-RunningUrl
    if (-not $url) { $url = "http://127.0.0.1:$port/" }
    Write-Host "端口 $port 已被别的进程占用（不是本脚本启动的），直接打开：$url"
    Start-Process $url
    exit 0
}

# 3. 后台启动
New-Item -ItemType Directory -Force -Path $logDir, $runDir | Out-Null
Remove-Item $log, $err -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath $nodeCmd.Source `
    -ArgumentList '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--no-open', '--port', "$port" `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $log `
    -RedirectStandardError $err `
    -WindowStyle Hidden -PassThru

Set-Content -Path $pidFile -Value $proc.Id -NoNewline

# 4. 等它打印带 token 的地址（最多 120 秒）
$url = $null
for ($i = 0; $i -lt 240; $i++) {
    Start-Sleep -Milliseconds 500
    $url = Get-RunningUrl
    if ($url) { break }
    if ($proc.HasExited) { break }
}

if (-not $url) {
    Write-Host 'dsh-start: 启动失败，120 秒内没拿到带 token 的地址。' -ForegroundColor Red
    if (Test-Path $err) { Write-Host "--- $err ---"; Get-Content $err -Tail 20 }
    if (Test-Path $log) { Write-Host "--- $log ---"; Get-Content $log -Tail 20 }
    exit 1
}

Start-Process $url
Write-Host "dsh 已启动：$url"
Write-Host "日志：$log"
Write-Host "停止：$(Join-Path $scriptDir 'dsh-stop.ps1')"
