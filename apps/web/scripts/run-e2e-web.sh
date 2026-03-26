#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd -- "$APP_DIR/../.." && pwd)"
ENV_FILE="$APP_DIR/.env.e2e"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${PORT:=3100}"
: "${NEXT_PUBLIC_APP_URL:=http://127.0.0.1:${PORT}}"
: "${NEXT_PUBLIC_SUPABASE_URL:=http://127.0.0.1:54321}"
: "${NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI:=gradientpeak://sign-in}"
: "${NEXT_PUBLIC_MOBILE_REDIRECT_URI:=gradientpeak://integrations}"
: "${NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK:=gradientpeak://integrations}"

resolve_supabase_value() {
  local target_name="$1"
  local status_output=""
  local value=""

  if ! status_output="$(supabase status -o env 2>/dev/null)"; then
    return 1
  fi

  value="$(printf '%s\n' "$status_output" | while IFS='=' read -r name raw; do
    if [ "$name" = "$target_name" ]; then
      printf '%s' "$raw" | tr -d '"'
      break
    fi
  done)"

  if [ -z "$value" ]; then
    return 1
  fi

  printf '%s' "$value"
}

if [ -z "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(resolve_supabase_value PUBLISHABLE_KEY)"
fi

if [ -z "${NEXT_PRIVATE_SUPABASE_SECRET_KEY:-}" ]; then
  NEXT_PRIVATE_SUPABASE_SECRET_KEY="$(resolve_supabase_value SERVICE_ROLE_KEY)"
fi

export PORT
export NEXT_PUBLIC_APP_URL
export NEXT_PUBLIC_SUPABASE_URL
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
export NEXT_PRIVATE_SUPABASE_SECRET_KEY
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$NEXT_PRIVATE_SUPABASE_SECRET_KEY}"
export NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI
export NEXT_PUBLIC_MOBILE_REDIRECT_URI
export NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK

if [ "${1:-}" = "print-env" ]; then
  printf 'PORT=%s\n' "$PORT"
  printf 'NEXT_PUBLIC_APP_URL=%s\n' "$NEXT_PUBLIC_APP_URL"
  printf 'NEXT_PUBLIC_SUPABASE_URL=%s\n' "$NEXT_PUBLIC_SUPABASE_URL"
  printf 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%s\n' "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  printf 'NEXT_PRIVATE_SUPABASE_SECRET_KEY=%s\n' "$NEXT_PRIVATE_SUPABASE_SECRET_KEY"
  exit 0
fi

printf '[web-e2e] Web URL %s\n' "$NEXT_PUBLIC_APP_URL"
printf '[web-e2e] Supabase URL %s\n' "$NEXT_PUBLIC_SUPABASE_URL"

exec pnpm exec next dev --turbopack --hostname 0.0.0.0 --port "$PORT"
