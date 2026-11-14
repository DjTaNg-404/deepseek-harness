#!/usr/bin/env bash
# 把 local/plugins/quick-ask 装进 dsh 的 web profile（macOS / Linux）。
# profile 默认 web，可用 DSH_PROFILE 覆盖。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${DSH_REPO:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
PROFILE="${DSH_PROFILE:-web}"
PLUGIN="$REPO/local/plugins/quick-ask"

die() { printf 'install-quick-ask: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*"; }

command -v node >/dev/null 2>&1 || die "没有找到 node，请先安装 Node.js >= 24.9"
[ -f "$REPO/apps/cli/src/bin.ts" ] || die "这不像 dsh 仓库根：$REPO（用 DSH_REPO 指定正确的目录）"
[ -d "$REPO/node_modules" ] || die "仓库还没装依赖：先执行 cd \"$REPO\" && pnpm install"
[ -f "$PLUGIN/package.json" ] || die "插件目录不存在或缺少 package.json：$PLUGIN"

cd "$REPO"

note "把 quick-ask 装进 profile \"$PROFILE\"：$PLUGIN"
node --import tsx/esm apps/cli/src/bin.ts plugin --profile "$PROFILE" add "$PLUGIN"

# 装完核一遍：组合出来的配置树里应该出现 quick-ask
if node --import tsx/esm apps/cli/src/bin.ts --profile "$PROFILE" --dump-config 2>/dev/null \
  | grep -q 'quick-ask'; then
  note "校验通过：profile \"$PROFILE\" 的组合树里已经有 quick-ask。"
else
  note "警告：组合树里没看到 quick-ask。改用 GUI 的 Plugins → 安装 → 绝对本地目录，指向下面这个路径："
  note "  $PLUGIN"
fi

note ""
note "重启 dsh 让插件真正生效（安装当下是热生效，重启才算持久）："
note "  \"$SCRIPT_DIR/dsh-stop.sh\" && \"$SCRIPT_DIR/dsh-start.sh\""
note "验证：对话里划选一段文字 → 原生「引入文本」气泡右侧出现「追问」→ 点开提问 → 关掉，主线不该多出内容。"
