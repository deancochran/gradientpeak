#!/usr/bin/env bash
set -euo pipefail

pnpm exec concurrently \
  "tsc --noEmit --watch --preserveWatchOutput" \
  "chokidar '**/*.{ts,tsx,js,jsx,json}' -c 'biome lint .'"
