#!/usr/bin/env bash
set -euo pipefail

resolve_serial() {
  adb devices | while read -r serial state; do
    if [[ "$serial" == emulator-* && "$state" == device ]]; then
      printf '%s' "$serial"
      break
    fi
  done
}

serial="${ANDROID_SERIAL:-$(resolve_serial)}"
if [ -z "$serial" ]; then
  echo "[maestro-prepare] ERROR: no Android emulator detected" >&2
  exit 1
fi

adb -s "$serial" shell pm clear com.deancochran.gradientpeak.dev >/dev/null 2>&1 || true

dump_ui() {
  adb -s "$serial" exec-out uiautomator dump /dev/tty 2>/dev/null
}

ui_contains() {
  local needle="$1"
  dump_ui | grep -Fq "$needle"
}

wait_for_ui() {
  local needle="$1"

  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if ui_contains "$needle"; then
      return 0
    fi
    sleep 1
  done

  return 1
}

app_content_visible() {
  ui_contains 'sign-in-screen' || ui_contains 'text="Welcome Back"' || ui_contains 'text="Discover"' || ui_contains 'text="Plan"'
}

dev_server_url="${EXPO_DEV_SERVER_URL:-http://localhost:8081}"
dev_server_row_label="${EXPO_DEV_SERVER_ROW_LABEL:-http://localhost:8081}"
maestro_device="${MAESTRO_DEVICE:-${serial}}"
dev_client_link="gradientpeak-dev://expo-development-client/?url=$(python - "$dev_server_url" <<'PY'
import sys
from urllib.parse import quote

print(quote(sys.argv[1], safe=""))
PY
)"

adb -s "$serial" reverse tcp:8081 tcp:8081 >/dev/null
adb -s "$serial" reverse tcp:3000 tcp:3000 >/dev/null
adb -s "$serial" reverse tcp:54321 tcp:54321 >/dev/null

adb -s "$serial" shell am start -W -a android.intent.action.VIEW -d "$dev_client_link" >/dev/null

if ! wait_for_ui 'text="Connected to:"' && ! wait_for_ui 'text="Continue"' && ! wait_for_ui 'sign-in-screen' && ! wait_for_ui 'text="Welcome Back"' && ! wait_for_ui 'text="Discover"'; then
  echo "[maestro-prepare] ERROR: Expo dev client did not become visible" >&2
  exit 1
fi

if ! maestro --device "$maestro_device" test \
  -e EXPO_DEV_SERVER_LABEL="$dev_server_row_label" \
  .maestro/flows/reusable/expo_dev_client_setup.yaml >/dev/null; then
  echo "[maestro-prepare] ERROR: Expo dev client setup flow failed" >&2
  exit 1
fi

for _ in 1 2 3 4 5 6 7 8; do
  sleep 2

  if app_content_visible; then
    echo "[maestro-prepare] App content is visible"
    exit 0
  fi

  if ui_contains "text=\"${dev_server_row_label}\"" || ui_contains 'text="GradientPeak Development"'; then
    maestro --device "$maestro_device" test \
      -e EXPO_DEV_SERVER_LABEL="$dev_server_row_label" \
      .maestro/flows/reusable/expo_dev_client_setup.yaml >/dev/null 2>&1 || true
  fi
done

echo "[maestro-prepare] ERROR: app content did not become visible after dev client launch" >&2
exit 1
