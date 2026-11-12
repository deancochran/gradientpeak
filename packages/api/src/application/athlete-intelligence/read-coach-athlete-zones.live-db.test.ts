/** Disposable PostgreSQL acceptance proof for coach-visible canonical bike zones. */
import { randomUUID } from "node:crypto";
import { resolveProfileZones } from "@repo/core";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activitySegments,
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profiles,
  thresholds,
  users,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { athleteIntelligenceRouter } from "../../routers/athlete-intelligence";
import { organizationsRouter } from "../../routers/organizations";
import { reconcileGeneratedActivityEvidence } from "../activities/reconcile-activity-evidence";
import { analyzeParsedActivityFile } from "../activity-file-ingestion/analyze-parsed-activity-file";

function context(db: DrizzleDbClient, id: string) {
  return {
    auth: { lookupInput: { clientType: "web", headers: new Headers() }, session: null },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id, email: "zones@disposable.test" } },
    trpcSource: "vitest-live-db",
  } as never;
}

async function person(db: DrizzleDbClient, name: string) {
  const id = randomUUID();
  const email = `${id}@zones.test`;
  await db.insert(users).values({ id, name, email, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email,
    full_name: name,
    username: `${name}-${id.slice(0, 8)}`,
    onboarding_status: "completed",
  });
  return id;
}

async function seedCoachAccessGraph(input: {
  db: DrizzleDbClient;
  coachId: string;
  athleteId: string;
  scope: "metrics" | "training";
  roleRevoked?: boolean;
  assignmentEnded?: boolean;
  consentExpired?: boolean;
}) {
  const now = Date.now();
  const grantedAt = new Date(now - 120_000);
  const ownerId = input.roleRevoked ? await person(input.db, "Revocation owner") : input.coachId;
  const organizationId = randomUUID();
  const organization = await organizationsRouter.createCaller(context(input.db, ownerId)).create({
    organizationId,
    name: "Authorization fixture",
    slug: `authorization-${organizationId}`,
    timezone: "UTC",
  });
  const coachMembershipId = input.roleRevoked ? randomUUID() : organization.membershipId;
  if (input.roleRevoked) {
    await input.db.insert(organizationMemberships).values({
      id: coachMembershipId,
      organization_id: organizationId,
      profile_id: input.coachId,
    });
  }
  await input.db.insert(organizationMembershipRoleGrants).values({
    organization_id: organizationId,
    membership_id: coachMembershipId,
    role_key: "coach",
    granted_at: grantedAt,
  });
  const engagementId = randomUUID();
  await input.db.insert(coachingEngagements).values({
    id: engagementId,
    organization_id: organizationId,
    athlete_profile_id: input.athleteId,
  });
  await input.db.insert(coachingAssignments).values({
    organization_id: organizationId,
    engagement_id: engagementId,
    coach_membership_id: coachMembershipId,
    assignment_kind: "primary",
    assigned_at: grantedAt,
    ...(input.assignmentEnded ? { ended_at: new Date(now - 60_000) } : {}),
  });
  const policyId = randomUUID();
  await input.db.insert(athleteConsentPolicyVersions).values({
    id: policyId,
    scope_key: input.scope,
    effective_from: new Date(now - 180_000),
    jurisdiction: "US",
    terms_text: `${input.scope} authority`,
    content_digest: randomUUID(),
  });
  await input.db.insert(athleteDataSharingConsents).values({
    id: randomUUID(),
    organization_id: organizationId,
    engagement_id: engagementId,
    athlete_profile_id: input.athleteId,
    scope_key: input.scope,
    policy_version_id: policyId,
    granted_by_profile_id: input.athleteId,
    granted_at: grantedAt,
    ...(input.consentExpired ? { expires_at: new Date(now - 60_000) } : {}),
  });
  if (input.roleRevoked) {
    await organizationsRouter.createCaller(context(input.db, ownerId)).staffRoles.revoke({
      organizationId,
      membershipId: coachMembershipId,
      role: "coach",
      operationId: randomUUID(),
    });
  }
  return organizationId;
}

