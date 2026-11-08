#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { Client, type Pool, type QueryResultRow } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(101),
  coach = id(102),
  athlete = id(103),
  other = id(104),
  athleteTwo = id(105);
const org = id(110),
  ownerMembership = id(111),
  coachMembership = id(112),
  engagement = id(113);
const trainingPolicy = id(120),
  schedulePolicy = id(121),
  stalePolicy = id(122),
  publishedPolicy = id(123),
  laterPublishedPolicy = id(124);
const grant = "select public.grant_athlete_coaching_write_access($1,$2,$3,$4,$5,$6,$7) as id";
const revoke = "select public.revoke_athlete_coaching_write_access($1,$2,$3,$4) as id";

async function asService<T extends QueryResultRow = { id: string }>(
  pool: Pool,
  sql: string,
  values: unknown[],
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    const result = await client.query<T>(sql, values);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seed(pool: Pool) {
  await pool.query("begin");
  await pool.query("set constraints all deferred");
  try {
    for (const [profile, label] of [
      [owner, "owner"],
      [coach, "coach"],
      [athlete, "athlete"],
      [other, "other"],
    ] as const)
      await pool.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')", [
        profile,
        `${label}@write-grants.test`,
      ]);
    await pool.query(
      "insert into public.organizations(id,created_by_profile_id,root_owner_membership_id,name,slug,timezone) values($1,$2,$3,'grant org','grant-org','UTC')",
      [org, owner, ownerMembership],
    );
    await pool.query(
      "insert into public.organization_memberships(id,organization_id,profile_id) values($1,$2,$3),($4,$2,$5)",
      [ownerMembership, org, owner, coachMembership, coach],
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
    await pool.query(
      "insert into public.athlete_coaching_write_policy_versions(id,scope_key,effective_from,jurisdiction,terms_text,content_digest) values($1,'training_assignment',now()-interval '1 hour','US','training','training-digest'),($2,'schedule_modification',now()-interval '1 hour','US','schedule','schedule-digest'),($3,'training_assignment',now()-interval '2 hour','US','stale','stale-digest')",
      [trainingPolicy, schedulePolicy, stalePolicy],
    );
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

async function seedSecondOrganization(pool: Pool) {
  const organization = id(140),
    membership = id(141),
    secondEngagement = id(142);
  await pool.query("begin");
  await pool.query("set constraints all deferred");
  try {
    await pool.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,'athlete-two@write-grants.test','{}')",
      [athleteTwo],
    );
    await pool.query(
      "insert into public.organizations(id,created_by_profile_id,root_owner_membership_id,name,slug,timezone) values($1,$2,$3,'grant org two','grant-org-two','UTC')",
      [organization, owner, membership],
    );
    await pool.query(
      "insert into public.organization_memberships(id,organization_id,profile_id) values($1,$2,$3)",
      [membership, organization, owner],
    );
    await pool.query(
      "insert into public.organization_membership_role_grants(organization_id,membership_id,role_key) values($1,$2,'admin')",
      [organization, membership],
    );
    await pool.query(
      "insert into public.coaching_engagements(id,organization_id,athlete_profile_id) values($1,$2,$3)",
      [secondEngagement, organization, athleteTwo],
    );
    await pool.query("commit");
    return { organization, secondEngagement };
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

async function main() {
  await withDisposableDatabase(
    process.argv.slice(2),
    "coaching_write_grant_operations",
    async (pool, connectionString) => {
      await bootstrapSupabaseSchemas(pool);
      for (const path of requireFreshBaseline().migrationPaths) await applySqlFile(pool, path);
      await seed(pool);
      await assert.rejects(
        () =>
          asService(
            pool,
            "insert into public.athlete_coaching_write_grants(organization_id,engagement_id,athlete_profile_id,scope_key,policy_version_id,granted_by_profile_id) values($1,$2,$3,'training_assignment',$4,$3)",
            [org, engagement, athlete, trainingPolicy],
          ),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          asService(pool, grant, [
            other,
            org,
            engagement,
            "training_assignment",
            trainingPolicy,
            "training-digest",
            id(130),
          ]),
        /exact active engagement athlete/,
      );
      await assert.rejects(
        () =>
          asService(pool, grant, [
            athlete,
            org,
            engagement,
            "training_assignment",
            stalePolicy,
            "stale-digest",
            id(131),
          ]),
        /stale or retired/,
      );
      const trainingGrant = (
        await asService(pool, grant, [
          athlete,
          org,
          engagement,
          "training_assignment",
          trainingPolicy,
          "training-digest",
          id(132),
        ])
      ).rows[0]?.id;
      assert.equal(typeof trainingGrant, "string", "grant returns a persisted UUID");
      assert.equal(
        (
          await asService(pool, grant, [
            athlete,
            org,
            engagement,
            "training_assignment",
            trainingPolicy,
            "training-digest",
            id(132),
          ])
        ).rows[0]?.id,
        trainingGrant,
        "same actor/payload replay returns original grant",
      );
      await assert.rejects(
        () =>
          asService(pool, grant, [
            athlete,
            org,
            engagement,
            "schedule_modification",
            schedulePolicy,
            "schedule-digest",
            id(132),
          ]),
        /correlation_id conflicts/,
      );
      const scheduleGrant = (
        await asService(pool, grant, [
          athlete,
          org,
          engagement,
          "schedule_modification",
          schedulePolicy,
          "schedule-digest",
          id(133),
        ])
      ).rows[0]?.id;
      assert.equal(typeof scheduleGrant, "string", "schedule grant returns a persisted UUID");
      assert.equal(
        (
          await pool.query(
            "select public.coaching_athlete_write_access_decision($1,$2,$3,'training_assignment') as decision",
            [coach, org, athlete],
          )
        ).rows[0]?.decision,
        "allow",
      );
      assert.equal(
        (
          await pool.query(
            "select public.coaching_athlete_read_access_decision($1,$2,$3,'training') as decision",
            [coach, org, athlete],
          )
        ).rows[0]?.decision,
        "consent_missing",
        "write grant must not create read consent",
      );
      await assert.rejects(
        () => asService(pool, revoke, [other, org, trainingGrant, id(134)]),
        /exact active engagement athlete/,
      );
      assert.equal(
        (await asService(pool, revoke, [athlete, org, trainingGrant, id(135)])).rows[0]?.id,
        trainingGrant,
      );
      assert.equal(
        (await asService(pool, revoke, [athlete, org, trainingGrant, id(135)])).rows[0]?.id,
        trainingGrant,
        "revoke replay is exact-id idempotent",
      );
      const replacement = (
        await asService(pool, grant, [
          athlete,
          org,
          engagement,
          "training_assignment",
          trainingPolicy,
          "training-digest",
          id(136),
        ])
      ).rows[0]?.id;
      assert.equal(typeof replacement, "string", "replacement returns a persisted UUID");
      await assert.rejects(
        () => asService(pool, revoke, [athlete, org, trainingGrant, id(137)]),
        /already revoked/,
      );
      assert.equal(
        (
          await pool.query(
            "select revoked_at from public.athlete_coaching_write_grants where id=$1",
            [replacement],
          )
        ).rows[0]?.revoked_at,
        null,
        "old grant revoke cannot revoke replacement",
      );
      const receiptCount = async () =>
        Number(
          (
            await pool.query(
              "select count(*)::int as count from public.organization_audit_events where organization_id=$1 and action like 'athlete.coaching_write_%'",
              [org],
            )
          ).rows[0]?.count,
        );
      const receiptsBeforeHistoricalReplay = await receiptCount();
      assert.equal(
        (
          await asService(pool, grant, [
            athlete,
            org,
            engagement,
            "training_assignment",
            trainingPolicy,
            "training-digest",
            id(132),
          ])
        ).rows[0]?.id,
        trainingGrant,
        "historical grant replay returns its original UUID after revoke and replacement",
      );
      assert.equal(
        await receiptCount(),
        receiptsBeforeHistoricalReplay,
        "historical replay creates no receipt",
      );
      assert.equal(
        (
          await pool.query(
            "select revoked_at from public.athlete_coaching_write_grants where id=$1",
            [replacement],
          )
        ).rows[0]?.revoked_at,
        null,
        "historical replay cannot alter the active replacement",
      );
      await assert.rejects(
        () =>
          asService(pool, "delete from public.athlete_coaching_write_grants where id=$1", [
            scheduleGrant,
          ]),
        /permission denied/,
      );
      // Policy publication takes the global scope lock first. The old displayed
      // policy cannot slip through after the newer publication commits.
      const publisher = await pool.connect();
      const staleGrant = new Client({ connectionString, statement_timeout: 5000 });
      try {
        await publisher.query("begin");
        await publisher.query(
          "insert into public.athlete_coaching_write_policy_versions(id,scope_key,effective_from,jurisdiction,terms_text,content_digest) values($1,'training_assignment',now(),'US','published','published-digest')",
          [publishedPolicy],
        );
        await staleGrant.connect();
        await staleGrant.query("begin");
        await staleGrant.query("set local role service_role");
        const publisherPid = (await publisher.query("select pg_backend_pid() as pid")).rows[0].pid;
        const staleGrantPid = (await staleGrant.query("select pg_backend_pid() as pid")).rows[0]
          .pid;
        const pendingStaleGrant = staleGrant.query(grant, [
          athlete,
          org,
          engagement,
          "training_assignment",
          trainingPolicy,
          "training-digest",
          id(145),
        ]);
        void pendingStaleGrant.catch(() => undefined);
        let blocked = false;
        for (let attempt = 0; attempt < 1000 && !blocked; attempt++)
          blocked = (
            await publisher.query("select $1::int=any(pg_blocking_pids($2::int)) as blocked", [
              publisherPid,
              staleGrantPid,
            ])
          ).rows[0].blocked;
        assert.equal(blocked, true, "grant waits for concurrent same-scope policy publication");
        await publisher.query("commit");
        await assert.rejects(() => pendingStaleGrant, /stale or retired/);
        await staleGrant.query("rollback");
      } finally {
        await publisher.query("rollback").catch(() => undefined);
        publisher.release();
        await staleGrant.end();
      }
      // A grant on another organization holds the same global-scope fence; a
      // later policy publication waits, then the committed grant retains the
      // policy that was current at its own linearization point.
      const second = await seedSecondOrganization(pool);
      const grantHolder = new Client({ connectionString, statement_timeout: 5000 });
      const laterPublisher = await pool.connect();
      try {
        await grantHolder.connect();
        await grantHolder.query("begin");
        await grantHolder.query("set local role service_role");
        const secondGrant = await grantHolder.query<{ id: string }>(grant, [
          athleteTwo,
          second.organization,
          second.secondEngagement,
          "training_assignment",
          publishedPolicy,
          "published-digest",
          id(146),
        ]);
        const grantHolderPid = (await grantHolder.query("select pg_backend_pid() as pid")).rows[0]
          .pid;
        await laterPublisher.query("begin");
        const publisherPid = (await laterPublisher.query("select pg_backend_pid() as pid")).rows[0]
          .pid;
        const pendingPublication = laterPublisher.query(
          "insert into public.athlete_coaching_write_policy_versions(id,scope_key,effective_from,jurisdiction,terms_text,content_digest) values($1,'training_assignment',now(),'US','later','later-digest')",
          [laterPublishedPolicy],
        );
        void pendingPublication.catch(() => undefined);
        let blocked = false;
        for (let attempt = 0; attempt < 1000 && !blocked; attempt++)
          blocked = (
            await grantHolder.query("select $1::int=any(pg_blocking_pids($2::int)) as blocked", [
              grantHolderPid,
              publisherPid,
            ])
          ).rows[0].blocked;
        assert.equal(
          blocked,
          true,
          "same-scope policy publication waits for grant even across organizations",
        );
        await grantHolder.query("commit");
        await pendingPublication;
        await laterPublisher.query("commit");
        assert.equal(
          (
            await laterPublisher.query(
              "select policy_version_id from public.athlete_coaching_write_grants where id=$1",
              [secondGrant.rows[0]?.id],
            )
          ).rows[0]?.policy_version_id,
          publishedPolicy,
          "grant retains policy current before later publication",
        );
      } finally {
        await grantHolder.query("rollback").catch(() => undefined);
        await grantHolder.end();
        await laterPublisher.query("rollback").catch(() => undefined);
        laterPublisher.release();
      }
      const holder = await pool.connect();
      const waiter = new Client({ connectionString, statement_timeout: 5000 });
      try {
        await waiter.connect();
        await waiter.query("begin");
        await waiter.query("set local role service_role");
        await holder.query("begin");
        await holder.query("select id from public.organizations where id=$1 for update", [org]);
        const holderPid = (await holder.query("select pg_backend_pid() as pid")).rows[0].pid;
        const waiterPid = (await waiter.query("select pg_backend_pid() as pid")).rows[0].pid;
        const pending = waiter.query(grant, [
          athlete,
          org,
          engagement,
          "schedule_modification",
          schedulePolicy,
          "schedule-digest",
          id(138),
        ]);
        void pending.catch(() => undefined);
        await new Promise<void>((resolve) => setImmediate(resolve));
        let blocked = false;
        for (let i = 0; i < 1000 && !blocked; i++)
          blocked = (
            await holder.query("select $1::int=any(pg_blocking_pids($2::int)) as blocked", [
              holderPid,
              waiterPid,
            ])
          ).rows[0].blocked;
        assert.equal(blocked, true, "grant must serialize behind organization authority lock");
        await holder.query("rollback");
        await assert.rejects(() => pending, /active write grant already exists/);
        await waiter.query("rollback");
      } finally {
        await holder.query("rollback").catch(() => undefined);
        holder.release();
        await waiter.end();
      }
      assert.equal(
        (
          await pool.query(
            "select count(*)::int as count from public.organization_audit_events where organization_id=$1 and action like 'athlete.coaching_write_%'",
            [org],
          )
        ).rows[0]?.count,
        4,
        "one immutable audit receipt per terminal mutation",
      );
    },
  );
  console.log(
    "[coaching:write-grants] restricted RPC grant/revoke, scopes, replay, replacement, read separation, and lock serialization passed",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
