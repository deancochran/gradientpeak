import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityPlans,
  activitySegments,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingCompletionReviews,
  organizationGroupAthletes,
  organizationGroupCoachAssignments,
  organizationGroups,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  plannedSessions,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withProfileFencedRepeatableReadSnapshot } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { activeCalendarRelationship, caller, person } from "./delegated-calendar.live-db.fixtures";

async function waitForBlockedAdvisoryLock(key: number, description: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      `select exists (
         select 1 from pg_locks
         where locktype = 'advisory' and granted = false and classid = 0 and objid = $1
       ) as waiting`,
      [key],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`${description} did not reach the advisory barrier`);
}

async function installPausedWriteTrigger(input: {
  advisoryKey: number;
  condition: string;
  event: "insert" | "update";
  table: "coaching_completion_reviews" | "organization_membership_role_grants" | "planned_sessions";
}) {
  const suffix = randomUUID().replaceAll("-", "");
  const functionName = `pause_completion_review_${suffix}`;
  const triggerName = `pause_completion_review_${suffix}`;
  await pool.query(`
    create function public."${functionName}"() returns trigger language plpgsql as $$
    begin
      perform set_config('lock_timeout', '3000ms', true);
      perform set_config('statement_timeout', '5000ms', true);
      if ${input.condition} then
        perform pg_advisory_xact_lock(${input.advisoryKey});
      end if;
      return new;
    end
    $$
  `);
  await pool.query(`
    create trigger "${triggerName}" before ${input.event} on public.${input.table}
    for each row execute function public."${functionName}"()
  `);
  return async () => {
    await pool.query(`drop trigger if exists "${triggerName}" on public.${input.table}`);
    await pool.query(`drop function if exists public."${functionName}"()`);
  };
}

const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "99999999-9999-4999-8999-999999999999",
      name: "Delegated completion",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "RPE", intensity: 5 }],
    },
  ],
});

async function createPlan(profileId: string) {
  const id = randomUUID();
  await db.insert(activityPlans).values({
    id,
    name: "Private delegated completion plan",
    profile_id: profileId,
    semantic_hash: activityPlanSemanticHash({ structure, trainingIntent: "general_maintenance" }),
    structure,
    structure_hash: activityPlanStructureHash(structure),
  });
  return id;
}

async function createSession(input: {
  activityId?: string;
  activityPlanId: string;
  planningDate: string;
  profileId: string;
}) {
  const source = {
    kind: "direct" as const,
    operationId: `delegated_${randomUUID().replaceAll("-", "")}`,
  };
  const session = plannedSessionSchema.parse({
    activityPlanId: input.activityPlanId,
    contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
    id: randomUUID(),
    idempotencyKey: plannedSessionIdempotencyKey(source),
    lifecycle: { status: "scheduled" },
    originalTargetDate: input.planningDate,
    planningDate: input.planningDate,
    profileId: input.profileId,
    sessionRevision: 1,
    source,
  });
  await createDrizzlePlannedSessionRepository(db).createOwned({
    profileId: input.profileId,
    session,
  });
  if (input.activityId) {
    await db
      .update(plannedSessions)
      .set({
        completed_activity_id: input.activityId,
        completion_outcome: "full",
        completion_state: "linked",
        linked_at: new Date("2026-11-04T12:00:00.000Z"),
        status: "completed",
      })
      .where(eq(plannedSessions.id, session.id));
  }
  return session.id;
}