async function seedBikeActivity(input: {
  db: DrizzleDbClient;
  profileId: string;
  completedAt: Date;
  includeHeartRate: boolean;
}) {
  const activityId = randomUUID();
  const artifactId = randomUUID();
  const startedAt = new Date(input.completedAt.getTime() - 1_800_000);
  const digestSeed = randomUUID().replaceAll("-", "");
  const digest = `${digestSeed}${digestSeed}`;
  const analysis = await analyzeParsedActivityFile(input.db, {
    activityId,
    profileId: input.profileId,
    artifactId,
    refreshWeather: false,
    parsedData: {
      metadata: { startTime: startedAt, type: "cycling" },
      summary: {
        totalTime: 1_800,
        totalDistance: 15_000,
        avgPower: 250,
        ...(input.includeHeartRate ? { avgHeartRate: 170 } : {}),
      },
      records: Array.from({ length: 1_801 }, (_, second) => ({
        sessionMessageIndex: 0,
        timestamp: new Date(startedAt.getTime() + second * 1_000),
        power: 250,
        ...(input.includeHeartRate ? { heartRate: 170 } : {}),
      })),
      segments: [
        {
          sessionMessageIndex: 0,
          role: "activity",
          activity_category: "bike",
          rawSport: "cycling",
          startTime: startedAt,
          endTime: input.completedAt,
        },
      ],
    },
  });
  await input.db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id: activityId,
      profile_id: input.profileId,
      name: "Canonical bike threshold fixture",
      started_at: startedAt,
      finished_at: input.completedAt,
      elapsed_ms: analysis.summaryValues.elapsed_ms,
      active_ms: analysis.summaryValues.active_ms,
      moving_ms: analysis.summaryValues.moving_ms,
      timing_coverage: analysis.summaryValues.timing_coverage,
      segments_revision: 1,
      parser_version: "coach-zones-live-v1",
      decoded_contract_version: "coach-zones-live-v1",
      materializer_version: "coach-zones-live-v1",
      segments_generated_at: input.completedAt,
    });
    await tx.insert(activityArtifacts).values({
      id: artifactId,
      profile_id: input.profileId,
      digest_algorithm: "sha256",
      digest,
      byte_size: 1024,
      bucket: "activity-files",
      path: `artifacts/sha256/${input.profileId}/${digest}`,
      media_type: "application/vnd.ant.fit",
      format: "fit",
      availability: "accepted",
      first_accepted_at: input.completedAt,
    });
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: activityId,
      artifact_id: artifactId,
      profile_id: input.profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: input.completedAt,
    });
    // This is the segment persistence mapping used by submit-activity. Analyzer
    // identities, rather than fixture-generated UUIDs, bind the generated efforts.
    await tx.insert(activitySegments).values(
      analysis.segmentSet.segments.map((segment) => {
        const timing = segment.summary.timing;
        const source = segment.source;
        return {
          id: segment.id,
          activity_id: activityId,
          profile_id: input.profileId,
          ordinal: segment.ordinal,
          role: segment.role,
          activity_category: segment.role === "activity" ? segment.activity_category : null,
          start_offset_ms: segment.startOffsetMs,
          end_offset_ms: segment.endOffsetMs,
          source_artifact_id:
            source?.kind === "artifact" ? (artifactId ?? source.artifactId) : null,
          source_session_index:
            source?.kind === "artifact" ? (source.sessionMessageIndex ?? null) : null,
          source_message_index: source?.kind === "artifact" ? (source.messageIndex ?? null) : null,
          raw_type_string: typeof source?.rawType === "string" ? source.rawType : null,
          raw_type_integer: typeof source?.rawType === "number" ? source.rawType : null,
          raw_sport_string: typeof source?.rawSport === "string" ? source.rawSport : null,
          raw_sport_integer: typeof source?.rawSport === "number" ? source.rawSport : null,
          raw_sub_sport_string: typeof source?.rawSubSport === "string" ? source.rawSubSport : null,
          raw_sub_sport_integer:
            typeof source?.rawSubSport === "number" ? source.rawSubSport : null,
          summary: segment.summary,
          summary_version: 1,
          timing_coverage: timing.timingCoverage,
          active_ms: "activeMs" in timing ? (timing.activeMs ?? null) : null,
          moving_ms: "movingMs" in timing ? (timing.movingMs ?? null) : null,
          segment_revision: 1,
          parser_version: "coach-zones-live-v1",
          materializer_version: "coach-zones-live-v1",
          created_at: input.completedAt,
        };
      }),
    );
  });
  const acceptedSegments = await input.db
    .select({ id: activitySegments.id, sourceArtifactId: activitySegments.source_artifact_id })
    .from(activitySegments)
    .where(eq(activitySegments.activity_id, activityId));
  const acceptedSegmentIds = new Set(
    acceptedSegments
      .filter((segment) => segment.sourceArtifactId === artifactId)
      .map((segment) => segment.id),
  );
  expect(analysis.effortsToInsert).not.toHaveLength(0);
  expect(
    analysis.effortsToInsert.every((effort) => acceptedSegmentIds.has(effort.segment_id)),
  ).toBe(true);
  await input.db.transaction((tx) =>
    reconcileGeneratedActivityEvidence(tx, {
      activityId,
      profileId: input.profileId,
      efforts: analysis.effortsToInsert,
      detectedLTHR: analysis.detectedLTHR,
      now: new Date(input.completedAt.getTime() + 1_000),
    }),
  );
}

