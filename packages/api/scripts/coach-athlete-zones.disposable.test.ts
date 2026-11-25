#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";

await withDisposableDatabase(process.argv.slice(2), "coach_athlete_zones", async (target, url) => {
  await bootstrapSupabaseSchemas(target);
  for (const path of requireFreshBaseline().migrationPaths) await applySqlFile(target, path);
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "src/application/athlete-intelligence/read-coach-athlete-zones.live-db.test.ts",
      "--config",
      "vitest.live-db.config.ts",
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, DATABASE_URL: url, POSTGRES_URL: url },
      stdio: "inherit",
    },
  );
  if (result.status !== 0)
    throw new Error(`coach athlete-zones disposable live test failed with status ${result.status}`);
});
