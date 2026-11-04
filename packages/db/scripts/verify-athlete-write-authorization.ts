#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { athleteWriteAccessDecisionSchema } from "@repo/core/organizations";
import { Client, type Pool } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const owner = id(1),
  coach = id(2),
  athlete = id(3),
  otherAthlete = id(4);
const org = id(10),
  ownerMembership = id(11),
  coachMembership = id(12),
  engagement = id(13);
const policy = id(20),
  grant = id(21),
  readPolicy = id(22),
  readConsent = id(23);
const decision = "select public.coaching_athlete_write_access_decision($1,$2,$3,$4) as decision";

async function expectFailure(action: () => Promise<unknown>, message: string) {
  await assert.rejects(action, message);
}

async function seed(pool: Pool) {
  await pool.query("begin");
  try {
    for (const [profile, email] of [
      [owner, "owner"],
      [coach, "coach"],
      [athlete, "athlete"],
      [otherAthlete, "other"],
    ] as const)
      await pool.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')", [
        profile,
        `${email}@example.test`,
      ]);
    await pool.query(
      `insert into public.organizations(id,created_by_profile_id,root_owner_membership_id,name,slug,timezone) values($1,$2,$3,'write auth org','write-auth-org','UTC')`,
      [org, owner, ownerMembership],
    );
    await pool.query(
      "insert into public.organization_memberships(id,organization_id,profile_id) values($1,$3,$4),($2,$3,$5)",
      [ownerMembership, coachMembership, org, owner, coach],
    );
    await pool.query(
      "insert into public.organization_membership_role_grants(organization_id,membership_id,role_key) values($1,$2,'admin'),($1,$3,'coach')",
      [org, ownerMembership, coachMembership],
    );
    await pool.query(
      "insert into public.coaching_engagements(id,organization_id,athlete_profile_id) values($1,$2,$3)",
      [engagement, org, athlete],
    );
    await pool.query(
      "insert into public.coaching_assignments(organization_id,engagement_id,coach_membership_id,assignment_kind) values($1,$2,$3,'primary')",
      [org, engagement, coachMembership],
    );
    // A legacy/read consent must not be usable as delegated write authority.
    await pool.query(
      "insert into public.athlete_consent_policy_versions(id,scope_key,effective_from,jurisdiction,terms_text,content_digest) values($1,'training',now()-interval '1 day','US','read terms','read-digest')",
      [readPolicy],
    );
    await pool.query(
      "insert into public.athlete_data_sharing_consents(id,organization_id,engagement_id,athlete_profile_id,scope_key,policy_version_id,granted_by_profile_id) values($1,$2,$3,$4,'training',$5,$4)",
      [readConsent, org, engagement, athlete, readPolicy],
    );
    await pool.query(
      "insert into public.athlete_coaching_write_policy_versions(id,scope_key,effective_from,jurisdiction,terms_text,content_digest) values($1,'training_assignment',now()-interval '1 day','US','write terms','write-digest')",
      [policy],
    );
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

async function assertDecision(
  pool: Pool,
  expected: string,
  scope = "training_assignment",
  target = athlete,
) {
  const actual = (await pool.query<{ decision: string }>(decision, [coach, org, target, scope]))
    .rows[0]?.decision;
  athleteWriteAccessDecisionSchema.parse(
    actual === "allow" ? { outcome: "allow", scope } : { outcome: "deny", scope, reason: actual },
  );
  assert.equal(actual, expected);
}

async function proveAuthorityLock(pool: Pool, connectionString: string) {
  const holder = await pool.connect();
  const waiter = new Client({ connectionString, statement_timeout: 5000 });
  let pending: Promise<unknown> | undefined;
  try {
    await waiter.connect();
    const holderPid = (await holder.query("select pg_backend_pid() as pid")).rows[0].pid;
    const waiterPid = (await waiter.query("select pg_backend_pid() as pid")).rows[0].pid;
    await holder.query("begin");
    await holder.query("select id from public.organizations where id=$1 for update", [org]);
    pending = waiter.query(decision, [coach, org, athlete, "training_assignment"]);
    // Attach a rejection handler immediately; the original promise remains asserted below.
    void pending.catch(() => undefined);
    let observed = false;
    for (let attempt = 0; attempt < 1000 && !observed; attempt++) {
      const result = await holder.query(
        "select $1::int = any(pg_blocking_pids($2::int)) as blocked",
        [holderPid, waiterPid],
      );
      observed = result.rows[0].blocked;
    }
    assert.equal(
      observed,
      true,
      "write authorization must wait for the organization authority lock",
    );
    await holder.query("rollback");
    const result = (await pending) as { rows: Array<{ decision: string }> };
    assert.equal(result.rows[0]?.decision, "allow");
  } finally {
    await holder.query("rollback").catch(() => undefined);
    await pending?.catch(() => undefined);
    await waiter.end();
    holder.release();
  }
}

