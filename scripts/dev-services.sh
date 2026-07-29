#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TOOL_PATH_PREFIX="$HOME/.local/bin:/opt/homebrew/bin"
export PATH="$TOOL_PATH_PREFIX:$PATH"

BACKEND_SESSION="pae-backend"
FRONTEND_SESSION="pae-frontend"

BACKEND_DIR="$ROOT_DIR/pa-eval-backend"
FRONTEND_DIR="$ROOT_DIR/pa-eval-frontend"

BACKEND_LOG="$BACKEND_DIR/.pae-backend.log"
FRONTEND_LOG="$FRONTEND_DIR/.pae-frontend.log"

BACKEND_PORT="8000"
FRONTEND_PORT="5173"

BACKEND_CMD="PATH=\"$TOOL_PATH_PREFIX:\$PATH\" uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
FRONTEND_CMD="PATH=\"$TOOL_PATH_PREFIX:\$PATH\" npm run dev -- --host 127.0.0.1"

usage() {
  cat <<'EOF'
Usage: scripts/dev-services.sh <command> [service]

Commands:
  start [all|backend|frontend]    Start services in detached screen sessions.
  stop [all|backend|frontend]     Stop detached screen sessions.
  restart [all|backend|frontend]  Restart detached screen sessions.
  status                          Show screen sessions and listening ports.
  logs [backend|frontend]         Tail a service log.

Examples:
  scripts/dev-services.sh start
  scripts/dev-services.sh restart frontend
  scripts/dev-services.sh logs backend
EOF
}

require_screen() {
  if ! command -v screen >/dev/null 2>&1; then
    echo "screen is required for long-running dev services." >&2
    exit 1
  fi
}

session_ids() {
  local session="$1"
  local sessions

  sessions="$(screen -ls 2>/dev/null || true)"
  awk -v session="$session" '
    $1 ~ "^[0-9]+\\." session "$" { print $1 }
  ' <<<"$sessions"
}

session_exists() {
  local session="$1"
  [[ -n "$(session_ids "$session")" ]]
}

port_listener_pids() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
}

stop_port_listeners() {
  local port="$1"
  local pids
  local remaining

  pids="$(port_listener_pids "$port")"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  kill $pids 2>/dev/null || true
  sleep 1

  remaining="$(port_listener_pids "$port")"
  if [[ -n "$remaining" ]]; then
    kill -9 $remaining 2>/dev/null || true
  fi

  echo "cleared listeners on port $port"
}

start_one() {
  local session="$1"
  local service_dir="$2"
  local log_file="$3"
  local service_cmd="$4"
  local port="$5"

  if session_exists "$session"; then
    echo "$session is already running."
    return 0
  fi

  if [[ -n "$(port_listener_pids "$port")" ]]; then
    echo "$session cannot start: port $port is already in use." >&2
    echo "Run scripts/dev-services.sh restart to reclaim managed ports." >&2
    return 1
  fi

  mkdir -p "$(dirname "$log_file")"
  : >"$log_file"

  PAE_SERVICE_DIR="$service_dir" \
    PAE_SERVICE_LOG="$log_file" \
    PAE_SERVICE_CMD="$service_cmd" \
    screen -dmS "$session" bash -lc \
      'cd "$PAE_SERVICE_DIR" && exec bash -lc "$PAE_SERVICE_CMD" >> "$PAE_SERVICE_LOG" 2>&1'

  echo "started $session; log: $log_file"
}

stop_one() {
  local session="$1"
  local port="$2"
  local ids

  ids="$(session_ids "$session")"

  if [[ -n "$ids" ]]; then
    while IFS= read -r id; do
      [[ -z "$id" ]] && continue
      screen -S "$id" -X quit
    done <<<"$ids"
    echo "stopped $session"
  else
    echo "$session is not running."
  fi

  stop_port_listeners "$port"
}

start_services() {
  local service="${1:-all}"
  case "$service" in
    all)
      start_one "$BACKEND_SESSION" "$BACKEND_DIR" "$BACKEND_LOG" "$BACKEND_CMD" "$BACKEND_PORT"
      start_one "$FRONTEND_SESSION" "$FRONTEND_DIR" "$FRONTEND_LOG" "$FRONTEND_CMD" "$FRONTEND_PORT"
      ;;
    backend)
      start_one "$BACKEND_SESSION" "$BACKEND_DIR" "$BACKEND_LOG" "$BACKEND_CMD" "$BACKEND_PORT"
      ;;
    frontend)
      start_one "$FRONTEND_SESSION" "$FRONTEND_DIR" "$FRONTEND_LOG" "$FRONTEND_CMD" "$FRONTEND_PORT"
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

stop_services() {
  local service="${1:-all}"
  case "$service" in
    all)
      stop_one "$FRONTEND_SESSION" "$FRONTEND_PORT"
      stop_one "$BACKEND_SESSION" "$BACKEND_PORT"
      ;;
    backend)
      stop_one "$BACKEND_SESSION" "$BACKEND_PORT"
      ;;
    frontend)
      stop_one "$FRONTEND_SESSION" "$FRONTEND_PORT"
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

restart_services() {
  local service="${1:-all}"
  stop_services "$service"
  start_services "$service"
}

show_status() {
  echo "screen sessions:"
  screen -ls || true
  echo
  echo "listening ports:"
  lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(5173|8000)[[:space:]]' || true
}

tail_logs() {
  local service="${1:-}"
  case "$service" in
    backend)
      tail -f "$BACKEND_LOG"
      ;;
    frontend)
      tail -f "$FRONTEND_LOG"
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

main() {
  require_screen

  local command="${1:-}"
  local service="${2:-all}"

  case "$command" in
    start)
      start_services "$service"
      ;;
    stop)
      stop_services "$service"
      ;;
    restart)
      restart_services "$service"
      ;;
    status)
      show_status
      ;;
    logs)
      tail_logs "${2:-}"
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

main "$@"
