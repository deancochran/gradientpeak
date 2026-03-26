#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

pids=()

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

wait_for_port() {
  python - "$1" "$2" "$3" <<'PY'
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
        print(f"[dev-e2e] {label} ready on {host}:{port}")
        sys.exit(0)
    except OSError:
        time.sleep(1)
    finally:
        sock.close()

print(f"[dev-e2e] ERROR: timed out waiting for {label} on {host}:{port}", file=sys.stderr)
sys.exit(1)
PY
}

cleanup() {
  local pid

  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

pnpm run self-host:up
wait_for_port 127.0.0.1 54321 supabase
node ./apps/mobile/scripts/seed-e2e-users.mjs

if ! port_is_open 127.0.0.1 3100; then
  pnpm run dev:e2e:web &
  pids+=("$!")
fi

if ! port_is_open 127.0.0.1 8082; then
  pnpm run dev:e2e:mobile &
  pids+=("$!")
fi

if [ "${#pids[@]}" -eq 0 ]; then
  echo "[dev-e2e] E2E web and mobile servers already running"
  tail -f /dev/null
fi

wait -n "${pids[@]}"
