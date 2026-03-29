#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

kill_port() {
  local port="$1"
  local pids=""

  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"

  if [ -z "$pids" ]; then
    pids="$(fuser "${port}/tcp" 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$' || true)"
  fi

  if [ -z "$pids" ]; then
    return 0
  fi

  echo "[dev-clean] stopping processes on port $port: $pids"
  kill $pids 2>/dev/null || true
  fuser -k "${port}/tcp" >/dev/null 2>&1 || true

  for _ in $(seq 1 10); do
    sleep 1
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    if [ -z "$pids" ]; then
      return 0
    fi
  done

  echo "[dev-clean] force stopping processes on port $port: $pids"
  kill -9 $pids 2>/dev/null || true
  fuser -k -9 "${port}/tcp" >/dev/null 2>&1 || true

  sleep 1
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    pids="$(fuser "${port}/tcp" 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$' || true)"
  fi
  if [ -n "$pids" ]; then
    echo "[dev-clean] ERROR: port $port is still in use: $pids" >&2
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || true
    ss -ltnp "( sport = :$port )" >&2 || true
    exit 1
  fi
}

for port in 3000 3100 8081 8082; do
  kill_port "$port"
done

cd "$ROOT_DIR"
pnpm run self-host:down >/dev/null 2>&1 || true

echo "[dev-clean] local web/mobile dev servers and Supabase stopped"
