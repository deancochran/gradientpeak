#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SUPABASE_DIR="$ROOT_DIR/packages/db/supabase"

require_port() {
  local host="$1"
  local port="$2"
  local label="$3"

  python - "$host" "$port" "$label" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
label = sys.argv[3]

sock = socket.socket()
sock.settimeout(0.5)

try:
    sock.connect((host, port))
except OSError:
    print(
        f"[test-e2e] ERROR: {label} is not running on {host}:{port}. Start `pnpm run dev:e2e` first.",
        file=sys.stderr,
    )
    sys.exit(1)
finally:
    sock.close()

print(f"[test-e2e] {label} ready on {host}:{port}")
PY
}

resolve_preferred_port() {
  local host="$1"
  local label="$2"
  shift 2

  for port in "$@"; do
    if python - "$host" "$port" <<'PY'
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
    then
      printf '%s' "$port"
      return 0
    fi
  done

  echo "[test-e2e] ERROR: ${label} is not running on any of: $*" >&2
  return 1
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

cd "$ROOT_DIR"

require_port 127.0.0.1 54321 supabase
WEB_PORT="$(resolve_preferred_port 127.0.0.1 web 3000)"
METRO_PORT="$(resolve_preferred_port 127.0.0.1 metro 8081)"

echo "[test-e2e] web ready on 127.0.0.1:${WEB_PORT}"
echo "[test-e2e] metro ready on 127.0.0.1:${METRO_PORT}"

pnpm --filter mobile android:boot
GP_ANDROID_INSTALL_PROFILE=e2e pnpm --filter mobile android:install
pnpm --filter mobile android:launch

export PORT="$WEB_PORT"
export NEXT_PUBLIC_APP_URL="http://127.0.0.1:${WEB_PORT}"
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI=gradientpeak://sign-in
export NEXT_PUBLIC_MOBILE_REDIRECT_URI=gradientpeak://integrations
export NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK=gradientpeak://integrations

SUPABASE_ENV="$(cd "$SUPABASE_DIR" && supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(extract_supabase_value "$SUPABASE_ENV" PUBLISHABLE_KEY)"
export NEXT_PRIVATE_SUPABASE_SECRET_KEY="$(extract_supabase_value "$SUPABASE_ENV" SERVICE_ROLE_KEY)"
export SUPABASE_SERVICE_ROLE_KEY="$NEXT_PRIVATE_SUPABASE_SECRET_KEY"

pnpm --filter web test:e2e
pnpm --filter mobile test:e2e
