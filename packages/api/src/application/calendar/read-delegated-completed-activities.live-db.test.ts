import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { db, pool } from "@repo/db/client";
import { activities, activityPlans, activitySegments, plannedSessions } from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { activeCalendarRelationship, caller, person } from "./delegated-calendar.live-db.fixtures";

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

describe("delegated completed activities live DB projection", () => {
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
          elapsedMs: 3_600_000,
          planningDate: "2026-11-04",
          sessionId: runSessionId,
        },
        {
          activityCategory: "bike",
          activityId: importedBikeId,
          distanceMeters: 40_000,
          elapsedMs: 7_200_000,
          planningDate: "2026-11-03",
          sessionId: bikeSessionId,
        },
        {
          activityCategory: "strength",
          activityId: manualActivityId,
          distanceMeters: null,
          elapsedMs: null,
          planningDate: "2026-11-02",
          sessionId: manualSessionId,
        },
        {
          activityCategory: null,
          activityId: missingCategoryActivityId,
          distanceMeters: 5_000,
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
      "planningDate",
      "sessionId",
    ]);
    expect(JSON.stringify(response)).not.toContain("Sensitive");
  });
});

afterAll(async () => pool.end());
