#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";

await withDisposableDatabase(
  process.argv.slice(2),
  "planned_sessions",
  async (target, connectionString) => {
    await bootstrapSupabaseSchemas(target);
    for (const migrationPath of requireFreshBaseline().migrationPaths) {
      await applySqlFile(target, migrationPath);
    }
    const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "src/application/calendar/planned-session-services.live-db.test.ts",
        "src/lib/provider-sync/planned-activities/wahoo-plan-refresh.live-db.test.ts",
        "--config",
        "vitest.live-db.config.ts",
      ],
      {
        cwd: packageDirectory,
        env: {
          ...process.env,
          DATABASE_URL: connectionString,
          POSTGRES_URL: connectionString,
          RUN_PLANNED_SESSION_LIVE_DB: "1",
        },
        stdio: "inherit",
      },
    );
    if (result.status !== 0) {
      throw new Error(`planned-session disposable live test failed with status ${result.status}`);
    }
  },
);
