#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd -- "$APP_DIR/../.." && pwd)"
STAMP_DIR="$APP_DIR/.maestro/cache"
STAMP_FILE="$STAMP_DIR/android-install.stamp"
PACKAGE_NAME="com.deancochran.gradientpeak.dev"
E2E_APK_PATH="$APP_DIR/android/app/build/outputs/apk/release/app-release.apk"

resolve_serial() {
  adb devices | while read -r serial state; do
    if [[ "$serial" == emulator-* && "$state" == device ]]; then
      printf "%s" "$serial"
      break
    fi
  done
}

require_serial() {
  local serial="${ANDROID_SERIAL:-}"

  if [ -z "$serial" ]; then
    serial="$(resolve_serial)"
  fi

  if [ -z "${serial:-}" ]; then
    echo "[mobile-android] ERROR: no emulator detected" >&2
    exit 1
  fi

  printf "%s" "$serial"
}

ensure_port_reverse() {
  local serial="$1"

  adb -s "$serial" reverse tcp:8081 tcp:8081 >/dev/null
  adb -s "$serial" reverse tcp:3000 tcp:3000 >/dev/null
  adb -s "$serial" reverse tcp:3100 tcp:3100 >/dev/null
  adb -s "$serial" reverse tcp:54321 tcp:54321 >/dev/null
}

compute_install_fingerprint() {
  python - "$REPO_ROOT" <<'PY'
import hashlib
import pathlib
import sys

repo_root = pathlib.Path(sys.argv[1])
paths = [
    repo_root / "pnpm-lock.yaml",
    repo_root / "apps/mobile/package.json",
    repo_root / "apps/mobile/app.config.ts",
]
android_root = repo_root / "apps/mobile/android"

for path in sorted(android_root.rglob("*")):
    if not path.is_file():
        continue
    if "build" in path.parts:
        continue
    paths.append(path)

digest = hashlib.sha256()
for path in sorted(paths):
    relative = path.relative_to(repo_root).as_posix()
    digest.update(relative.encode("utf-8"))
    digest.update(b"\0")
    digest.update(path.read_bytes())
    digest.update(b"\0")

print(digest.hexdigest())
PY
}

is_app_installed() {
  local serial="$1"

  adb -s "$serial" shell pm path "$PACKAGE_NAME" >/dev/null 2>&1
}

is_install_current() {
  local serial="$1"
  local current_fingerprint="$2"

  if ! is_app_installed "$serial"; then
    return 1
  fi

  if [ ! -f "$STAMP_FILE" ]; then
    return 1
  fi

  local stamped_fingerprint
  stamped_fingerprint="$(tr -d '[:space:]' < "$STAMP_FILE")"
  [ -n "$stamped_fingerprint" ] && [ "$stamped_fingerprint" = "$current_fingerprint" ]
}

record_install_fingerprint() {
  local fingerprint="$1"

  mkdir -p "$STAMP_DIR"
  printf '%s\n' "$fingerprint" > "$STAMP_FILE"
}

boot_emulator() {
  local avd_name="${GP_ANDROID_AVD:-Pixel_8_API_35}"
  local emulator_bin="${ANDROID_HOME:-/opt/android-sdk}/emulator/emulator"
  local log_dir=".maestro"
  local serial="$(resolve_serial)"
  local boot=""

  mkdir -p "$log_dir"

  if [ -z "${serial:-}" ]; then
    nohup env ANDROID_EMULATOR_USE_SYSTEM_LIBS=1 "$emulator_bin" -avd "$avd_name" -no-window -gpu swiftshader_indirect -no-boot-anim -no-snapshot-save > "$log_dir/emulator.log" 2>&1 &
  fi

  for _ in $(seq 1 120); do
    serial="$(resolve_serial)"
    if [ -n "${serial:-}" ]; then
      break
    fi
    sleep 2
  done

  if [ -z "${serial:-}" ]; then
    echo "[mobile-android] ERROR: no emulator detected" >&2
    exit 1
  fi

  adb -s "$serial" wait-for-device >/dev/null

  for _ in $(seq 1 180); do
    boot="$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [ "$boot" = "1" ]; then
      break
    fi
    sleep 2
  done

  if [ "${boot:-}" != "1" ]; then
    echo "[mobile-android] ERROR: emulator boot timed out" >&2
    exit 1
  fi

  echo "[mobile-android] emulator ready: $serial"
}

install_app() {
  local serial="$(require_serial)"
  local fingerprint="$(compute_install_fingerprint)"

  ensure_port_reverse "$serial"

  if [ "${FORCE_ANDROID_INSTALL:-0}" != "1" ] && is_install_current "$serial" "$fingerprint"; then
    echo "[mobile-android] app already installed and current on $serial; skipping install"
    return 0
  fi

  if [ "${GP_ANDROID_INSTALL_PROFILE:-dev}" = "e2e" ]; then
    EXPO_NO_DOTENV=1 \
    EXPO_PUBLIC_API_URL="http://127.0.0.1:3000" \
    EXPO_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" \
    EXPO_PUBLIC_APP_URL="http://127.0.0.1:3000" \
    EXPO_PUBLIC_REDIRECT_URI="gradientpeak://integrations" \
    ANDROID_SERIAL="$serial" \
    pnpm exec expo run:android --no-bundler
  else
    ANDROID_SERIAL="$serial" pnpm exec expo run:android --no-bundler
  fi
  record_install_fingerprint "$fingerprint"
}

build_e2e_apk() {
  CI=1 \
  EXPO_NO_DOTENV=1 \
  EXPO_PUBLIC_API_URL="http://127.0.0.1:3000" \
  EXPO_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" \
  EXPO_PUBLIC_APP_URL="http://127.0.0.1:3000" \
  EXPO_PUBLIC_REDIRECT_URI="gradientpeak://integrations" \
  pnpm exec expo prebuild --platform android

  EXPO_NO_DOTENV=1 \
  EXPO_PUBLIC_API_URL="http://127.0.0.1:3000" \
  EXPO_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" \
  EXPO_PUBLIC_APP_URL="http://127.0.0.1:3000" \
  EXPO_PUBLIC_REDIRECT_URI="gradientpeak://integrations" \
  "$APP_DIR/android/gradlew" -p "$APP_DIR/android" \
    -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g" \
    -PreactNativeArchitectures=x86_64 \
    :app:assembleRelease \
    -x lintVitalRelease \
    -x lintVitalAnalyzeRelease \
    -x lintVitalReportRelease
}

print_e2e_apk_path() {
  printf "%s\n" "$E2E_APK_PATH"
}

launch_app() {
  local serial="$(require_serial)"

  ensure_port_reverse "$serial"
  adb -s "$serial" shell monkey -p "$PACKAGE_NAME" 1
}

case "${1:-}" in
  boot)
    boot_emulator
    ;;
  install)
    install_app
    ;;
  build-e2e-apk)
    build_e2e_apk
    ;;
  print-e2e-apk-path)
    print_e2e_apk_path
    ;;
  install-force)
    FORCE_ANDROID_INSTALL=1 install_app
    ;;
  launch)
    launch_app
    ;;
  *)
    echo "Usage: $0 {boot|install|build-e2e-apk|print-e2e-apk-path|install-force|launch}" >&2
    exit 1
    ;;
esac
