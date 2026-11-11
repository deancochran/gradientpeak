#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import {
  requireDisposableLiveDbFlags,
  verifyDisposableLiveDbReceipt,
} from "./live-db-disposable-options";

requireDisposableLiveDbFlags(process.argv.slice(2));

const temporaryDirectory = mkdtempSync(join(tmpdir(), "gradientpeak-live-db-runner-"));
const receiptPath = join(temporaryDirectory, "receipt.json");
const expectedReceiptPath = join(temporaryDirectory, "expected-target.json");
try {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "scripts/run-live-db-disposable.ts",
      "src/test/live-db-disposable-runner.fixture.live-db.test.ts",
      "--disposable",
      "--local",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LIVE_DB_DISPOSABLE_FORCE_FAILURE: "1",
        LIVE_DB_DISPOSABLE_EXPECTED_TARGET_RECEIPT_PATH: expectedReceiptPath,
        LIVE_DB_DISPOSABLE_RECEIPT_PATH: receiptPath,
        LIVE_DB_DISPOSABLE_RUNNER_FIXTURE: "1",
      },
      stdio: "inherit",
    },
  );
  assert.notEqual(result.status, 0, "intentional child failure must reach the runner");
  const receipt = verifyDisposableLiveDbReceipt({
    expected: JSON.parse(readFileSync(expectedReceiptPath, "utf8")),
    actual: JSON.parse(readFileSync(receiptPath, "utf8")),
  });
  const target = new URL(receipt.databaseUrl);
  const database = target.pathname.slice(1);
  assert.match(database, /^gradientpeak_api_live_db_\d+_\d+$/);
  target.pathname = "/postgres";
  const admin = new Pool({ connectionString: target.toString(), max: 1 });
  try {
    const result = await admin.query<{ exists: boolean }>(
      "select exists(select 1 from pg_database where datname = $1) as exists",
      [database],
    );
    assert.equal(result.rows[0]?.exists, false, "failed child left its disposable database behind");
  } finally {
    await admin.end();
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
