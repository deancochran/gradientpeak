import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createApiContext } from "../../context";
import { appRouter } from "../index";

const ids: string[] = [];
const organizationIds: string[] = [];

async function seedProfile(label: string) {
  const id = randomUUID();
  const email = `${id}@delegated-access.test`;
  const now = new Date();
  ids.push(id);
  await db.execute(sql`
    insert into users (id, name, email, email_verified, created_at, updated_at)
    values (${id}::uuid, ${label}, ${email}, true, ${now}, ${now})
  `);
  await db.execute(sql`
    insert into profiles (id, email, full_name, username, language, preferred_units, onboarding_status, is_public, created_at, updated_at)
    values (${id}::uuid, ${email}, ${label}, ${`delegate-${id.slice(0, 8)}`}, 'en', 'metric', 'completed', true, ${now}, ${now})
  `);
  return id;
}

async function createCaller(userId: string) {
  return appRouter.createCaller(
    await createApiContext({
      db,
      headers: new Headers({ "x-api-source": "vitest-live" }),
      auth: {
        session: {
          sessionId: randomUUID(),
          transport: "cookie",
          user: { id: userId, email: `${userId}@delegated-access.test`, emailVerified: true },
        },
      },
    }),
  );
}

async function activeRelationship(coachId: string, athleteId: string) {
  const organizationId = randomUUID();
  const membershipId = randomUUID();
  const engagementId = randomUUID();
  organizationIds.push(organizationId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`set constraints all deferred`);
    await tx.execute(sql`
      insert into organizations (id, created_by_profile_id, root_owner_membership_id, name, slug, timezone)
      values (
        ${organizationId}::uuid,
        ${coachId}::uuid,
        ${membershipId}::uuid,
        ${`Coaching ${organizationId}`}::text,
        ${`coaching-${organizationId}`}::text,
        'UTC'
      )
    `);
    await tx.execute(sql`
      insert into organization_memberships (id, organization_id, profile_id)
      values (${membershipId}::uuid, ${organizationId}::uuid, ${coachId}::uuid)
    `);
    await tx.execute(sql`
      insert into organization_membership_role_grants (organization_id, membership_id, role_key)
      values
        (${organizationId}::uuid, ${membershipId}::uuid, 'admin'),
        (${organizationId}::uuid, ${membershipId}::uuid, 'coach')
    `);
    await tx.execute(sql`
      insert into coaching_engagements (id, organization_id, athlete_profile_id)
      values (${engagementId}::uuid, ${organizationId}::uuid, ${athleteId}::uuid)
    `);
    await tx.execute(sql`
      insert into coaching_assignments (organization_id, engagement_id, coach_membership_id, assignment_kind)
      values (${organizationId}::uuid, ${engagementId}::uuid, ${membershipId}::uuid, 'primary')
    `);
  });
  return { engagementId, membershipId, organizationId };
}

async function seedGoalsConsent(
  relationship: { engagementId: string; organizationId: string },
  athleteId: string,
) {
  const policyVersionId = randomUUID();
  await db.execute(sql`
    insert into athlete_consent_policy_versions
      (id, scope_key, effective_from, jurisdiction, terms_text, content_digest)
    values
      (${policyVersionId}::uuid, 'goals', now() - interval '1 second', 'US',
       'Goals sharing terms', ${`sha256:${policyVersionId}`} )
  `);
  await db.execute(sql`
    insert into athlete_data_sharing_consents
      (organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id)
    values
      (${relationship.organizationId}::uuid, ${relationship.engagementId}::uuid, ${athleteId}::uuid,
       'goals', ${policyVersionId}::uuid, ${athleteId}::uuid)
  `);
}

function goalInput(profileId: string, title: string) {
  return {
    profile_id: profileId,
    target_date: "2026-12-31",
    title,
    priority: 1,
    activity_category: "run" as const,
    target_payload: {
      type: "event_performance" as const,
      activity_category: "run" as const,
      distance_m: 5000,
      target_time_s: 1500,
    },
  };
}

async function readPersistedGoalTitle(goalId: string) {
  const goals = await db.execute(sql`select title from profile_goals where id = ${goalId}::uuid`);
  return goals.rows[0]?.title;
}

async function waitForRelationshipLock(blockerPid: number, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: number }>(
      `
      select count(*)::int as count
      from pg_stat_activity
      where datname = current_database()
        and wait_event_type = 'Lock'
        and query ilike '%coaching_assignments%'
        and $1 = any(pg_blocking_pids(pid))
    `,
      [blockerPid],
    );
    if (Number(result.rows[0]?.count) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the procedure to block on coaching_assignments");
}

