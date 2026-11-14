#!/usr/bin/env bash
# 停止由 dsh-start.sh 启动的 dsh web（macOS / Linux）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PORT="${DSH_PORT:-3080}"
PID_FILE="$DSH_HOME/run/dsh-web.pid"

note() { printf '%s\n' "$*"; }

alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# tsx 会拉起子进程，先收子进程再收自己；5 秒不退就强杀。
stop_tree() {
  local pid="$1"
  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 10); do
    alive "$pid" || return 0
    sleep 0.5
  done
  pkill -KILL -P "$pid" 2>/dev/null || true
  kill -KILL "$pid" 2>/dev/null || true
  return 0
}

STOPPED=0

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if alive "$PID"; then
    stop_tree "$PID"
    note "已停止 dsh web（pid $PID）"
    STOPPED=1
  fi
  rm -f "$PID_FILE"
fi

# pid 文件丢了也兜底：谁占着端口就收谁
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    for one in $PIDS; do
      stop_tree "$one"
      note "已停止占用 $PORT 端口的进程（pid $one）"
      STOPPED=1
    done
  fi
fi

if [ "$STOPPED" -eq 0 ]; then
  note "没有运行中的 dsh web（端口 $PORT 空闲）。"
fi
