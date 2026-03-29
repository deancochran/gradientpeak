#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <script> [args...]" >&2
  exit 1
fi

node --experimental-strip-types "$@"
