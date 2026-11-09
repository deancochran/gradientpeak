#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import {
  buildDisposableLiveDbVitestCommand,
  parseDisposableLiveDbCommand,
} from "./live-db-disposable-options";

const args = process.argv.slice(2);
const command = parseDisposableLiveDbCommand(args);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

await withDisposableDatabase(args, "api_live_db", async (target, connectionString) => {
  await bootstrapSupabaseSchemas(target);
  for (const migrationPath of requireFreshBaseline().migrationPaths) {
    await applySqlFile(target, migrationPath);
  }

  const { LIVE_DB_DISPOSABLE_EXPECTED_TARGET_RECEIPT_PATH: expectedReceiptPath, ...childEnv } =
    process.env;
  if (expectedReceiptPath) {
    writeFileSync(
      expectedReceiptPath,
      JSON.stringify({ databaseUrl: connectionString, postgresUrl: connectionString }),
    );
  }

  const result = spawnSync("pnpm", buildDisposableLiveDbVitestCommand(command), {
    cwd: packageDirectory,
    env: { ...childEnv, DATABASE_URL: connectionString, POSTGRES_URL: connectionString },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`guarded disposable API live-DB test failed with status ${result.status}`);
  }
});
