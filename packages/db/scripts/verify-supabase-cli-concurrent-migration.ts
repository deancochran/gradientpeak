#!/usr/bin/env tsx

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import { invalidIndexCleanup } from "./_migration-operations";
import {
  autocommitSettings,
  type MigrationLedgerEntry,
  type MigrationPolicy,
} from "./_migration-plan";
import { runPinnedSupabaseCliPush } from "./_supabase-cli-wrapper";

const policy = JSON.parse(
  readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
) as MigrationPolicy;
const ledger = JSON.parse(
  readFileSync(resolve(dbPackageRoot, policy.activeLedgerFile), "utf8"),
) as { entries: MigrationLedgerEntry[] };

function redactDatabaseUrl(value: string, databaseUrl: string) {
  return value.replaceAll(databaseUrl, "[redacted-url]");
}

async function pushPinnedHistory(params: {
  databaseUrl: string;
  policy: MigrationPolicy;
  projectRoot: string;
}) {
  try {
    await runPinnedSupabaseCliPush(params);
  } catch (error) {
    const output = error as { stderr?: string | Buffer; stdout?: string | Buffer };
    throw new Error(
      `pinned Supabase CLI migration failed: ${redactDatabaseUrl(
        `${output.stdout?.toString() ?? ""}\n${output.stderr?.toString() ?? ""}`,
        params.databaseUrl,
      )}`,
    );
  }
}

await withDisposableDatabase(
  process.argv.slice(2),
  "supabase_cli_concurrent",
  async (target, url) => {
    await bootstrapSupabaseSchemas(target);
    const baseline = ledger.entries[0];
    const canonicalMigration = ledger.entries[1];
    const indexMigration = ledger.entries[2];
    if (!baseline || !canonicalMigration || !indexMigration)
      throw new Error("migration ledger is missing the baseline/canonical/index chain");
    if (indexMigration.executionMode !== "autocommit" || !indexMigration.operation)
      throw new Error("90002 is missing guarded autocommit operation metadata");
    await applySqlFile(
      target,
      resolve(dbPackageRoot, policy.authorityDirectory, `${baseline.version}_${baseline.name}.sql`),
      baseline.executionMode,
    );
    await target.query(
      "create schema if not exists supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key)",
    );
    for (const migration of [canonicalMigration]) {
      await applySqlFile(
        target,
        resolve(
          dbPackageRoot,
          policy.authorityDirectory,
          `${migration.version}_${migration.name}.sql`,
        ),
        migration.executionMode,
        autocommitSettings(policy, migration),
      );
      await target.query(
        "insert into supabase_migrations.schema_migrations (version) values ($1)",
        [migration.version],
      );
    }
    const cliProject = mkdtempSync(resolve(tmpdir(), "gradientpeak-supabase-cli-"));
    try {
      const cliSupabase = resolve(cliProject, "supabase");
      mkdirSync(resolve(cliSupabase, "migrations"), { recursive: true });
      cpSync(resolve(dbPackageRoot, "supabase/config.toml"), resolve(cliSupabase, "config.toml"));
      for (const migration of [canonicalMigration, indexMigration]) {
        cpSync(
          resolve(
            dbPackageRoot,
            policy.authorityDirectory,
            `${migration.version}_${migration.name}.sql`,
          ),
          resolve(cliSupabase, "migrations", `${migration.version}_${migration.name}.sql`),
        );
      }
      try {
        const probeTable = "migration_invalid_index_probe";
        await target.query(
          "select set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)",
          [
            policy.forwardMigrations.autocommitSession.lockTimeout,
            policy.forwardMigrations.autocommitSession.statementTimeout,
          ],
        );
        await target.query(`create table public.${probeTable} (value integer not null)`);
        await target.query(`insert into public.${probeTable} (value) values (1), (1)`);
        try {
          await target.query(
            `create unique index concurrently idx_events_planned_day_summary on public.${probeTable} (value)`,
          );
          throw new Error("duplicate unique concurrent index build unexpectedly succeeded");
        } catch (error) {
          if (error instanceof Error && error.message.includes("unexpectedly succeeded"))
            throw error;
          const code = (error as { code?: string }).code;
          if (code !== "23505")
            throw new Error("duplicate unique concurrent index build did not fail for uniqueness", {
              cause: error,
            });
        }
        const invalid = await target.query<{ indisvalid: boolean }>(
          `
          select i.indisvalid
          from pg_catalog.pg_index i
          join pg_catalog.pg_class c on c.oid = i.indexrelid
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and c.relname = $2
        `,
          [indexMigration.operation.schema, indexMigration.operation.indexName],
        );
        if (invalid.rowCount !== 1 || invalid.rows[0]?.indisvalid !== false)
          throw new Error(
            "duplicate unique concurrent index build did not leave the expected invalid index",
          );
        await target.query(invalidIndexCleanup(indexMigration.operation));
        const afterCleanup = await target.query(
          `
          select 1
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and c.relname = $2
        `,
          [indexMigration.operation.schema, indexMigration.operation.indexName],
        );
        if (afterCleanup.rowCount !== 0)
          throw new Error("metadata-derived invalid-index cleanup did not remove the probe index");
        const beforeApply = await target.query<{ version: string }>(
          "select version from supabase_migrations.schema_migrations order by version",
        );
        if (
          JSON.stringify(beforeApply.rows) !==
          JSON.stringify([{ version: canonicalMigration.version }])
        )
          throw new Error("90002 was recorded before its guarded application");
        await pushPinnedHistory({ databaseUrl: url, policy, projectRoot: cliProject });
      } finally {
        await target.query("reset lock_timeout; reset statement_timeout").catch(() => undefined);
        await target.query("drop table if exists public.migration_invalid_index_probe");
      }
      const afterRetry = await target.query<{ version: string }>(
        "select version from supabase_migrations.schema_migrations order by version",
      );
      if (
        JSON.stringify(afterRetry.rows) !==
        JSON.stringify([
          { version: canonicalMigration.version },
          { version: indexMigration.version },
        ])
      ) {
        throw new Error(
          "successful concurrent-index retry did not preserve ordered migration history",
        );
      }
      const index = await target.query<{ indisvalid: boolean }>(`
      select i.indisvalid
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'idx_events_planned_day_summary'
    `);
      if (index.rows[0]?.indisvalid !== true)
        throw new Error(
          "pinned Supabase CLI retry did not create a valid concurrent planned-day index",
        );
    } finally {
      rmSync(cliProject, { force: true, recursive: true });
    }
  },
);

console.log(
  "[db:migration:supabase-cli] failed unique concurrent build invalid-index cleanup and guarded pinned-history application passed",
);
