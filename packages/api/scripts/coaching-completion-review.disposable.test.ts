#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";

/** Runs completion-review live-DB coverage only against a newly created local candidate. */
await withDisposableDatabase(
  process.argv.slice(2),
  "coaching_completion_review",
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
        "src/application/calendar/read-delegated-completed-activities.live-db.test.ts",
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
      throw new Error(`completion-review disposable test failed with status ${result.status}`);
  },
);
