#!/usr/bin/env tsx

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
import { requireDisposableProcessGroups, runLiveDbProcess } from "./live-db-disposable-process";

const args = process.argv.slice(2);
const command = parseDisposableLiveDbCommand(args);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
requireDisposableProcessGroups();
const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

try {
  await withDisposableDatabase(args, "api_live_db", async (target, connectionString) => {
    controller.signal.throwIfAborted();
    await bootstrapSupabaseSchemas(target);
    for (const migrationPath of requireFreshBaseline().migrationPaths) {
      controller.signal.throwIfAborted();
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

    await runLiveDbProcess("pnpm", buildDisposableLiveDbVitestCommand(command), {
      cwd: packageDirectory,
      env: {
        ...childEnv,
        DATABASE_URL: connectionString,
        POSTGRES_URL: connectionString,
        RUN_LIVE_DB_TESTS: "1",
      },
      signal: controller.signal,
    });
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Guarded live database tests failed.");
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