async function within<T>(promise: Promise<T>, timeoutMs = 5_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

afterEach(async () => {
  const seededProfileIds = ids.splice(0);
  const seededOrganizationIds = organizationIds.splice(0);
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("begin");
    // Immutable authority rows reject ordinary deletes. This superuser-only,
    // transaction-local setting disables triggers on the teardown connection
    // without weakening mutation behavior exercised by the application calls.
    await client.query("set local session_replication_role = replica");
    await client.query("delete from profile_goals where profile_id = any($1::uuid[])", [
      seededProfileIds,
    ]);
    await client.query(
      "delete from organization_audit_events where organization_id = any($1::uuid[])",
      [seededOrganizationIds],
    );
    await client.query(
      "delete from athlete_data_sharing_consents where organization_id = any($1::uuid[])",
      [seededOrganizationIds],
    );
    await client.query("delete from coaching_assignments where organization_id = any($1::uuid[])", [
      seededOrganizationIds,
    ]);
    await client.query(
      "delete from organization_membership_role_grants where organization_id = any($1::uuid[])",
      [seededOrganizationIds],
    );
    await client.query("delete from coaching_engagements where organization_id = any($1::uuid[])", [
      seededOrganizationIds,
    ]);
    await client.query(
      "delete from organization_memberships where organization_id = any($1::uuid[])",
      [seededOrganizationIds],
    );
    await client.query("delete from organizations where id = any($1::uuid[])", [
      seededOrganizationIds,
    ]);
    await client.query("delete from profiles where id = any($1::uuid[])", [seededProfileIds]);
    await client.query("delete from users where id = any($1::uuid[])", [seededProfileIds]);
    await client.query("commit");
    committed = true;

    const residual = await client.query(
      `select
        (select count(*)::int from users where id = any($1::uuid[])) as users,
        (select count(*)::int from profiles where id = any($1::uuid[])) as profiles,
        (select count(*)::int from profile_goals where profile_id = any($1::uuid[])) as goals,
        (select count(*)::int from organizations where id = any($2::uuid[])) as organizations,
        (select count(*)::int from organization_memberships where organization_id = any($2::uuid[])) as memberships,
        (select count(*)::int from organization_membership_role_grants where organization_id = any($2::uuid[])) as role_grants,
        (select count(*)::int from coaching_engagements where organization_id = any($2::uuid[])) as engagements,
        (select count(*)::int from coaching_assignments where organization_id = any($2::uuid[])) as assignments,
        (select count(*)::int from athlete_data_sharing_consents where organization_id = any($2::uuid[])) as consents,
        (select count(*)::int from organization_audit_events where organization_id = any($2::uuid[])) as audit_events`,
      [seededProfileIds, seededOrganizationIds],
    );
    expect(residual.rows[0]).toEqual({
      assignments: 0,
      audit_events: 0,
      consents: 0,
      engagements: 0,
      goals: 0,
      memberships: 0,
      organizations: 0,
      profiles: 0,
      role_grants: 0,
      users: 0,
    });
  } finally {
    if (!committed) await client.query("rollback").catch(() => undefined);
    client.release();
  }
});

afterAll(async () => pool.end());

