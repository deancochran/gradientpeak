#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "src/routers/__tests__/coach-athlete-goals.disposable.live-db.test.ts",
    "--config",
    "vitest.live-db.config.ts",
  ],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: process.env,
    stdio: "inherit",
  },
);
if (result.status !== 0)
  throw new Error(`coach athlete goals disposable test failed: ${result.status}`);
