#!/usr/bin/env bash
set -euo pipefail

[ "${1:-}" = "--" ] && shift

fixtures_file=".maestro/fixtures.env"
if [ -f "$fixtures_file" ]; then
  while IFS='=' read -r key value; do
    [ -z "$key" ] && continue
    case "$key" in
      \#*) continue ;;
    esac
    if [ -z "${!key:-}" ]; then
      export "$key=$value"
    fi
  done < "$fixtures_file"
fi

dev_server_url="${EXPO_DEV_SERVER_URL:-http://localhost:8081}"
dev_server_label="${EXPO_DEV_SERVER_LABEL:-http://localhost:8081}"
dev_server_url_encoded="$(python - "$dev_server_url" <<'PY'
import sys
from urllib.parse import quote

print(quote(sys.argv[1], safe=""))
PY
)"

mkdir -p .maestro/home .maestro/cache .maestro/artifacts/debug .maestro/artifacts/test-output

export HOME="$PWD/.maestro/home"
export XDG_CACHE_HOME="$PWD/.maestro/cache"

exec maestro test \
  -e EXPO_DEV_SERVER_URL="$dev_server_url" \
  -e EXPO_DEV_SERVER_LABEL="$dev_server_label" \
  -e EXPO_DEV_SERVER_URL_ENCODED="$dev_server_url_encoded" \
  -e STANDARD_USER_EMAIL="${STANDARD_USER_EMAIL:-}" \
  -e STANDARD_USER_PASS="${STANDARD_USER_PASS:-}" \
  -e ONBOARDING_USER_EMAIL="${ONBOARDING_USER_EMAIL:-}" \
  -e ONBOARDING_USER_PASS="${ONBOARDING_USER_PASS:-}" \
  -e SIGNUP_PASSWORD="${SIGNUP_PASSWORD:-}" \
  -e TARGET_USERNAME="${TARGET_USERNAME:-}" \
  --debug-output .maestro/artifacts/debug \
  --test-output-dir .maestro/artifacts/test-output \
  "$@"
