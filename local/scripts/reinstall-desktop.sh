#!/usr/bin/env bash
# 重新打包桌面端（macOS arm64，unsigned）。
#   --stage    只打包到构建目录，不动正在运行的 App（默认；适合边开发边打包）
#   --install  打包后退出 App、替换 /Applications 里的副本并重新打开
# 可用 DSH_REPO 覆盖仓库根目录。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${DSH_REPO:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
MODE="${1:---stage}"
APP_DST="/Applications/DeepSeek Harness.app"
APP_SRC="$REPO/apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/mac-arm64/DeepSeek Harness.app"
PROCESS_MATCH="DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness"

note() { printf '%s\n' "$*"; }
die() { printf 'reinstall-desktop: %s\n' "$*" >&2; exit 1; }

case "$MODE" in
  --stage|--install) ;;
  -h|--help) note "用法: $0 [--stage|--install]"; exit 0 ;;
  *) die "用法: $0 [--stage|--install]" ;;
esac

[ -d "$REPO/apps/desktop" ] || die "仓库路径不对：$REPO"

cd "$REPO"
note "① 打包桌面端（含一次本地构建，约 5-10 分钟）..."
pnpm run package:desktop:mac:arm64:dir
[ -d "$APP_SRC" ] || die "没有产出 App：$APP_SRC"

if [ "$MODE" = "--stage" ]; then
  note "② 仅打包完成，未改动正在运行的 App："
  note "   $APP_SRC"
  note "   需要安装时再运行：$0 --install"
  exit 0
fi

note "② 退出正在运行的 App（当前会话会随之重启，历史会保留）..."
osascript -e 'quit app "DeepSeek Harness"' >/dev/null 2>&1 || true
for _ in $(seq 1 40); do
  pgrep -f "$PROCESS_MATCH" >/dev/null 2>&1 || break
  sleep 0.5
done
pgrep -f "$PROCESS_MATCH" >/dev/null 2>&1 && die "App 还在运行，请手动退出后重试"

note "③ 替换 /Applications 里的副本..."
rm -rf "$APP_DST"
ditto "$APP_SRC" "$APP_DST"

note "④ 重新打开..."
open "$APP_DST"
note "完成：$APP_DST"
