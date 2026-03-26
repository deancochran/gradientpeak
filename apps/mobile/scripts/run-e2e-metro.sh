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

: "${EXPO_PUBLIC_API_URL:=http://127.0.0.1:3100}"
: "${EXPO_PUBLIC_SUPABASE_URL:=http://127.0.0.1:54321}"
: "${EXPO_PACKAGER_PROXY_URL:=http://127.0.0.1:8082}"
: "${REACT_NATIVE_PACKAGER_HOSTNAME:=127.0.0.1}"
: "${EXPO_PUBLIC_APP_URL:=http://127.0.0.1:3100}"
: "${EXPO_PUBLIC_REDIRECT_URI:=gradientpeak://integrations}"

resolve_publishable_key() {
  local status_output=""
  local key=""

  if ! status_output="$(pnpm --dir "$REPO_ROOT" --filter @repo/supabase exec supabase status -o env 2>/dev/null)"; then
    return 1
  fi

  key="$(printf '%s\n' "$status_output" | while IFS='=' read -r name value; do
    if [ "$name" = "PUBLISHABLE_KEY" ]; then
      printf '%s' "$value" | tr -d '"'
      break
    fi
  done)"

  if [ -z "$key" ]; then
    return 1
  fi

  printf '%s' "$key"
}

if [ -z "${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  if EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(resolve_publishable_key)"; then
    export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  else
    cat >&2 <<'EOF'
[mobile-e2e] ERROR: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.

Start local Supabase with `pnpm self-host:up`, or add the key to `apps/mobile/.env.e2e`.
EOF
    exit 1
  fi
fi

export EXPO_PUBLIC_API_URL
export EXPO_PUBLIC_SUPABASE_URL
export EXPO_PACKAGER_PROXY_URL
export REACT_NATIVE_PACKAGER_HOSTNAME
export EXPO_PUBLIC_APP_URL
export EXPO_PUBLIC_REDIRECT_URI
export EXPO_NO_DOTENV=1

if [ "${1:-}" = "print-env" ]; then
  printf 'EXPO_PUBLIC_API_URL=%s\n' "$EXPO_PUBLIC_API_URL"
  printf 'EXPO_PUBLIC_SUPABASE_URL=%s\n' "$EXPO_PUBLIC_SUPABASE_URL"
  printf 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%s\n' "$EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  printf 'EXPO_PACKAGER_PROXY_URL=%s\n' "$EXPO_PACKAGER_PROXY_URL"
  printf 'REACT_NATIVE_PACKAGER_HOSTNAME=%s\n' "$REACT_NATIVE_PACKAGER_HOSTNAME"
  printf 'EXPO_PUBLIC_APP_URL=%s\n' "$EXPO_PUBLIC_APP_URL"
  printf 'EXPO_PUBLIC_REDIRECT_URI=%s\n' "$EXPO_PUBLIC_REDIRECT_URI"
  exit 0
fi

printf '[mobile-e2e] Metro API %s\n' "$EXPO_PUBLIC_API_URL"
printf '[mobile-e2e] Metro Supabase %s\n' "$EXPO_PUBLIC_SUPABASE_URL"
printf '[mobile-e2e] Metro packager %s\n' "$EXPO_PACKAGER_PROXY_URL"

exec pnpm exec expo start -c --localhost --dev-client --port 8082