async function seedPublicReconciliationCase(label: string) {
  const athleteId = await person(`${label} athlete`);
  const coachId = await person(`${label} coach`);
  const relationship = await activeCalendarRelationship(coachId, athleteId, {
    includeConsent: false,
  });
  const planId = await createPlan(athleteId);
  const manualActivityId = randomUUID();
  const importedActivityId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.insert(activities).values([
      {
        id: manualActivityId,
        profile_id: athleteId,
        name: "Private manual evidence",
        entry_provenance: "manual",
        manual_activity_category: "run",
        diary_date: "2026-11-04",
        diary_timezone: "UTC",
        elapsed_ms: 1_800_000,
        distance_meters: 5_000,
        parser_version: "manual-diary-v1",
        decoded_contract_version: "manual-diary-v1",
        materializer_version: "manual-diary-v1",
      },
      {
        id: importedActivityId,
        profile_id: athleteId,
        name: "Private imported evidence",
        started_at: new Date("2026-11-04T10:00:00.000Z"),
        finished_at: new Date("2026-11-04T11:00:00.000Z"),
        elapsed_ms: 3_600_000,
        distance_meters: 10_000,
        parser_version: "delegated-completion-live-v1",
        decoded_contract_version: "delegated-completion-live-v1",
        materializer_version: "delegated-completion-live-v1",
      },
    ]);
    await tx.insert(activitySegments).values({
      id: randomUUID(),
      activity_id: importedActivityId,
      profile_id: athleteId,
      ordinal: 0,
      role: "activity",
      activity_category: "run",
      start_offset_ms: 0,
      end_offset_ms: 3_600_000,
      summary: { version: 1, timing: { timingCoverage: "unavailable" } },
      summary_version: 1,
      timing_coverage: "unavailable",
      parser_version: "delegated-completion-live-v1",
      materializer_version: "delegated-completion-live-v1",
    });
  });
  const sessionId = await createSession({
    activityId: manualActivityId,
    activityPlanId: planId,
    planningDate: "2026-11-04",
    profileId: athleteId,
  });
  await grantScope({ ...relationship, athleteId, scope: "activities" });
  await grantScope({ ...relationship, athleteId, scope: "calendar" });
  const coach = await caller(coachId);
  const athlete = await caller(athleteId);
  const request = { athleteProfileId: athleteId, organizationId: relationship.organizationId };
  const listed = await coach.calendar.coachAthleteCompletedActivities(request);
  const evidenceVersion = listed.items[0]?.evidenceVersion;
  if (!evidenceVersion) throw new Error("Expected pending manual completion evidence");
  return {
    athlete,
    athleteId,
    coach,
    evidenceVersion,
    importedActivityId,
    relationship,
    request,
    sessionId,
  };
}

async function grantScope(input: {
  athleteId: string;
  engagementId: string;
  organizationId: string;
  scope: "activities" | "calendar";
}) {
  const policyVersionId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`insert into athlete_consent_policy_versions
      (id, scope_key, effective_from, jurisdiction, terms_text, content_digest)
      values (${policyVersionId}::uuid, ${input.scope}, now() - interval '1 second', 'US', 'Completion terms', ${`sha256:${policyVersionId}`})`);
    await tx.execute(sql`insert into athlete_data_sharing_consents
      (organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id)
      values (${input.organizationId}::uuid, ${input.engagementId}::uuid, ${input.athleteId}::uuid, ${input.scope}, ${policyVersionId}::uuid, ${input.athleteId}::uuid)`);
  });
}

async function replaceDirectAuthorityWithGroup(input: {
  engagementId: string;
  membershipId: string;
  organizationId: string;
}) {
  const [organization] = await db
    .select({ rootOwnerMembershipId: organizations.root_owner_membership_id })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId));
  if (!organization) throw new Error("Expected organization");
  const groupId = randomUUID();
  const groupAthleteMembershipId = randomUUID();
  const groupCoachAssignmentId = randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .update(coachingAssignments)
      .set({ ended_at: new Date() })
      .where(
        and(
          eq(coachingAssignments.engagement_id, input.engagementId),
          eq(coachingAssignments.coach_membership_id, input.membershipId),
        ),
      );
    await tx.insert(organizationGroups).values({
      id: groupId,
      organization_id: input.organizationId,
      name: "Completion review group",
      created_by_membership_id: organization.rootOwnerMembershipId,
    });
    await tx.insert(organizationGroupAthletes).values({
      id: groupAthleteMembershipId,
      organization_id: input.organizationId,
      group_id: groupId,
      engagement_id: input.engagementId,
      added_by_membership_id: organization.rootOwnerMembershipId,
    });
    await tx.insert(organizationGroupCoachAssignments).values({
      id: groupCoachAssignmentId,
      organization_id: input.organizationId,
      group_id: groupId,
      coach_membership_id: input.membershipId,
      assigned_by_membership_id: organization.rootOwnerMembershipId,
    });
  });
  return {
    groupAthleteMembershipId,
    groupCoachAssignmentId,
    rootOwnerMembershipId: organization.rootOwnerMembershipId,
  };
}

