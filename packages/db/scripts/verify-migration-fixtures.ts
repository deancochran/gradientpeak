#!/usr/bin/env tsx

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import { classifyLedger, type LedgerEntry } from "./check-migration-ledger";
import { createSchemaFingerprint } from "./check-schema-fingerprint";

type LedgerEvidence = { entries: LedgerEntry[] };
type Policy = {
  authorityDirectory: string;
  baseline: { version: string; name: string };
  ledgerEvidence: { preReconciliationFile: string; postReconciliationFile: string };
};

async function main() {
  const args = process.argv.slice(2);
  const policy = JSON.parse(
    readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
  ) as Policy;
  const pre = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.ledgerEvidence.preReconciliationFile), "utf8"),
  ) as LedgerEvidence;
  const post = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.ledgerEvidence.postReconciliationFile), "utf8"),
  ) as LedgerEvidence;
  if (
    classifyLedger(pre.entries.slice(0, -1), pre.entries, post.entries) !==
    "unsupported-intermediate"
  ) {
    throw new Error("partial ledger fixture must be rejected as unsupported");
  }

  await withDisposableDatabase(args, "upgrade_verify", async (target) => {
    await bootstrapSupabaseSchemas(target);
    const migrationDirectory = resolve(dbPackageRoot, policy.authorityDirectory);
    const activeFiles = readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const baselineFile = `${policy.baseline.version}_${policy.baseline.name}.sql`;
    if (activeFiles[0] !== baselineFile)
      throw new Error("baseline is not the first active migration");

    // The baseline is the captured endpoint schema snapshot. Recreate that endpoint
    // with its exact old ledger, representative product data, and drifted storage.
    await applySqlFile(target, resolve(migrationDirectory, baselineFile));
    await target.query(`
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (
        version text primary key,
        name text not null
      )
    `);
    for (const entry of pre.entries) {
      await target.query(
        "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
        [entry.version, entry.name],
      );
    }
    await target.query(`
      insert into public.training_plans (
        id, idx, profile_id, name, structure, template_visibility, is_system_template
      ) values (
        '11111111-1111-4111-8111-111111111111', 9001, null,
        'upgrade sentinel', '{"sessions":[]}'::jsonb, 'public', true
      );
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('profile-avatars', 'legacy-avatar-name', false, 1, array['text/plain']::text[]);
    `);
    const before = await target.query(
      "select row_to_json(t) as row from (select * from public.training_plans where idx = 9001) t",
    );
    const current = await target.query<LedgerEntry>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    if (classifyLedger(current.rows, pre.entries, post.entries) !== "pre-reconciliation") {
      throw new Error("fixture did not recreate the exact captured ledger endpoint");
    }

    // Metadata-only reconciliation: old SQL effects stay in place, while the
    // captured schema snapshot is marked applied. Followups then converge security,
    // storage configuration, and the advisor index.
    await target.query("truncate supabase_migrations.schema_migrations");
    await target.query(
      "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
      [policy.baseline.version, policy.baseline.name],
    );
    for (const file of activeFiles.slice(1)) {
      await applySqlFile(target, resolve(migrationDirectory, file));
      await target.query(
        "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
        [file.slice(0, 14), file.slice(15, -4)],
      );
    }

    const reconciled = await target.query<LedgerEntry>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    if (classifyLedger(reconciled.rows, pre.entries, post.entries) !== "post-reconciliation") {
      throw new Error("upgrade fixture did not reach the exact three-entry post ledger");
    }
    const after = await target.query(
      "select row_to_json(t) as row from (select * from public.training_plans where idx = 9001) t",
    );
    if (JSON.stringify(before.rows) !== JSON.stringify(after.rows)) {
      throw new Error("representative product data changed during reconciliation");
    }
    const actualFingerprint = await createSchemaFingerprint(target);
    const expectedFingerprint = JSON.parse(
      readFileSync(resolve(dbPackageRoot, "schema-fingerprint.json"), "utf8"),
    ) as Record<string, unknown>;
    if (JSON.stringify(actualFingerprint) !== JSON.stringify(expectedFingerprint)) {
      const actual = actualFingerprint as Record<string, unknown>;
      const differingSections = Object.keys(expectedFingerprint).filter(
        (key) => JSON.stringify(actual[key]) !== JSON.stringify(expectedFingerprint[key]),
      );
      const diagnostics = differingSections.map((section) => {
        const expected = expectedFingerprint[section];
        const found = actual[section];
        if (!Array.isArray(expected) || !Array.isArray(found)) return section;
        const index = Math.max(
          0,
          expected.findIndex(
            (value, position) => JSON.stringify(value) !== JSON.stringify(found[position]),
          ),
        );
        return `${section}[${index}] expected=${JSON.stringify(expected[index])} found=${JSON.stringify(found[index])}`;
      });
      throw new Error(
        `upgraded endpoint does not converge to the fresh schema fingerprint: ${diagnostics.join("; ")}`,
      );
    }
    console.log(
      `[db:migration:upgrade] ${pre.entries.length}-entry endpoint reconciled to ${post.entries.length} entries with schema and data convergence`,
    );
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `[db:migration:upgrade] ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof Error && error.cause) console.error(String(error.cause));
    process.exit(1);
  });
}
