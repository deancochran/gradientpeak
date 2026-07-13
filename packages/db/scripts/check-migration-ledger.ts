#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { dbPackageRoot } from "./_helpers";
import { requireExplicitLocalTarget } from "./_target-safety";

export type LedgerEntry = { version: string; name: string };
type LedgerEvidence = { entries: LedgerEntry[] };
type Policy = {
  ledgerEvidence: { preReconciliationFile: string; postReconciliationFile: string };
};

export function classifyLedger(actual: LedgerEntry[], pre: LedgerEntry[], post: LedgerEntry[]) {
  const serialized = JSON.stringify(actual);
  if (serialized === JSON.stringify(pre)) return "pre-reconciliation" as const;
  if (serialized === JSON.stringify(post)) return "post-reconciliation" as const;
  return "unsupported-intermediate" as const;
}

async function main() {
  const args = process.argv.slice(2);
  const expectsPre = args.includes("--pre-reconciliation");
  const expectsPost = args.includes("--post-reconciliation");
  if (expectsPre === expectsPost) {
    throw new Error(
      "choose exactly one ledger expectation: --pre-reconciliation or --post-reconciliation",
    );
  }
  const connectionString = requireExplicitLocalTarget(args);
  const policy = JSON.parse(
    readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
  ) as Policy;
  const pre = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.ledgerEvidence.preReconciliationFile), "utf8"),
  ) as LedgerEvidence;
  const post = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.ledgerEvidence.postReconciliationFile), "utf8"),
  ) as LedgerEvidence;
  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query<LedgerEntry>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    const state = classifyLedger(result.rows, pre.entries, post.entries);
    const expected = expectsPre ? "pre-reconciliation" : "post-reconciliation";
    if (state !== expected) {
      throw new Error(
        `ledger is ${state}, expected ${expected}; stop without repairing an unsupported intermediate ledger`,
      );
    }
    console.log(`[db:migration:ledger] ${result.rows.length} versions match ${expected} evidence`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      `[db:migration:ledger] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
