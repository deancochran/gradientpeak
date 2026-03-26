#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

pids=()

cleanup() {
  local pid

  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local label="$3"

  python - "$host" "$port" "$label" <<'PY'
import socket
import sys
import time

host = sys.argv[1]
port = int(sys.argv[2])
label = sys.argv[3]

for _ in range(180):
    sock = socket.socket()
    sock.settimeout(0.5)
    try:
        sock.connect((host, port))
        print(f"[test-e2e] {label} ready on {host}:{port}")
        sys.exit(0)
    except OSError:
        time.sleep(1)
    finally:
        sock.close()

print(f"[test-e2e] ERROR: timed out waiting for {label} on {host}:{port}", file=sys.stderr)
sys.exit(1)
PY
}

port_is_open() {
  python - "$1" "$2" <<'PY'
import socket
import sys

sock = socket.socket()
sock.settimeout(0.5)

try:
    sock.connect((sys.argv[1], int(sys.argv[2])))
except OSError:
    sys.exit(1)
finally:
    sock.close()

sys.exit(0)
PY
}

extract_supabase_value() {
  local source_text="$1"
  local target_name="$2"

  python - "$source_text" "$target_name" <<'PY'
import sys

source_text = sys.argv[1]
target_name = sys.argv[2]

for raw in source_text.splitlines():
    if raw.startswith(f"{target_name}="):
        print(raw.split("=", 1)[1].strip().strip('"'))
        break
PY
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

pnpm run self-host:up
wait_for_port 127.0.0.1 54321 supabase
node ./apps/mobile/scripts/seed-e2e-users.mjs

if ! port_is_open 127.0.0.1 3100; then
  pnpm run dev:e2e:web > /tmp/gradientpeak-web-e2e.log 2>&1 &
  pids+=("$!")
fi

if ! port_is_open 127.0.0.1 8082; then
  pnpm run dev:e2e:mobile > /tmp/gradientpeak-mobile-e2e.log 2>&1 &
  pids+=("$!")
fi

wait_for_port 127.0.0.1 3100 web-e2e
wait_for_port 127.0.0.1 8082 metro-e2e

pnpm --filter mobile android:boot
pnpm --filter mobile android:install

export PORT=3100
export NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI=gradientpeak://sign-in
export NEXT_PUBLIC_MOBILE_REDIRECT_URI=gradientpeak://integrations
export NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK=gradientpeak://integrations

SUPABASE_ENV="$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(extract_supabase_value "$SUPABASE_ENV" PUBLISHABLE_KEY)"
export NEXT_PRIVATE_SUPABASE_SECRET_KEY="$(extract_supabase_value "$SUPABASE_ENV" SERVICE_ROLE_KEY)"
export SUPABASE_SERVICE_ROLE_KEY="$NEXT_PRIVATE_SUPABASE_SECRET_KEY"

pnpm --filter web test:e2e
pnpm --filter mobile test:e2e
