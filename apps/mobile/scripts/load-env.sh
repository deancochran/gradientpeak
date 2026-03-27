#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-}"

if [ -z "$env_file" ]; then
  echo "usage: $0 <env-file> [command ...]" >&2
  exit 1
fi

shift

if [ -f "$env_file" ]; then
  while IFS='=' read -r key value; do
    [ -z "$key" ] && continue
    case "$key" in
      \#*) continue ;;
    esac
    export "$key=$value"
  done < "$env_file"
fi

if [ "$env_file" = ".env.e2e" ] || [ "$env_file" = "./.env.e2e" ]; then
  export EXPO_PUBLIC_MAESTRO_E2E=1
fi

exec "$@"
