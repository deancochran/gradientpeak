#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { dbPackageRoot } from "./_helpers";
import { requireExplicitLocalTarget } from "./_target-safety";

export type LedgerEntry = { version: string; name: string };
type ActiveLedgerEntry = LedgerEntry & { sha256: string };
export function classifyLedger(actual: LedgerEntry[], active: ActiveLedgerEntry[]) {
  const expected = active.map(({ version, name }) => ({ version, name }));
  return JSON.stringify(actual) === JSON.stringify(expected) ? "generation-2" : "unsupported";
}

async function main() {
  const connectionString = requireExplicitLocalTarget(process.argv.slice(2));
  const policy = JSON.parse(
    readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
  ) as { activeLedgerFile: string };
  const active = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.activeLedgerFile), "utf8"),
  ) as { entries: ActiveLedgerEntry[] };
  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query<LedgerEntry>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    if (classifyLedger(result.rows, active.entries) !== "generation-2")
      throw new Error("ledger is unsupported; repair and downgrade are forbidden");
    console.log("[db:migration:ledger] exact generation 2 baseline plus forward chain verified");
  } finally {
    await pool.end();
  }
}
if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((error) => {
    console.error(
      `[db:migration:ledger] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