describe("delegated profile write revocation through appRouter", () => {
  it("uses the production goal resolver for published athlete state and hides denied goals", async () => {
    const athleteId = await seedProfile("Intelligence athlete");
    const coachId = await seedProfile("Intelligence coach");
    const unrelatedId = await seedProfile("Unrelated intelligence caller");
    const relationship = await activeRelationship(coachId, athleteId);
    await seedGoalsConsent(relationship, athleteId);
    const owner = await createCaller(athleteId);
    const coach = await createCaller(coachId);
    const unrelated = await createCaller(unrelatedId);
    const goal = await owner.goals.create(goalInput(athleteId, "Coach-visible intelligence goal"));

    await expect(
      coach.athleteIntelligence.getGoalAssessment({ goalId: goal.id }),
    ).resolves.toMatchObject({
      freshness: "unavailable",
      rebuildStatus: "unavailable",
      assessment: null,
    });
    await expect(
      unrelated.athleteIntelligence.getGoalAssessment({ goalId: goal.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      coach.athleteIntelligence.getGoalAssessment({ goalId: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      coach.profileAccess.revoke({ coach_id: coachId, athlete_id: athleteId }),
    ).resolves.toEqual({ revoked: true });
    await expect(
      coach.athleteIntelligence.getGoalAssessment({ goalId: goal.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("persists owner and active coach writes, then fails closed for every revoked delegated mutation", async () => {
    const athleteId = await seedProfile("Athlete");
    const coachId = await seedProfile("Coach");
    const relationship = await activeRelationship(coachId, athleteId);
    const coach = await createCaller(coachId);

    const goal = await coach.goals.create(goalInput(athleteId, "Active coach goal"));

    expect(await readPersistedGoalTitle(goal.id)).toBe("Active coach goal");

    await expect(
      coach.profileAccess.revoke({ coach_id: coachId, athlete_id: athleteId }),
    ).resolves.toEqual({ revoked: true });
    await expect(
      db.execute(sql`
        select
          (select ended_at is not null from coaching_engagements where id = ${relationship.engagementId}::uuid) as engagement_ended,
          (select count(*)::int from coaching_assignments where engagement_id = ${relationship.engagementId}::uuid and ended_at is null) as active_assignments,
          (select count(*)::int from organization_membership_role_grants where membership_id = ${relationship.membershipId}::uuid and role_key = 'coach' and revoked_at is null) as active_coach_grants
      `),
    ).resolves.toMatchObject({
      rows: [
        expect.objectContaining({
          engagement_ended: true,
          active_assignments: 0,
          active_coach_grants: 0,
        }),
      ],
    });

    await expect(
      coach.goals.create(goalInput(athleteId, "Revoked coach goal")),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      coach.goals.update({ id: goal.id, data: { title: "Revoked update" } }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(coach.goals.delete({ id: goal.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await readPersistedGoalTitle(goal.id)).toBe("Active coach goal");
  });

  it("rejects an unrelated caller from revoking an exact coach-athlete relationship", async () => {
    const athleteId = await seedProfile("Athlete");
    const coachId = await seedProfile("Coach");
    const unrelatedId = await seedProfile("Unrelated");
    await activeRelationship(coachId, athleteId);

    await expect(
      (await createCaller(unrelatedId)).profileAccess.revoke({
        coach_id: coachId,
        athlete_id: athleteId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("commits a waiting delegated procedure before a later revoke", async () => {
    const athleteId = await seedProfile("Athlete");
    const coachId = await seedProfile("Coach");
    const relationship = await activeRelationship(coachId, athleteId);
    const coach = await createCaller(coachId);
    const held = await pool.connect();
    const blockerPid = Number((await held.query("select pg_backend_pid() as pid")).rows[0]?.pid);
    let committed = false;

    try {
      await held.query("begin");
      await held.query("select id from coaching_assignments where engagement_id = $1 for update", [
        relationship.engagementId,
      ]);
      const write = coach.goals.create(goalInput(athleteId, "Committed before revoke"));
      await waitForRelationshipLock(blockerPid);
      const revoke = coach.profileAccess.revoke({ coach_id: coachId, athlete_id: athleteId });

      await held.query("commit");
      committed = true;
      await expect(within(write)).resolves.toMatchObject({ title: "Committed before revoke" });
      await expect(within(revoke)).resolves.toEqual({ revoked: true });
    } finally {
      if (!committed) await held.query("rollback").catch(() => undefined);
      held.release();
    }

    const goals = await db.execute(
      sql`select title from profile_goals where profile_id = ${athleteId}::uuid`,
    );
    expect(goals.rows[0]?.title).toBe("Committed before revoke");
  }, 15_000);

  it("commits revoke before a later waiting delegated procedure, which then fails closed", async () => {
    const athleteId = await seedProfile("Athlete");
    const coachId = await seedProfile("Coach");
    const relationship = await activeRelationship(coachId, athleteId);
    const coach = await createCaller(coachId);
    const held = await pool.connect();
    const blockerPid = Number((await held.query("select pg_backend_pid() as pid")).rows[0]?.pid);
    let committed = false;

    try {
      await held.query("begin");
      await held.query("select id from coaching_assignments where engagement_id = $1 for update", [
        relationship.engagementId,
      ]);
      const revoke = coach.profileAccess.revoke({ coach_id: coachId, athlete_id: athleteId });
      await waitForRelationshipLock(blockerPid);
      const write = coach.goals.create(goalInput(athleteId, "Blocked by revoke"));

      await held.query("commit");
      committed = true;
      await expect(within(revoke)).resolves.toEqual({ revoked: true });
      await expect(within(write)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      if (!committed) await held.query("rollback").catch(() => undefined);
      held.release();
    }

    const goals = await db.execute(
      sql`select count(*)::int as count from profile_goals where profile_id = ${athleteId}::uuid`,
    );
    expect(goals.rows[0]?.count).toBe(0);
  }, 15_000);
});
