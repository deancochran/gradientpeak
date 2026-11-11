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
  "delegated_calendar",
  async (target, connectionString) => {
    await bootstrapSupabaseSchemas(target);
    for (const migrationPath of requireFreshBaseline().migrationPaths) {
      await applySqlFile(target, migrationPath);
    }
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "src/application/calendar/read-delegated-calendar.live-db.test.ts",
        "--config",
        "vitest.live-db.config.ts",
      ],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: { ...process.env, DATABASE_URL: connectionString, POSTGRES_URL: connectionString },
        stdio: "inherit",
      },
    );
    if (result.status !== 0)
      throw new Error(`delegated calendar disposable test failed with status ${result.status}`);
  },
);
