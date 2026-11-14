# 把 local\plugins\quick-ask 装进 dsh 的 web profile（Windows）。
# profile 默认 web，可用 DSH_PROFILE 覆盖。

$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
$repo = if ($env:DSH_REPO) { $env:DSH_REPO } else { (Resolve-Path (Join-Path $scriptDir '..\..')).Path }
$profileName = if ($env:DSH_PROFILE) { $env:DSH_PROFILE } else { 'web' }
$plugin = Join-Path $repo 'local\plugins\quick-ask'

function Fail([string]$text) { Write-Host "install-quick-ask: $text" -ForegroundColor Red; exit 1 }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail '没有找到 node，请先安装 Node.js >= 24.9' }
if (-not (Test-Path (Join-Path $repo 'apps\cli\src\bin.ts'))) { Fail "这不像 dsh 仓库根：$repo（用 DSH_REPO 指定正确的目录）" }
if (-not (Test-Path (Join-Path $repo 'node_modules'))) { Fail "仓库还没装依赖：先执行 cd `"$repo`" ; pnpm install" }
if (-not (Test-Path (Join-Path $plugin 'package.json'))) { Fail "插件目录不存在或缺少 package.json：$plugin" }

Push-Location $repo
try {
    Write-Host "把 quick-ask 装进 profile `"$profileName`"：$plugin"
    node --import tsx/esm apps/cli/src/bin.ts plugin --profile $profileName add $plugin
    if ($LASTEXITCODE -ne 0) { Fail 'dsh plugin add 失败，看上面的 pnpm 输出。' }

    $dump = node --import tsx/esm apps/cli/src/bin.ts --profile $profileName --dump-config 2>$null
    if ($dump -match 'quick-ask') {
        Write-Host "校验通过：profile `"$profileName`" 的组合树里已经有 quick-ask。"
    } else {
        Write-Host '警告：组合树里没看到 quick-ask。改用 GUI 的 Plugins → 安装 → 绝对本地目录，指向下面这个路径：'
        Write-Host "  $plugin"
    }
} finally {
    Pop-Location
}

Write-Host ''
Write-Host '重启 dsh 让插件真正生效：'
Write-Host "  $(Join-Path $scriptDir 'dsh-stop.ps1') ; $(Join-Path $scriptDir 'dsh-start.ps1')"
Write-Host '验证：对话里划选一段文字 → 原生「引入文本」气泡右侧出现「追问」→ 点开提问 → 关掉，主线不该多出内容。'
