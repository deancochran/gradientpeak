import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import {
  applyAuthIdentityCompatibilityUpgrade,
  assertAuthIdentityCompatibilityUpgradeArtifact,
  expectedAuthIdentityCompatibilityBeforeFingerprint,
  expectedAuthIdentityCompatibilityUpgradeSql,
} from "./auth-identity-compatibility-upgrade";
import { createSchemaFingerprint } from "./check-schema-fingerprint";

const baseline = resolve(dbPackageRoot, "supabase/migrations/20260730000000_mvp_baseline.sql");

async function createLegacyAccount(
  pool: Parameters<typeof applyAuthIdentityCompatibilityUpgrade>[0],
  values: {
    email: string;
    issuer: string;
    providerId: string;
    accountId: string;
  },
) {
  const user = await pool.query(
    "insert into public.users(name, email) values ($1, $2) returning id",
    [values.email, values.email],
  );
  await pool.query(
    "insert into public.accounts(issuer, account_id, provider_id, user_id) values ($1, $2, $3, $4)",
    [values.issuer, values.accountId, values.providerId, user.rows[0]?.id],
  );
}

async function main() {
  assertAuthIdentityCompatibilityUpgradeArtifact(expectedAuthIdentityCompatibilityUpgradeSql());
  assert.throws(
    () =>
      assertAuthIdentityCompatibilityUpgradeArtifact(
        `${expectedAuthIdentityCompatibilityUpgradeSql()}-- tampered\n`,
      ),
    /differs/,
  );
  await withDisposableDatabase(
    process.argv.slice(2),
    "auth_identity_compatibility",
    async (pool) => {
      await bootstrapSupabaseSchemas(pool);
      await pool.query("create extension if not exists pgcrypto with schema extensions");
      await pool.query(readFileSync(baseline, "utf8"));
      // Build the exact legacy source in the guarded disposable target only.
      await pool.query('drop index public."accounts_providerId_accountId_uidx"');
      await pool.query("alter table public.accounts alter column issuer set not null");
      await pool.query(
        'create unique index "accounts_issuer_accountId_uidx" on public.accounts using btree (issuer, account_id)',
      );
      // The pinned upgrade predecessor predates the import-run ownership repair.
      // Reconstruct that predecessor only in this guarded disposable fixture so
      // the approved upgrade's immutable precondition remains meaningful.
      await pool.query(`
         alter table public.activity_source_references
           drop constraint activity_source_refs_last_import_run_profile_fk,
           drop constraint activity_source_refs_material_import_run_profile_fk;
         alter table public.provider_sync_jobs
           drop constraint provider_sync_jobs_import_run_profile_fkey;
         drop trigger activity_import_runs_clear_material_source_references
           on public.activity_import_runs;
         drop function public.clear_material_import_run_reference();
         alter table public.activity_source_references
           add constraint activity_source_refs_last_import_run_profile_fk
             foreign key (last_import_run_id, profile_id)
             references public.activity_import_runs(id, profile_id) on delete set null;
         alter table public.activity_source_references
           add constraint activity_source_refs_material_import_run_profile_fk
             foreign key (last_material_import_run_id, profile_id)
             references public.activity_import_runs(id, profile_id) on delete set null;
         alter table public.provider_sync_jobs
           add constraint provider_sync_jobs_import_run_profile_fkey
             foreign key (import_run_id, profile_id)
             references public.activity_import_runs(id, profile_id) on delete set null;
       `);
      await createLegacyAccount(pool, {
        email: "legacy-one@example.test",
        issuer: "https://legacy.example/issuer",
        providerId: "credential",
        accountId: "same-account",
      });
      await createLegacyAccount(pool, {
        email: "legacy-two@example.test",
        issuer: "https://another.example/issuer",
        providerId: "github",
        accountId: "same-account",
      });
      assert.deepEqual(
        await createSchemaFingerprint(pool),
        expectedAuthIdentityCompatibilityBeforeFingerprint(),
        "disposable legacy source must match the pinned full fingerprint",
      );
      await createLegacyAccount(pool, {
        email: "legacy-collision@example.test",
        issuer: "https://collision.example/issuer",
        providerId: "credential",
        accountId: "same-account",
      });
      await assert.rejects(
        () => applyAuthIdentityCompatibilityUpgrade(pool),
        /provider\/account identity collision/,
      );
      await pool.query(
        "delete from public.accounts where issuer = 'https://collision.example/issuer'",
      );
      await applyAuthIdentityCompatibilityUpgrade(pool);
      const retained = await pool.query(
        "select issuer from public.accounts where account_id = 'same-account' order by provider_id",
      );
      assert.deepEqual(
        retained.rows.map((row) => row.issuer),
        ["https://legacy.example/issuer", "https://another.example/issuer"],
        "legacy issuer values must be retained",
      );
      const newUser = await pool.query(
        "insert into public.users(name, email) values ('new', 'new@example.test') returning id",
      );
      await pool.query(
        "insert into public.accounts(issuer, account_id, provider_id, user_id) values (null, 'new-account', 'credential', $1)",
        [newUser.rows[0]?.id],
      );
      await assert.rejects(
        () =>
          pool.query(
            "insert into public.accounts(issuer, account_id, provider_id, user_id) values (null, 'new-account', 'credential', $1)",
            [newUser.rows[0]?.id],
          ),
        /duplicate key/,
      );
      await pool.query(
        "insert into public.accounts(issuer, account_id, provider_id, user_id) values (null, 'new-account', 'google', $1)",
        [newUser.rows[0]?.id],
      );
      await assert.rejects(
        () => applyAuthIdentityCompatibilityUpgrade(pool),
        /pre-upgrade fingerprint mismatch/,
      );
    },
  );
  console.log(
    "[auth-identity:upgrade:test] legacy issuers retained; null issuer and provider/account uniqueness verified; drift/replay refused",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "auth identity compatibility proof failed",
  );
  process.exitCode = 1;
});
