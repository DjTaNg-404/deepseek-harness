# 停止由 dsh-start.ps1 启动的 dsh web（Windows）。
# 先收子进程再收父进程；5 秒不退就强杀。

$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$port = if ($env:DSH_PORT) { $env:DSH_PORT } else { 3080 }
$pidFile = Join-Path $dshHome 'run\dsh-web.pid'

$stopped = $false

function Stop-Tree([int]$processId) {
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $processId" -ErrorAction SilentlyContinue
    foreach ($child in $children) { Stop-Tree ([int]$child.ProcessId) }
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $proc) { return }
    try { $proc.CloseMainWindow() | Out-Null } catch { }
    if (-not $proc.WaitForExit(5000)) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }
}

if (Test-Path $pidFile) {
    $target = "$(Get-Content $pidFile -Raw -ErrorAction SilentlyContinue)".Trim()
    if ($target -and (Get-Process -Id $target -ErrorAction SilentlyContinue)) {
        Stop-Tree ([int]$target)
        Write-Host "已停止 dsh web（pid $target）"
        $stopped = $true
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# pid 文件丢了也兜底：谁占着端口就收谁
$holders = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
foreach ($one in $holders) {
    if ($one) {
        Stop-Tree ([int]$one)
        Write-Host "已停止占用 $port 端口的进程（pid $one）"
        $stopped = $true
    }
}

if (-not $stopped) { Write-Host "没有运行中的 dsh web（端口 $port 空闲）。" }
