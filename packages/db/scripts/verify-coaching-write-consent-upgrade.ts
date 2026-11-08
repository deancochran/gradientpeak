import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import {
  applyCoachingWriteConsentUpgrade,
  assertPrerequisiteArtifact,
  assertUpgradeArtifact,
  expectedPrerequisiteFingerprint,
  expectedUpgradeSql,
  extractWriteConsentUpgrade,
  prerequisiteBaseline,
} from "./coaching-write-consent-upgrade";
import { createRetainedDataDigest } from "./retained-e2e-upgrade";

async function main() {
  const begin = "-- COACHING_WRITE_CONSENT_UPGRADE_BEGIN";
  const end = "-- COACHING_WRITE_CONSENT_UPGRADE_END";
  const unit = expectedUpgradeSql()
    .replace(/^.*\nBEGIN;\nSET LOCAL search_path = public, pg_catalog;\n/, "")
    .replace(/\nCOMMIT;\n$/, "");
  const bounded = `${begin}\n${unit}\n${end}`;
  assert.equal(
    extractWriteConsentUpgrade(`${bounded}\nCREATE TABLE public.unrelated(id integer);`),
    expectedUpgradeSql(),
  );
  assert.throws(
    () =>
      extractWriteConsentUpgrade(
        `${begin}\n${unit}\nCREATE TABLE public.unrelated(id integer);\n${end}`,
      ),
    /unexpected object scope/,
  );
  assert.throws(() => extractWriteConsentUpgrade(`${begin}\n${bounded}`), /exactly once/);
  assert.throws(() => extractWriteConsentUpgrade(`${begin}\n${unit}`), /exactly once/);
  assert.throws(() => extractWriteConsentUpgrade(`${end}\n${unit}\n${begin}`), /order/);
  assertPrerequisiteArtifact(expectedPrerequisiteFingerprint());
  assert.throws(() => assertPrerequisiteArtifact({ tables: [] }), /pinned source/);
  assertUpgradeArtifact(expectedUpgradeSql());
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        resolve(
          dbPackageRoot,
          "supabase/approved-upgrades/coaching-write-consent/after-fingerprint.json",
        ),
        "utf8",
      ),
    ),
    JSON.parse(
      execFileSync(
        "git",
        ["show", "b77dc2fd108ad914fcf9f41b8b4f594aa2bba046:packages/db/schema-fingerprint.json"],
        {
          cwd: dbPackageRoot,
          encoding: "utf8",
        },
      ),
    ),
    "post-upgrade artifact must match the write-consent foundation fingerprint",
  );
  assert.throws(
    () =>
      assertUpgradeArtifact(
        expectedUpgradeSql().replace("COMMIT;", "DELETE FROM public.profiles;\nCOMMIT;"),
      ),
    /bounded authoritative/,
  );
  await withDisposableDatabase(
    process.argv.slice(2),
    "coaching_write_consent_upgrade",
    async (pool) => {
      await bootstrapSupabaseSchemas(pool);
      await pool.query("create extension if not exists pgcrypto with schema extensions");
      await pool.query(prerequisiteBaseline());
      const athlete = "00000000-0000-4000-8000-000000999901";
      const policy = "00000000-0000-4000-8000-000000999902";
      const organization = "00000000-0000-4000-8000-000000999903";
      const owner = "00000000-0000-4000-8000-000000999904";
      const membership = "00000000-0000-4000-0000-000000999905".replace("4000-0000", "4000-8000");
      const engagement = "00000000-0000-4000-8000-000000999906";
      await pool.query("begin");
      await pool.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'write-upgrade@example.test','{}')",
        [athlete],
      );
      await pool.query(
        "insert into public.athlete_consent_policy_versions(id,scope_key,effective_from,jurisdiction,terms_text,content_digest) values($1,'training',now(),'US','retained read terms','retained-read-digest')",
        [policy],
      );
      await pool.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'write-upgrade-owner@example.test','{}')",
        [owner],
      );
      await pool.query(
        "insert into public.organizations(id,created_by_profile_id,root_owner_membership_id,name,slug,timezone) values($1,$2,$3,'upgrade org','upgrade-org','UTC')",
        [organization, owner, membership],
      );
      await pool.query(
        "insert into public.organization_memberships(id,organization_id,profile_id) values($1,$2,$3)",
        [membership, organization, owner],
      );
      await pool.query(
        "insert into public.organization_membership_role_grants(organization_id,membership_id,role_key) values($1,$2,'admin'),($1,$2,'coach')",
        [organization, membership],
      );
      await pool.query(
        "insert into public.coaching_engagements(id,organization_id,athlete_profile_id) values($1,$2,$3)",
        [engagement, organization, athlete],
      );
      await pool.query(
        "insert into public.coaching_assignments(organization_id,engagement_id,coach_membership_id,assignment_kind) values($1,$2,$3,'primary')",
        [organization, engagement, membership],
      );
      await pool.query(
        "insert into public.athlete_data_sharing_consents(organization_id,engagement_id,athlete_profile_id,scope_key,policy_version_id,granted_by_profile_id) values($1,$2,$3,'training',$4,$3)",
        [organization, engagement, athlete, policy],
      );
      await pool.query("commit");
      const before = await pool.query(
        "select (select to_jsonb(p) from public.profiles p where p.id=$1) profile, (select jsonb_agg(to_jsonb(x) order by x.id) from public.athlete_data_sharing_consents x) consents, (select jsonb_agg(to_jsonb(x) order by x.id) from public.coaching_engagements x) engagements, (select jsonb_agg(to_jsonb(x) order by x.id) from public.coaching_assignments x) assignments",
        [athlete],
      );
      await pool.query("create table public.unexpected_write_upgrade_state(id integer)");
      await assert.rejects(
        () => applyCoachingWriteConsentUpgrade(pool),
        /pre-upgrade fingerprint mismatch/,
      );
      assert.equal(
        (await pool.query("select to_regclass('public.athlete_coaching_write_grants') as relation"))
          .rows[0]?.relation,
        null,
      );
      await pool.query("drop table public.unexpected_write_upgrade_state");
      const sourceData = await createRetainedDataDigest(pool);
      await assert.rejects(
        () =>
          applyCoachingWriteConsentUpgrade(pool, {
            beforeFingerprint: async (client) => {
              await client.query("lock table public.profiles in access exclusive mode");
            },
            expectedSourceData: sourceData,
            afterDdl: async (client) => {
              await client.query("create table public.write_upgrade_fault(id integer)");
            },
          }),
        /post-upgrade fingerprint mismatch/,
      );
      assert.equal(
        (await pool.query("select to_regclass('public.athlete_coaching_write_grants') as relation"))
          .rows[0]?.relation,
        null,
      );
      await applyCoachingWriteConsentUpgrade(pool, { expectedSourceData: sourceData });
      const after = await pool.query(
        "select (select to_jsonb(p) from public.profiles p where p.id=$1) profile, (select jsonb_agg(to_jsonb(x) order by x.id) from public.athlete_data_sharing_consents x) consents, (select jsonb_agg(to_jsonb(x) order by x.id) from public.coaching_engagements x) engagements, (select jsonb_agg(to_jsonb(x) order by x.id) from public.coaching_assignments x) assignments",
        [athlete],
      );
      assert.deepEqual(
        after.rows,
        before.rows,
        "identity and read-policy history must survive additive DDL",
      );
      assert.equal(
        (
          await pool.query(
            "select count(*)::int as count from public.athlete_coaching_write_grants",
          )
        ).rows[0]?.count,
        0,
        "upgrade must not manufacture write grants",
      );
      await assert.rejects(
        () => applyCoachingWriteConsentUpgrade(pool),
        /pre-upgrade fingerprint mismatch/,
      );
    },
  );
  console.log(
    "[coaching:write-upgrade:test] artifact integrity and wrong-fingerprint pre-mutation refusal passed",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
