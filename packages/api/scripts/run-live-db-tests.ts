#!/usr/bin/env tsx

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";

/** Wait for the owned child to exit before the enclosing database is removed. */
export async function runLiveDbProcess(
  executable: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; signal: AbortSignal },
) {
  options.signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
      detached: grouped,
    });
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (grouped) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    };
    const abort = () => {
      stop("SIGTERM");
      killTimer = setTimeout(() => stop("SIGKILL"), 5_000);
      killTimer.unref();
    };
    options.signal.addEventListener("abort", abort, { once: true });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      options.signal.removeEventListener("abort", abort);
      clearTimeout(killTimer);
      if (options.signal.aborted) reject(new Error("Live database tests interrupted."));
      else if (code === 0) resolve();
      else reject(new Error(`Live database tests exited with ${code ?? signal}.`));
    });
  });
}

export async function runLiveDbTests(args: string[], signal: AbortSignal) {
  // This command never uses an ambient application URL as its test database.
  // The DB-owned helper verifies the local host and creates/drops a unique target.
  await withDisposableDatabase(["--disposable", "--local"], "api_live_tests", async (pool, url) => {
    signal.throwIfAborted();
    await bootstrapSupabaseSchemas(pool);
    for (const migration of requireFreshBaseline().migrationPaths) {
      signal.throwIfAborted();
      await applySqlFile(pool, migration);
    }
    const require = createRequire(import.meta.url);
    const manifestPath = require.resolve("vitest/package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      bin: { vitest: string };
    };
    await runLiveDbProcess(
      process.execPath,
      [
        path.resolve(path.dirname(manifestPath), manifest.bin.vitest),
        "run",
        "--config",
        "vitest.live-db.config.ts",
        ...args,
      ],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: { ...process.env, DATABASE_URL: url, POSTGRES_URL: url },
        signal,
      },
    );
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    await runLiveDbTests(process.argv.slice(2), controller.signal);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Live database tests failed.");
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}
