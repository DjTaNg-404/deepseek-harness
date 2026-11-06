# DeepSeek Harness 启动器：先拉起 CodeBuddy 桥守护，再启动 dsh web。
# 仓库根默认是脚本上两级（local/codebuddy/ ），可用 DSH_REPO 覆盖。
# 桥目录默认是仓库的同级 dsh-bridge，可用 DSH_BRIDGE_DIR 覆盖。

$ErrorActionPreference = 'Stop'

$repo = if ($env:DSH_REPO) { $env:DSH_REPO } else { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$node = (Get-Command node -ErrorAction Stop).Source
$port = 3080
$log  = Join-Path $env:TEMP 'dsh-web.log'
$err  = Join-Path $env:TEMP 'dsh-web.err.log'
$urlPattern = 'http://127\.0\.0\.1:' + $port + '/\?token=\S+'

if (-not $env:DSH_BRIDGE_DIR) {
    $env:DSH_BRIDGE_DIR = Join-Path (Split-Path $repo -Parent) 'dsh-bridge'
}
if (-not $env:CODEBUDDY_CWD) { $env:CODEBUDDY_CWD = $repo }
if (-not $env:BRIDGE_PORT) { $env:BRIDGE_PORT = '8000' }
$bridgePort = $env:BRIDGE_PORT
$bridgeHealth = "http://127.0.0.1:$bridgePort/health"

function Show-Message([string]$text, [string]$title = 'DeepSeek Harness') {
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction Stop
        [System.Windows.MessageBox]::Show($text, $title) | Out-Null
    } catch {
        Write-Host $text
    }
}

function Get-RunningUrl {
    if (-not (Test-Path $log)) { return $null }
    $hit = Select-String -Path $log -Pattern $urlPattern -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($hit) { return $hit.Matches[0].Value }
    return $null
}

# 1. 启动 CodeBuddy 桥守护（失败不阻塞 dsh；模型选择器里会显示该路由但请求会报错）
$supervisor = Join-Path $PSScriptRoot 'supervisor.mjs'
$bridgeLog  = Join-Path $env:TEMP 'dsh-bridge-supervisor.log'
$bridgeErr  = Join-Path $env:TEMP 'dsh-bridge-supervisor.err.log'
$bridgeUp = $false
try { $bridgeUp = (Invoke-WebRequest -UseBasicParsing -Uri $bridgeHealth -TimeoutSec 2).StatusCode -eq 200 } catch { $bridgeUp = $false }

if (-not $bridgeUp -and (Test-Path $supervisor)) {
    Start-Process -FilePath $node `
        -ArgumentList $supervisor `
        -WorkingDirectory $PSScriptRoot `
        -RedirectStandardOutput $bridgeLog `
        -RedirectStandardError $bridgeErr `
        -WindowStyle Hidden | Out-Null
}

# 2. 已在运行 -> 直接打开页面
$existing = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($existing) {
    $url = Get-RunningUrl
    if (-not $url) { $url = "http://127.0.0.1:$port/" }
    Start-Process $url
    exit 0
}

# 3. 启动服务（隐藏窗口，日志写入 %TEMP%）
Remove-Item $log, $err -ErrorAction SilentlyContinue

Start-Process -FilePath $node `
    -ArgumentList '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--no-open' `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $log `
    -RedirectStandardError $err `
    -WindowStyle Hidden | Out-Null

# 4. 等待服务就绪（最多 90 秒）
$url = $null
for ($i = 0; $i -lt 180; $i++) {
    Start-Sleep -Milliseconds 500
    $url = Get-RunningUrl
    if ($url) { break }
    if (Test-Path $err) {
        $e = Get-Content $err -Raw -ErrorAction SilentlyContinue
        if ($e -and $e -match 'Error|error:') { break }
    }
}

if (-not $url) {
    $detail = ''
    if (Test-Path $err) { $detail = (Get-Content $err -Tail 15) -join "`n" }
    Show-Message "启动失败，请检查是否已执行过 pnpm install / pnpm run build。`n`n仓库：$repo`n日志：$err`n$detail"
    exit 1
}

Start-Process $url

# 5. 桥就绪检查（最多 45 秒）。失败只提示，不影响 dsh 使用 deepseek 模型。
$bridgeOk = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        if ((Invoke-WebRequest -UseBasicParsing -Uri $bridgeHealth -TimeoutSec 2).StatusCode -eq 200) {
            $bridgeOk = $true; break
        }
    } catch { }
    Start-Sleep -Milliseconds 500
}

if (-not $bridgeOk) {
    $detail = ''
    if (Test-Path $bridgeLog) { $detail = (Get-Content $bridgeLog -Tail 12) -join "`n" }
    Show-Message ("CodeBuddy 桥未就绪（dsh 本身可正常使用 deepseek 模型）。`n`n" +
        "首次使用请先在终端运行 codebuddy 完成一次登录，再重启 dsh。`n`n" +
        "桥目录：$env:DSH_BRIDGE_DIR`n日志：$bridgeLog`n$detail")
}
