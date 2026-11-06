# DeepSeek Harness 停止器：先停 CodeBuddy 桥守护及其子进程，再停 dsh web。
# 端口默认 3080，可用 DSH_WEB_PORT 覆盖。

$ErrorActionPreference = 'Stop'
$port = if ($env:DSH_WEB_PORT) { [int]$env:DSH_WEB_PORT } else { 3080 }

function Show-Message([string]$text, [string]$title = 'DeepSeek Harness') {
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction Stop
        [System.Windows.MessageBox]::Show($text, $title) | Out-Null
    } catch {
        Write-Host $text
    }
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$supervisor = Join-Path $PSScriptRoot 'supervisor.mjs'

# 先停 CodeBuddy 桥：守护会连带结束 codebuddy serve 与 bridge.py，避免留下孤儿进程。
if ($node -and (Test-Path $supervisor)) {
    try { & $node $supervisor --stop 2>&1 | Out-Null } catch { }
}

$conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if (-not $conn) {
    Show-Message "DeepSeek Harness 当前没有在运行。"
    exit 0
}

foreach ($procId in ($conn.OwningProcess | Sort-Object -Unique)) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
    if ($p -and $p.CommandLine -match 'bin\.ts') {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    } elseif ($p) {
        Show-Message "端口 $port 被其他程序占用（PID $procId），未执行关闭。"
        exit 1
    }
}

Start-Sleep -Seconds 2
if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
    Show-Message "关闭失败，请手动结束占用端口 $port 的进程。"
    exit 1
}

Show-Message "DeepSeek Harness 已关闭。"