async function main() {
  await withDisposableDatabase(
    process.argv.slice(2),
    "coaching_write_authorization",
    async (pool, connectionString) => {
      await bootstrapSupabaseSchemas(pool);
      for (const migrationPath of requireFreshBaseline().migrationPaths)
        await applySqlFile(pool, migrationPath);
      await seed(pool);
      await assertDecision(pool, "grant_missing");
      await pool.query(
        "insert into public.athlete_coaching_write_grants(id,organization_id,engagement_id,athlete_profile_id,scope_key,policy_version_id,granted_by_profile_id) values($1,$2,$3,$4,'training_assignment',$5,$4)",
        [grant, org, engagement, athlete, policy],
      );
      await assertDecision(pool, "allow");
      await proveAuthorityLock(pool, connectionString);
      await assert.rejects(async () => {
        await pool.query("begin");
        await pool.query(
          "insert into public.athlete_coaching_write_policy_versions(id,scope_key,effective_from,jurisdiction,terms_text,content_digest,supersedes_policy_version_id) values($1,'training_assignment',now()-interval '2 day','US','backward','backward',$2)",
          [id(25), policy],
        );
        await pool.query("commit");
      }, /chronology backward/);
      await pool.query("rollback").catch(() => undefined);
      for (const [sql, expected] of [
        [
          "update public.organizations set suspended_at=now() where id=$1",
          "organization_not_active",
        ],
        [
          "update public.organization_memberships set suspended_at=now() where id=$1",
          "membership_not_active",
        ],
        [
          "update public.coaching_engagements set paused_at=now() where id=$1",
          "engagement_not_active",
        ],
        [
          "update public.coaching_engagements set ended_at=now() where id=$1",
          "engagement_not_active",
        ],
        [
          "update public.coaching_assignments set ended_at=now() where engagement_id=$1",
          "assignment_missing",
        ],
      ] as const) {
        await pool.query("begin");
        await pool.query(sql, [
          sql.includes("organizations")
            ? org
            : sql.includes("memberships")
              ? coachMembership
              : engagement,
        ]);
        await assertDecision(pool, expected);
        await pool.query("rollback");
      }
      await pool.query("begin");
      await pool.query(
        "update public.organization_membership_role_grants set revoked_at=now() where organization_id=$1 and membership_id=$2 and role_key='coach'",
        [org, coachMembership],
      );
      await assertDecision(pool, "missing_coach_role");
      await pool.query("rollback");
      await pool.query("begin");
      await pool.query(
        "update public.athlete_coaching_write_grants set revoked_at=now() where id=$1",
        [grant],
      );
      await pool.query(
        "insert into public.athlete_coaching_write_policy_versions(id,scope_key,effective_from,jurisdiction,terms_text,content_digest) values($1,'training_assignment',now()+interval '1 day','US','future','future')",
        [id(26)],
      );
      await pool.query(
        "insert into public.athlete_coaching_write_grants(organization_id,engagement_id,athlete_profile_id,scope_key,policy_version_id,granted_by_profile_id) values($1,$2,$3,'training_assignment',$4,$3)",
        [org, engagement, athlete, id(26)],
      );
      await assertDecision(pool, "grant_policy_not_effective");
      await pool.query("rollback");
      await assert.rejects(() => pool.query(decision, [coach, org, athlete, "read_training"]), {
        code: "22023",
      });
      await assertDecision(pool, "grant_missing", "schedule_modification");
      await assertDecision(pool, "engagement_not_active", "training_assignment", otherAthlete);
      await expectFailure(
        () =>
          pool.query(
            "update public.athlete_coaching_write_policy_versions set terms_text='rewritten' where id=$1",
            [policy],
          ),
        "published policy must be immutable",
      );
      await expectFailure(
        () =>
          pool.query(
            "update public.athlete_coaching_write_grants set scope_key='schedule_modification' where id=$1",
            [grant],
          ),
        "grant binding must be immutable",
      );
      await expectFailure(
        () =>
          pool.query(
            "insert into public.athlete_coaching_write_grants(organization_id,engagement_id,athlete_profile_id,scope_key,policy_version_id,granted_by_profile_id) values($1,$2,$3,'training_assignment',$4,$5)",
            [org, engagement, athlete, policy, coach],
          ),
        "only athlete can grant",
      );
      await pool.query(
        "update public.athlete_coaching_write_grants set revoked_at=now() where id=$1",
        [grant],
      );
      await assertDecision(pool, "grant_revoked");
      const expiredGrant = id(24);
      await pool.query(
        "insert into public.athlete_coaching_write_grants(id,organization_id,engagement_id,athlete_profile_id,scope_key,policy_version_id,granted_by_profile_id,granted_at,expires_at) values($1,$2,$3,$4,'training_assignment',$5,$4,now()-interval '2 hour',now()-interval '1 hour')",
        [expiredGrant, org, engagement, athlete, policy],
      );
      await assertDecision(pool, "grant_expired");
      console.log(
        "[coaching:write-authorization] read/write separation, binding, immutable policy/history, revocation and expiry passed",
      );
    },
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
