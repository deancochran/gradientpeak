#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import { classifyLedger, type LedgerEntry } from "./check-migration-ledger";

async function main() {
  const args = process.argv.slice(2);
  const policy = JSON.parse(
    readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
  ) as {
    authorityDirectory: string;
    baseline: { version: string; name: string };
    activeLedgerFile: string;
  };
  const active = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.activeLedgerFile), "utf8"),
  ) as { entries: LedgerEntry[] };
  if (classifyLedger(active.entries, active.entries) !== "generation-2")
    throw new Error("active generation 2 ledger rejected");
  for (const unsupported of [
    [],
    [{ version: "20260725225842", name: "drop_activity_plan_route" }],
    [...active.entries, { version: "20260725225842", name: "drop_activity_plan_route" }],
  ]) {
    if (classifyLedger(unsupported, active.entries) !== "unsupported")
      throw new Error("old, partial, or mixed ledger was accepted");
  }
  await withDisposableDatabase(args, "generation_fixture", async (target) => {
    await bootstrapSupabaseSchemas(target);
    await applySqlFile(
      target,
      resolve(
        dbPackageRoot,
        policy.authorityDirectory,
        `${policy.baseline.version}_${policy.baseline.name}.sql`,
      ),
    );
    const idx = await target.query<{ table_name: string }>(
      "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'idx' order by table_name",
    );
    if (JSON.stringify(idx.rows) !== JSON.stringify([{ table_name: "profile_metrics" }]))
      throw new Error("redundant idx columns remain");
    const queue = await target.query(
      "select 1 from pg_indexes where schemaname = 'public' and indexname = 'provider_sync_jobs_queue_sequence_key'",
    );
    if (queue.rowCount !== 1) throw new Error("queue_sequence identity index is missing");
    const extension = await target.query<{ schema: string }>(`
      select n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace
      where e.extname = 'btree_gist'
    `);
    if (JSON.stringify(extension.rows) !== JSON.stringify([{ schema: "extensions" }])) {
      throw new Error("btree_gist is missing or not installed in extensions");
    }
    const unvalidated = await target.query<{ conname: string }>(`
      select conname from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.contype in ('c', 'f', 'u', 'p', 'x') and not c.convalidated
    `);
    if (unvalidated.rowCount !== 0)
      throw new Error("fresh baseline has unvalidated public constraints");
  });
  console.log(
    "[db:migration:fixtures] generation 2 fresh baseline and hard-reset ledger rejection passed",
  );
}
main().catch((error) => {
  console.error(
    `[db:migration:fixtures] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
