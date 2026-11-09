import assert from "node:assert/strict";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import {
  applyAuthIdentityCompatibilityUpgrade,
  assertAuthIdentityCompatibilityUpgradeArtifact,
  expectedAuthIdentityCompatibilityBeforeFingerprint,
  expectedAuthIdentityCompatibilityUpgradeSql,
} from "./auth-identity-compatibility-upgrade";
import { createSchemaFingerprint } from "./check-schema-fingerprint";
import { applyCoachingUpgrade, prerequisiteBaseline } from "./coaching-foundation-upgrade";

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
      // The pinned coaching postcondition is the auth upgrade's legacy precondition.
      // Reconstruct it from immutable history, never from the evolving fresh baseline.
      await pool.query(prerequisiteBaseline());
      await applyCoachingUpgrade(pool);
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
