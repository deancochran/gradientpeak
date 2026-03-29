#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 <host> <port> <label> [attempts]" >&2
  exit 1
fi

HOST="$1"
PORT="$2"
LABEL="$3"
ATTEMPTS="${4:-180}"

python - "$HOST" "$PORT" "$LABEL" "$ATTEMPTS" <<'PY'
import socket
import sys
import time

host = sys.argv[1]
port = int(sys.argv[2])
label = sys.argv[3]
attempts = int(sys.argv[4])

for _ in range(attempts):
    sock = socket.socket()
    sock.settimeout(0.5)
    try:
        sock.connect((host, port))
        print(f"[wait-for-port] {label} ready on {host}:{port}")
        sys.exit(0)
    except OSError:
        time.sleep(1)
    finally:
        sock.close()

print(f"[wait-for-port] ERROR: timed out waiting for {label} on {host}:{port}", file=sys.stderr)
sys.exit(1)
PY
