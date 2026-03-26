#!/usr/bin/env bash
set -euo pipefail

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

  adb -s "$serial" reverse tcp:8081 tcp:8081 >/dev/null
  adb -s "$serial" reverse tcp:8082 tcp:8082 >/dev/null
  adb -s "$serial" reverse tcp:3000 tcp:3000 >/dev/null
  adb -s "$serial" reverse tcp:3100 tcp:3100 >/dev/null
  adb -s "$serial" reverse tcp:54321 tcp:54321 >/dev/null
  ANDROID_SERIAL="$serial" pnpm exec expo run:android
}

launch_app() {
  local serial="$(require_serial)"

  adb -s "$serial" reverse tcp:8081 tcp:8081 >/dev/null
  adb -s "$serial" reverse tcp:8082 tcp:8082 >/dev/null
  adb -s "$serial" reverse tcp:3000 tcp:3000 >/dev/null
  adb -s "$serial" reverse tcp:3100 tcp:3100 >/dev/null
  adb -s "$serial" reverse tcp:54321 tcp:54321 >/dev/null
  adb -s "$serial" shell monkey -p com.deancochran.gradientpeak.dev 1
}

case "${1:-}" in
  boot)
    boot_emulator
    ;;
  install)
    install_app
    ;;
  launch)
    launch_app
    ;;
  *)
    echo "Usage: $0 {boot|install|launch}" >&2
    exit 1
    ;;
esac
