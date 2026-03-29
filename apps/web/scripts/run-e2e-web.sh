#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/.env.e2e"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${PORT:=3000}"

if [ "${1:-}" = "print-env" ]; then
  printf 'PORT=%s\n' "$PORT"
  exit 0
fi

exec pnpm exec next dev --turbopack --hostname 127.0.0.1 --port "$PORT"
