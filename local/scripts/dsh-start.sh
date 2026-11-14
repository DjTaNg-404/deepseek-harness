#!/usr/bin/env bash
# 启动 DeepSeek Harness 的 web 界面（macOS / Linux）。
# 本脚本在 local/scripts/ 下：仓库根默认是脚本上两级，可用 DSH_REPO 覆盖。
# 端口默认 3080，可用 DSH_PORT 覆盖；日志与 pid 落在 $DSH_HOME（默认 ~/.dsh）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${DSH_REPO:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PORT="${DSH_PORT:-3080}"
LOG_DIR="$DSH_HOME/logs"
RUN_DIR="$DSH_HOME/run"
LOG="$LOG_DIR/dsh-web.log"
ERR="$LOG_DIR/dsh-web.err.log"
PID_FILE="$RUN_DIR/dsh-web.pid"

die() { printf 'dsh-start: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*"; }

open_url() {
  if command -v open >/dev/null 2>&1; then
    open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1 || note "请手动打开：$1"
  else
    note "请手动打开：$1"
  fi
}

url_from_log() {
  [ -s "$LOG" ] || return 1
  grep -oE "http://[^[:space:]]*:${PORT}/\?token=[^[:space:]]+" "$LOG" | tail -n 1
}

pid_alive() {
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

# 1. 前置检查：node 版本、依赖是否装过
command -v node >/dev/null 2>&1 || die "没有找到 node，请先安装 Node.js >= 24.9"
node -e '
const need = [24, 9, 0]
const cur = process.versions.node.split(".").map(Number)
for (let i = 0; i < 3; i += 1) {
  if (cur[i] > need[i]) process.exit(0)
  if (cur[i] < need[i]) process.exit(1)
}
process.exit(0)
' || die "node 版本过低（$(node -v)），本仓库要求 >= 24.9。升级后重开终端再试。"

[ -f "$REPO/apps/cli/src/bin.ts" ] || die "这不像 dsh 仓库根：$REPO（用 DSH_REPO 指定正确的目录）"
[ -d "$REPO/node_modules" ] || die "仓库还没装依赖：先执行 cd \"$REPO\" && pnpm install"

# 2. 已经在跑就直接开页面
if [ -f "$PID_FILE" ]; then
  EXISTING="$(cat "$PID_FILE" 2>/dev/null || true)"
  if pid_alive "$EXISTING"; then
    URL="$(url_from_log || true)"
    [ -n "$URL" ] || URL="http://127.0.0.1:$PORT/"
    note "dsh 已在运行（pid $EXISTING），直接打开：$URL"
    open_url "$URL"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  URL="$(url_from_log || true)"
  [ -n "$URL" ] || URL="http://127.0.0.1:$PORT/"
  note "端口 $PORT 已被别的进程占用（不是本脚本启动的），直接打开：$URL"
  note "要接管这个端口：先停掉它，再重跑本脚本。"
  open_url "$URL"
  exit 0
fi

# 3. 后台启动，日志落盘
mkdir -p "$LOG_DIR" "$RUN_DIR"
: > "$LOG"
: > "$ERR"

cd "$REPO"
nohup node --import tsx/esm apps/cli/src/bin.ts web --no-open --port "$PORT" >>"$LOG" 2>>"$ERR" &
PID=$!
printf '%s\n' "$PID" > "$PID_FILE"

# 4. 等它打印带 token 的地址（最多 120 秒）
URL=""
for _ in $(seq 1 240); do
  URL="$(url_from_log || true)"
  if [ -n "$URL" ]; then break; fi
  if ! pid_alive "$PID"; then break; fi
  sleep 0.5
done

if [ -z "$URL" ]; then
  printf 'dsh-start: 启动失败，120 秒内没拿到带 token 的地址。\n' >&2
  if [ -s "$ERR" ]; then
    printf '\n--- %s ---\n' "$ERR" >&2
    tail -n 20 "$ERR" >&2
  fi
  if [ -s "$LOG" ]; then
    printf '\n--- %s ---\n' "$LOG" >&2
    tail -n 20 "$LOG" >&2
  fi
  exit 1
fi

open_url "$URL"
note "dsh 已启动：$URL"
note "日志：$LOG"
note "停止：$SCRIPT_DIR/dsh-stop.sh"
