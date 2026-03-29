#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

EXPO_PUBLIC_STORYBOOK_ENABLED=1 pnpm exec "$@"