it("authorizes only current metrics-sharing coaches and returns canonical bike POWER and LTHR zones", async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for disposable coach-zone proof");
  const client = createDbClient({ url });
  try {
    const db = client.db;
    const athlete = await person(db, "Athlete");
    const coach = await person(db, "Coach");
    const organizationId = randomUUID();
    const organization = await organizationsRouter.createCaller(context(db, coach)).create({
      organizationId,
      name: "Zones fixture",
      slug: `zones-${organizationId}`,
      timezone: "UTC",
    });
    await db.insert(organizationMembershipRoleGrants).values({
      organization_id: organizationId,
      membership_id: organization.membershipId,
      role_key: "coach",
    });
    const engagementId = randomUUID();
    const assignmentId = randomUUID();
    await db
      .insert(coachingEngagements)
      .values({ id: engagementId, organization_id: organizationId, athlete_profile_id: athlete });
    await db.insert(coachingAssignments).values({
      id: assignmentId,
      organization_id: organizationId,
      engagement_id: engagementId,
      coach_membership_id: organization.membershipId,
      assignment_kind: "primary",
    });
    const policyId = randomUUID();
    await db.insert(athleteConsentPolicyVersions).values({
      id: policyId,
      scope_key: "metrics",
      effective_from: new Date(Date.now() - 60_000),
      jurisdiction: "US",
      terms_text: "metrics",
      content_digest: randomUUID(),
    });
    const consentId = randomUUID();
    const caller = athleteIntelligenceRouter.createCaller(context(db, coach));
    const request = { organizationId, athleteProfileId: athlete };
    await expect(caller.getCoachAthleteBikeZones(request)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.getCoachAthleteBikeZones({ ...request, organizationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const completedAt = new Date(Date.now() - 3_600_000);
    await seedBikeActivity({ db, profileId: athlete, completedAt, includeHeartRate: false });
    await db.insert(athleteDataSharingConsents).values({
      id: consentId,
      organization_id: organizationId,
      engagement_id: engagementId,
      athlete_profile_id: athlete,
      scope_key: "metrics",
      policy_version_id: policyId,
      granted_by_profile_id: athlete,
    });
    const powerOnly = await caller.getCoachAthleteBikeZones(request);
    expect(powerOnly.power).toMatchObject({
      zoneAvailability: "available",
      source: { availability: "available", value: 237.5 },
    });
    expect(powerOnly.heartRate).toMatchObject({
      zoneAvailability: "unavailable",
      zones: null,
      source: { availability: "unavailable", value: null },
    });

    await seedBikeActivity({
      db,
      profileId: athlete,
      completedAt: new Date(completedAt.getTime() + 60_000),
      includeHeartRate: true,
    });
    await expect(
      db
        .select({ metric: thresholds.metric, value: thresholds.value })
        .from(thresholds)
        .where(
          and(
            eq(thresholds.profile_id, athlete),
            eq(thresholds.activity_category, "bike"),
            eq(thresholds.metric, "lthr"),
          ),
        ),
    ).resolves.toContainEqual({ metric: "lthr", value: 170 });
    const result = await caller.getCoachAthleteBikeZones(request);
    const expected = resolveProfileZones({
      thresholds: { bike: { status: "available", value: 237.5 } },
      heartRate: { bike: { lthr: { status: "available", valueBpm: 170 } } },
    });
    expect(result.power).toMatchObject({
      zoneAvailability: "available",
      source: { availability: "available", value: 237.5 },
      zones: expected.powerZones && expect.any(Object),
    });
    expect(result.heartRate).toMatchObject({
      zoneAvailability: "available",
      source: { availability: "available", value: 170 },
      zones: expected.heartRateZones && expect.any(Object),
    });
    expect(result.power.zones).toEqual(
      expected.powerZones &&
        (({ policyVersion: _policyVersion, ...zones }) => zones)(expected.powerZones),
    );
    expect(result.heartRate.zones).toEqual(
      expected.heartRateZones &&
        (({ policyVersion: _policyVersion, ...zones }) => zones)(expected.heartRateZones),
    );
    expect(Object.keys(result).sort()).toEqual([
      "activityCategory",
      "asOf",
      "heartRate",
      "power",
      "publication",
    ]);
    expect(JSON.stringify(result)).not.toContain(athlete);
    expect(JSON.stringify(result)).not.toContain(organizationId);

    const expiredOrganizationId = await seedCoachAccessGraph({
      db,
      coachId: coach,
      athleteId: athlete,
      scope: "metrics",
      consentExpired: true,
    });
    await expect(
      caller.getCoachAthleteBikeZones({
        organizationId: expiredOrganizationId,
        athleteProfileId: athlete,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const wrongScopeOrganizationId = await seedCoachAccessGraph({
      db,
      coachId: coach,
      athleteId: athlete,
      scope: "training",
    });
    await expect(
      caller.getCoachAthleteBikeZones({
        organizationId: wrongScopeOrganizationId,
        athleteProfileId: athlete,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const revokedRoleOrganizationId = await seedCoachAccessGraph({
      db,
      coachId: coach,
      athleteId: athlete,
      scope: "metrics",
      roleRevoked: true,
    });
    await expect(
      caller.getCoachAthleteBikeZones({
        organizationId: revokedRoleOrganizationId,
        athleteProfileId: athlete,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const endedAssignmentOrganizationId = await seedCoachAccessGraph({
      db,
      coachId: coach,
      athleteId: athlete,
      scope: "metrics",
      assignmentEnded: true,
    });
    await expect(
      caller.getCoachAthleteBikeZones({
        organizationId: endedAssignmentOrganizationId,
        athleteProfileId: athlete,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  } finally {
    await client.close();
  }
});
