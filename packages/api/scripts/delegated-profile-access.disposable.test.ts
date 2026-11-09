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
  "delegated_profile_access",
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
        "src/routers/__tests__/delegated-profile-access.live-db.test.ts",
        "--config",
        "vitest.live-db.config.ts",
      ],
      {
        cwd: packageDirectory,
        env: { ...process.env, DATABASE_URL: connectionString, POSTGRES_URL: connectionString },
        stdio: "inherit",
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `delegated profile-access disposable test failed with status ${result.status}`,
      );
    }
  },
);