describe("delegated completed activities live DB projection", () => {
  it("uses retained exact group authority for real-router acknowledgement and fails closed after group revocation", async () => {
    const seeded = await seedPublicReconciliationCase("Group completion acknowledgement");
    const group = await replaceDirectAuthorityWithGroup({
      engagementId: seeded.relationship.engagementId,
      membershipId: seeded.relationship.membershipId,
      organizationId: seeded.relationship.organizationId,
    });
    const listed = await seeded.coach.calendar.coachAthleteCompletedActivities(seeded.request);
    const evidenceVersion = listed.items[0]?.evidenceVersion;
    if (!evidenceVersion) throw new Error("Expected group-authorized completion");
    const acknowledgement = { ...seeded.request, evidenceVersion, sessionId: seeded.sessionId };
    await expect(
      Promise.all([
        seeded.coach.calendar.acknowledgeCoachAthleteCompletedActivity(acknowledgement),
        seeded.coach.calendar.acknowledgeCoachAthleteCompletedActivity(acknowledgement),
      ]),
    ).resolves.toEqual(
      expect.arrayContaining([{ outcome: "acknowledged" }, { outcome: "already_acknowledged" }]),
    );
    const [review] = await db
      .select({
        authorityKind: coachingCompletionReviews.review_authority_kind,
        groupAthleteMembershipId: coachingCompletionReviews.reviewed_by_group_athlete_membership_id,
        groupCoachAssignmentId: coachingCompletionReviews.reviewed_by_group_coach_assignment_id,
      })
      .from(coachingCompletionReviews)
      .where(eq(coachingCompletionReviews.session_id, seeded.sessionId));
    expect(review).toEqual({
      authorityKind: "group",
      groupAthleteMembershipId: group.groupAthleteMembershipId,
      groupCoachAssignmentId: group.groupCoachAssignmentId,
    });
    const foreignCoach = await person("Foreign group completion coach");
    await expect(
      (await caller(foreignCoach)).calendar.coachAthleteCompletedActivities(seeded.request),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const unassignedCoach = await person("Unassigned group completion coach");
    await db.transaction(async (tx) => {
      const membershipId = randomUUID();
      await tx.insert(organizationMemberships).values({
        id: membershipId,
        organization_id: seeded.relationship.organizationId,
        profile_id: unassignedCoach,
      });
      await tx.insert(organizationMembershipRoleGrants).values({
        organization_id: seeded.relationship.organizationId,
        membership_id: membershipId,
        role_key: "coach",
      });
    });
    await expect(
      (await caller(unassignedCoach)).calendar.coachAthleteCompletedActivities(seeded.request),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db
      .update(organizationGroupCoachAssignments)
      .set({ ended_at: new Date(), ended_by_membership_id: group.rootOwnerMembershipId })
      .where(eq(organizationGroupCoachAssignments.id, group.groupCoachAssignmentId));
    await expect(
      seeded.coach.calendar.coachAthleteCompletedActivities(seeded.request),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      db
        .select({ id: coachingCompletionReviews.id })
        .from(coachingCompletionReviews)
        .where(eq(coachingCompletionReviews.session_id, seeded.sessionId)),
    ).resolves.toHaveLength(1);
  });

  it("denies a group-only coach when the athlete's exact group membership ends", async () => {
    const seeded = await seedPublicReconciliationCase("Group athlete membership revocation");
    const group = await replaceDirectAuthorityWithGroup({
      engagementId: seeded.relationship.engagementId,
      membershipId: seeded.relationship.membershipId,
      organizationId: seeded.relationship.organizationId,
    });
    await expect(
      seeded.coach.calendar.coachAthleteCompletedActivities(seeded.request),
    ).resolves.toMatchObject({
      items: [{ sessionId: seeded.sessionId }],
    });
    await db
      .update(organizationGroupAthletes)
      .set({ ended_at: new Date(), ended_by_membership_id: group.rootOwnerMembershipId })
      .where(eq(organizationGroupAthletes.id, group.groupAthleteMembershipId));
    await expect(
      seeded.coach.calendar.coachAthleteCompletedActivities(seeded.request),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("requires both scopes and returns only linked completed activity allowlist rows", async () => {
    const athleteId = await person("Completed activities athlete");
    const coachId = await person("Completed activities coach");
    const otherAthleteId = await person("Other completed activities athlete");
    const relationship = await activeCalendarRelationship(coachId, athleteId, {
      includeConsent: false,
    });
    const athletePlanId = await createPlan(athleteId);
    const otherPlanId = await createPlan(otherAthleteId);
    const importedRunId = randomUUID();
    const importedBikeId = randomUUID();
    const manualActivityId = randomUUID();
    const missingCategoryActivityId = randomUUID();
    const unlinkedActivityId = randomUUID();
    const otherActivityId = randomUUID();

    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.insert(activities).values([
        {
          id: importedRunId,
          profile_id: athleteId,
          name: "Sensitive imported run name",
          started_at: new Date("2026-11-04T10:00:00.000Z"),
          finished_at: new Date("2026-11-04T11:00:00.000Z"),
          elapsed_ms: 3_600_000,
          distance_meters: 10_000,
          parser_version: "delegated-completion-live-v1",
          decoded_contract_version: "delegated-completion-live-v1",
          materializer_version: "delegated-completion-live-v1",
        },
        {
          id: importedBikeId,
          profile_id: athleteId,
          name: "Sensitive imported bike name",
          started_at: new Date("2026-11-03T10:00:00.000Z"),
          finished_at: new Date("2026-11-03T12:00:00.000Z"),
          elapsed_ms: 7_200_000,
          distance_meters: 40_000,
          parser_version: "delegated-completion-live-v1",
          decoded_contract_version: "delegated-completion-live-v1",
          materializer_version: "delegated-completion-live-v1",
        },
        {
          id: manualActivityId,
          profile_id: athleteId,
          name: "Sensitive manual name",
          notes: "Sensitive manual notes",
          entry_provenance: "manual",
          manual_activity_category: "strength",
          diary_date: "2026-11-03",
          diary_timezone: "UTC",
          elapsed_ms: null,
          distance_meters: null,
          parser_version: "manual-diary-v1",
          decoded_contract_version: "manual-diary-v1",
          materializer_version: "manual-diary-v1",
        },
        {
          id: missingCategoryActivityId,
          profile_id: athleteId,
          name: "Sensitive missing category name",
          started_at: new Date("2026-11-01T10:00:00.000Z"),
          finished_at: new Date("2026-11-01T11:00:00.000Z"),
          elapsed_ms: 3_600_000,
          distance_meters: 5_000,
          parser_version: "delegated-completion-live-v1",
          decoded_contract_version: "delegated-completion-live-v1",
          materializer_version: "delegated-completion-live-v1",
        },
        {
          id: unlinkedActivityId,
          profile_id: athleteId,
          name: "Unlinked activity",
          started_at: new Date("2026-10-31T10:00:00.000Z"),
          finished_at: new Date("2026-10-31T11:00:00.000Z"),
          elapsed_ms: 3_600_000,
          distance_meters: 5_000,
          parser_version: "delegated-completion-live-v1",
          decoded_contract_version: "delegated-completion-live-v1",
          materializer_version: "delegated-completion-live-v1",
        },
        {
          id: otherActivityId,
          profile_id: otherAthleteId,
          name: "Other athlete activity",
          started_at: new Date("2026-11-05T10:00:00.000Z"),
          finished_at: new Date("2026-11-05T11:00:00.000Z"),
          elapsed_ms: 3_600_000,
          distance_meters: 5_000,
          parser_version: "delegated-completion-live-v1",
          decoded_contract_version: "delegated-completion-live-v1",
          materializer_version: "delegated-completion-live-v1",
        },
      ]);
      await tx.insert(activitySegments).values(
        [[importedRunId, "run"] as const, [importedBikeId, "bike"] as const].map(
          ([activityId, activityCategory]) => ({
            id: randomUUID(),
            activity_id: activityId,
            profile_id: athleteId,
            ordinal: 0,
            role: "activity" as const,
            activity_category: activityCategory,
            start_offset_ms: 0,
            end_offset_ms: 3_600_000,
            summary: { version: 1, timing: { timingCoverage: "unavailable" } },
            summary_version: 1,
            timing_coverage: "unavailable" as const,
            parser_version: "delegated-completion-live-v1",
            materializer_version: "delegated-completion-live-v1",
          }),
        ),
      );
    });
    const [runSessionId, bikeSessionId, manualSessionId, missingSessionId] = await Promise.all([
      createSession({
        activityId: importedRunId,
        activityPlanId: athletePlanId,
        planningDate: "2026-11-04",
        profileId: athleteId,
      }),
      createSession({
        activityId: importedBikeId,
        activityPlanId: athletePlanId,
        planningDate: "2026-11-03",
        profileId: athleteId,
      }),
      createSession({
        activityId: manualActivityId,
        activityPlanId: athletePlanId,
        planningDate: "2026-11-02",
        profileId: athleteId,
      }),
      createSession({
        activityId: missingCategoryActivityId,
        activityPlanId: athletePlanId,
        planningDate: "2026-11-01",
        profileId: athleteId,
      }),
    ]);
    await createSession({
      activityPlanId: athletePlanId,
      planningDate: "2026-10-31",
      profileId: athleteId,
    });
    await createSession({
      activityId: otherActivityId,
      activityPlanId: otherPlanId,
      planningDate: "2026-11-05",
      profileId: otherAthleteId,
    });

    const coach = await caller(coachId);
    const request = { athleteProfileId: athleteId, organizationId: relationship.organizationId };
    await grantScope({ ...relationship, athleteId, scope: "activities" });
    await expect(coach.calendar.coachAthleteCompletedActivities(request)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await grantScope({ ...relationship, athleteId, scope: "calendar" });

    const response = await coach.calendar.coachAthleteCompletedActivities(request);
    expect(response).toEqual({
      items: [
        {
          activityCategory: "run",
          activityId: importedRunId,
          distanceMeters: 10_000,
          evidenceVersion: expect.any(String),
          elapsedMs: 3_600_000,
          planningDate: "2026-11-04",
          sessionId: runSessionId,
        },
        {
          activityCategory: "bike",
          activityId: importedBikeId,
          distanceMeters: 40_000,
          evidenceVersion: expect.any(String),
          elapsedMs: 7_200_000,
          planningDate: "2026-11-03",
          sessionId: bikeSessionId,
        },
        {
          activityCategory: "strength",
          activityId: manualActivityId,
          distanceMeters: null,
          evidenceVersion: expect.any(String),
          elapsedMs: null,
          planningDate: "2026-11-02",
          sessionId: manualSessionId,
        },
        {
          activityCategory: null,
          activityId: missingCategoryActivityId,
          distanceMeters: 5_000,
          evidenceVersion: expect.any(String),
          elapsedMs: 3_600_000,
          planningDate: "2026-11-01",
          sessionId: missingSessionId,
        },
      ],
    });
    expect(Object.keys(response.items[0] ?? {}).sort()).toEqual([
      "activityCategory",
      "activityId",
      "distanceMeters",
      "elapsedMs",
      "evidenceVersion",
      "planningDate",
      "sessionId",
    ]);
    expect(JSON.stringify(response)).not.toContain("Sensitive");
  });

  it("acknowledges idempotently, requeues changed evidence, and denies revoked or foreign authority", async () => {
    const athleteId = await person("Completion review athlete");
    const coachId = await person("Completion review coach");
    const foreignCoachId = await person("Completion review foreign coach");
    const relationship = await activeCalendarRelationship(coachId, athleteId, {
      includeConsent: false,
    });
    const foreignRelationship = await activeCalendarRelationship(foreignCoachId, athleteId, {
      includeConsent: false,
    });
    const planId = await createPlan(athleteId);
    const activityId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.insert(activities).values({
        id: activityId,
        profile_id: athleteId,
        name: "Sensitive acknowledgement evidence",
        started_at: new Date("2026-11-04T10:00:00.000Z"),
        finished_at: new Date("2026-11-04T11:00:00.000Z"),
        parser_version: "delegated-completion-live-v1",
        decoded_contract_version: "delegated-completion-live-v1",
        materializer_version: "delegated-completion-live-v1",
      });
      await tx.insert(activitySegments).values({
        id: randomUUID(),
        activity_id: activityId,
        profile_id: athleteId,
        ordinal: 0,
        role: "activity",
        activity_category: "run",
        start_offset_ms: 0,
        end_offset_ms: 3_600_000,
        summary: { version: 1, timing: { timingCoverage: "unavailable" } },
        summary_version: 1,
        timing_coverage: "unavailable",
        parser_version: "delegated-completion-live-v1",
        materializer_version: "delegated-completion-live-v1",
      });
    });
    const sessionId = await createSession({
      activityId,
      activityPlanId: planId,
      planningDate: "2026-11-04",
      profileId: athleteId,
    });
    await grantScope({ ...relationship, athleteId, scope: "activities" });
    await grantScope({ ...relationship, athleteId, scope: "calendar" });
    const coach = await caller(coachId);
    const request = { athleteProfileId: athleteId, organizationId: relationship.organizationId };
    const initial = await coach.calendar.coachAthleteCompletedActivities(request);
    const evidenceVersion = initial.items[0]?.evidenceVersion;
    if (!evidenceVersion) throw new Error("Expected a completion evidence version");
    const acknowledgement = { ...request, evidenceVersion, sessionId };
    const concurrent = await Promise.all([
      coach.calendar.acknowledgeCoachAthleteCompletedActivity(acknowledgement),
      coach.calendar.acknowledgeCoachAthleteCompletedActivity(acknowledgement),
    ]);
    expect(concurrent.sort((left, right) => left.outcome.localeCompare(right.outcome))).toEqual([
      { outcome: "acknowledged" },
      { outcome: "already_acknowledged" },
    ]);
    await expect(
      coach.calendar.acknowledgeCoachAthleteCompletedActivity(acknowledgement),
    ).resolves.toEqual({ outcome: "already_acknowledged" });
    await expect(coach.calendar.coachAthleteCompletedActivities(request)).resolves.toEqual({
      items: [],
    });

    // A completion relink uses the same athlete fence as acknowledgement, so
    // an acknowledgement built from the old queue row is stale afterwards.
    await withProfileFencedRepeatableReadSnapshot(db, athleteId, async (tx) => {
      await tx
        .update(plannedSessions)
        .set({ linked_at: new Date("2026-11-05T12:00:00.000Z") })
        .where(eq(plannedSessions.id, sessionId));
    });
    const changed = await coach.calendar.coachAthleteCompletedActivities(request);
    expect(changed.items).toHaveLength(1);
    const changedEvidenceVersion = changed.items[0]?.evidenceVersion;
    if (!changedEvidenceVersion) throw new Error("Expected requeued completion evidence");
    expect(changedEvidenceVersion).not.toEqual(evidenceVersion);
    await expect(
      coach.calendar.acknowledgeCoachAthleteCompletedActivity(acknowledgement),
    ).resolves.toEqual({ outcome: "stale" });
    await expect(
      coach.calendar.acknowledgeCoachAthleteCompletedActivity({
        ...acknowledgement,
        evidenceVersion: changedEvidenceVersion,
      }),
    ).resolves.toEqual({ outcome: "acknowledged" });

    // Private metadata is not coach-approved evidence and must not requeue a
    // review that already acknowledged the material completion.
    await withProfileFencedRepeatableReadSnapshot(db, athleteId, async (tx) => {
      await tx
        .update(activities)
        .set({
          name: "Changed private title",
          notes: "Changed private notes",
          updated_at: new Date("2026-11-06T12:00:00.000Z"),
        })
        .where(eq(activities.id, activityId));
    });
    await expect(coach.calendar.coachAthleteCompletedActivities(request)).resolves.toEqual({
      items: [],
    });

    // The opposite order is also safe: a committed review stays immutable
    // history, while a fenced material evidence reprocess makes the new
    // version pending.
    await withProfileFencedRepeatableReadSnapshot(db, athleteId, async (tx) => {
      await tx
        .update(activities)
        .set({ segments_revision: 2, updated_at: new Date("2026-11-07T12:00:00.000Z") })
        .where(eq(activities.id, activityId));
    });
    const reprocessed = await coach.calendar.coachAthleteCompletedActivities(request);
    expect(reprocessed.items).toHaveLength(1);
    const reprocessedEvidenceVersion = reprocessed.items[0]?.evidenceVersion;
    if (!reprocessedEvidenceVersion) throw new Error("Expected reprocessed completion evidence");
    expect(reprocessedEvidenceVersion).not.toEqual(changedEvidenceVersion);

    await expect(
      (await caller(foreignCoachId)).calendar.acknowledgeCoachAthleteCompletedActivity({
        ...acknowledgement,
        organizationId: foreignRelationship.organizationId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await caller(foreignCoachId)).calendar.coachAthleteCompletedActivities({
        athleteProfileId: athleteId,
        organizationId: foreignRelationship.organizationId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Reassignment removes the former coach's authority even though its old
    // membership and immutable review history remain retained.
    const replacementCoachId = await person("Completion review replacement coach");
    const replacementMembershipId = randomUUID();
    await db.transaction(async (tx) => {
      await tx
        .update(coachingAssignments)
        // The fixture assignment uses the database clock. End it after its
        // assigned_at value rather than relying on a historical fixed date.
        .set({ ended_at: new Date(Date.now() + 1_000) })
        .where(
          and(
            eq(coachingAssignments.engagement_id, relationship.engagementId),
            eq(coachingAssignments.coach_membership_id, relationship.membershipId),
          ),
        );
      await tx.insert(organizationMemberships).values({
        id: replacementMembershipId,
        organization_id: relationship.organizationId,
        profile_id: replacementCoachId,
      });
      await tx.insert(organizationMembershipRoleGrants).values({
        organization_id: relationship.organizationId,
        membership_id: replacementMembershipId,
        role_key: "coach",
      });
      await tx.insert(coachingAssignments).values({
        organization_id: relationship.organizationId,
        engagement_id: relationship.engagementId,
        coach_membership_id: replacementMembershipId,
        assignment_kind: "primary",
      });
    });
    await expect(
      coach.calendar.acknowledgeCoachAthleteCompletedActivity({
        ...acknowledgement,
        evidenceVersion: reprocessedEvidenceVersion,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(coach.calendar.coachAthleteCompletedActivities(request)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      (await caller(replacementCoachId)).calendar.coachAthleteCompletedActivities(request),
    ).resolves.toMatchObject({ items: [{ sessionId }] });
    await db
      .update(athleteDataSharingConsents)
      .set({ ended_at: new Date() })
      .where(eq(athleteDataSharingConsents.engagement_id, relationship.engagementId));
    await expect(
      (await caller(replacementCoachId)).calendar.acknowledgeCoachAthleteCompletedActivity({
        ...acknowledgement,
        evidenceVersion: reprocessedEvidenceVersion,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await caller(replacementCoachId)).calendar.coachAthleteCompletedActivities(request),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("linearizes acknowledgement and public manual-completion relinking in either order", async () => {
    const acknowledgeFirst = await seedPublicReconciliationCase("Acknowledgement first relink");
    const acknowledgeBarrier = 7_418_521;
    const releaseAcknowledgementPause = await installPausedWriteTrigger({
      advisoryKey: acknowledgeBarrier,
      condition: `new.session_id = '${acknowledgeFirst.sessionId}'::uuid`,
      event: "insert",
      table: "coaching_completion_reviews",
    });
    const acknowledgementLock = await pool.connect();
    let acknowledgementLockHeld = false;
    let acknowledgement: Promise<unknown> | undefined;
    let relink: Promise<unknown> | undefined;
    try {
      await acknowledgementLock.query(
        "set lock_timeout = '3000ms'; set statement_timeout = '5000ms'",
      );
      await acknowledgementLock.query("select pg_advisory_lock($1)", [acknowledgeBarrier]);
      acknowledgementLockHeld = true;
      acknowledgement = acknowledgeFirst.coach.calendar.acknowledgeCoachAthleteCompletedActivity({
        ...acknowledgeFirst.request,
        evidenceVersion: acknowledgeFirst.evidenceVersion,
        sessionId: acknowledgeFirst.sessionId,
      });
      await waitForBlockedAdvisoryLock(acknowledgeBarrier, "acknowledgement");
      relink = acknowledgeFirst.athlete.plannedSessions.linkCompletion({
        activityId: acknowledgeFirst.importedActivityId,
        expectedRevision: 1,
        operationId: randomUUID(),
        outcome: "full",
        profileId: acknowledgeFirst.athleteId,
        sessionId: acknowledgeFirst.sessionId,
      });
      await acknowledgementLock.query("select pg_advisory_unlock($1)", [acknowledgeBarrier]);
      acknowledgementLockHeld = false;
      await expect(acknowledgement).resolves.toEqual({ outcome: "acknowledged" });
      await expect(relink).resolves.toMatchObject({ outcome: "updated" });
      const reviews = await db
        .select({ evidenceVersion: coachingCompletionReviews.evidence_version })
        .from(coachingCompletionReviews)
        .where(eq(coachingCompletionReviews.session_id, acknowledgeFirst.sessionId));
      expect(reviews).toEqual([{ evidenceVersion: acknowledgeFirst.evidenceVersion }]);
      await expect(
        acknowledgeFirst.coach.calendar.coachAthleteCompletedActivities(acknowledgeFirst.request),
      ).resolves.toMatchObject({
        items: [
          expect.objectContaining({
            activityId: acknowledgeFirst.importedActivityId,
            sessionId: acknowledgeFirst.sessionId,
          }),
        ],
      });
    } finally {
      if (acknowledgementLockHeld)
        await acknowledgementLock.query("select pg_advisory_unlock($1)", [acknowledgeBarrier]);
      await acknowledgement?.catch(() => undefined);
      await relink?.catch(() => undefined);
      await releaseAcknowledgementPause();
      acknowledgementLock.release();
    }

    const writerFirst = await seedPublicReconciliationCase("Relink first acknowledgement");
    const relinkBarrier = 7_418_522;
    const releaseRelinkPause = await installPausedWriteTrigger({
      advisoryKey: relinkBarrier,
      condition: `new.id = '${writerFirst.sessionId}'::uuid`,
      event: "update",
      table: "planned_sessions",
    });
    const relinkLock = await pool.connect();
    let relinkLockHeld = false;
    let writer: Promise<unknown> | undefined;
    let staleAcknowledgement: Promise<unknown> | undefined;
    try {
      await relinkLock.query("set lock_timeout = '3000ms'; set statement_timeout = '5000ms'");
      await relinkLock.query("select pg_advisory_lock($1)", [relinkBarrier]);
      relinkLockHeld = true;
      writer = writerFirst.athlete.plannedSessions.linkCompletion({
        activityId: writerFirst.importedActivityId,
        expectedRevision: 1,
        operationId: randomUUID(),
        outcome: "full",
        profileId: writerFirst.athleteId,
        sessionId: writerFirst.sessionId,
      });
      await waitForBlockedAdvisoryLock(relinkBarrier, "public completion relink");
      staleAcknowledgement = writerFirst.coach.calendar.acknowledgeCoachAthleteCompletedActivity({
        ...writerFirst.request,
        evidenceVersion: writerFirst.evidenceVersion,
        sessionId: writerFirst.sessionId,
      });
      await relinkLock.query("select pg_advisory_unlock($1)", [relinkBarrier]);
      relinkLockHeld = false;
      await expect(writer).resolves.toMatchObject({ outcome: "updated" });
      await expect(staleAcknowledgement).resolves.toEqual({ outcome: "stale" });
      await expect(
        db
          .select({ id: coachingCompletionReviews.id })
          .from(coachingCompletionReviews)
          .where(eq(coachingCompletionReviews.session_id, writerFirst.sessionId)),
      ).resolves.toEqual([]);
    } finally {
      if (relinkLockHeld) await relinkLock.query("select pg_advisory_unlock($1)", [relinkBarrier]);
      await writer?.catch(() => undefined);
      await staleAcknowledgement?.catch(() => undefined);
      await releaseRelinkPause();
      relinkLock.release();
    }
  });

  it("denies acknowledgement when a coach-role revocation commits first", async () => {
    const revokedFirst = await seedPublicReconciliationCase("Role revocation acknowledgement");
    const revocationBarrier = 7_418_523;
    const releaseRevocationPause = await installPausedWriteTrigger({
      advisoryKey: revocationBarrier,
      condition: `old.membership_id = '${revokedFirst.relationship.membershipId}'::uuid`,
      event: "update",
      table: "organization_membership_role_grants",
    });
    const revocationLock = await pool.connect();
    let revocationLockHeld = false;
    let revoke: Promise<unknown> | undefined;
    let acknowledgement: Promise<unknown> | undefined;
    try {
      await revocationLock.query("set lock_timeout = '3000ms'; set statement_timeout = '5000ms'");
      await revocationLock.query("select pg_advisory_lock($1)", [revocationBarrier]);
      revocationLockHeld = true;
      revoke = db
        .update(organizationMembershipRoleGrants)
        .set({ revoked_at: new Date() })
        .where(
          and(
            eq(
              organizationMembershipRoleGrants.organization_id,
              revokedFirst.relationship.organizationId,
            ),
            eq(
              organizationMembershipRoleGrants.membership_id,
              revokedFirst.relationship.membershipId,
            ),
            eq(organizationMembershipRoleGrants.role_key, "coach"),
          ),
        )
        .execute();
      await waitForBlockedAdvisoryLock(revocationBarrier, "coach-role revocation");
      acknowledgement = revokedFirst.coach.calendar.acknowledgeCoachAthleteCompletedActivity({
        ...revokedFirst.request,
        evidenceVersion: revokedFirst.evidenceVersion,
        sessionId: revokedFirst.sessionId,
      });
      await revocationLock.query("select pg_advisory_unlock($1)", [revocationBarrier]);
      revocationLockHeld = false;
      await expect(revoke).resolves.toBeDefined();
      await expect(acknowledgement).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        db
          .select({ id: coachingCompletionReviews.id })
          .from(coachingCompletionReviews)
          .where(eq(coachingCompletionReviews.session_id, revokedFirst.sessionId)),
      ).resolves.toEqual([]);
    } finally {
      if (revocationLockHeld)
        await revocationLock.query("select pg_advisory_unlock($1)", [revocationBarrier]);
      await revoke?.catch(() => undefined);
      await acknowledgement?.catch(() => undefined);
      await releaseRevocationPause();
      revocationLock.release();
    }
  });
});

afterAll(async () => pool.end());
