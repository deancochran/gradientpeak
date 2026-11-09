import { createHash, randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityPlans,
  activitySegments,
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  plannedSessions,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { reconcileGeneratedActivityEvidence } from "../../../../packages/api/src/application/activities/reconcile-activity-evidence";
import { analyzeParsedActivityFile } from "../../../../packages/api/src/application/activity-file-ingestion/analyze-parsed-activity-file";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { type E2EDrizzleDatabase, withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

function structureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256").update(stringifyCanonicalJson(structure)).digest("hex")}`;
}

async function expectOpaqueDarkColorContrast(
  page: import("@playwright/test").Page,
  selector: string,
) {
  const colors = await page.locator(selector).evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D color conversion is unavailable.");
    const toSrgb = (color: string) => {
      context.fillStyle = "rgb(1, 2, 3)";
      const sentinel = context.fillStyle;
      context.fillStyle = color;
      if (context.fillStyle === sentinel && color !== sentinel)
        throw new Error(`Unsupported CSS color: ${color}`);
      context.clearRect(0, 0, 1, 1);
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      if (red === undefined || green === undefined || blue === undefined || alpha !== 255)
        throw new Error(`Transparent or unreadable CSS color: ${color}`);
      return [red, green, blue] as const;
    };
    const luminance = (rgb: readonly number[]) =>
      rgb
        .map((channel) => channel / 255)
        .map((channel) =>
          channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
        )
        .reduce((sum, channel, index) => sum + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
    const style = getComputedStyle(element);
    const foreground = toSrgb(style.color);
    const background = toSrgb(style.backgroundColor);
    const [light = 0, dark = 0] = [luminance(foreground), luminance(background)].sort(
      (left, right) => right - left,
    );
    return {
      background,
      backgroundLuminance: luminance(background),
      contrast: (light + 0.05) / (dark + 0.05),
      foreground,
    };
  });
  expect(colors.backgroundLuminance, `${selector} must be a dark opaque surface`).toBeLessThan(0.1);
  expect(colors.contrast, `${selector} must meet AA text contrast`).toBeGreaterThanOrEqual(4.5);
}

async function seedBikeActivity(input: {
  db: E2EDrizzleDatabase;
  profileId: string;
  completedAt: Date;
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
      summary: { totalTime: 1_800, totalDistance: 15_000, avgPower: 250, avgHeartRate: 170 },
      records: Array.from({ length: 1_801 }, (_, second) => ({
        sessionMessageIndex: 0,
        timestamp: new Date(startedAt.getTime() + second * 1_000),
        power: 250,
        heartRate: 170,
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
  await input.db.transaction(async (transaction) => {
    await transaction.insert(activities).values({
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
      parser_version: "coach-zones-e2e-v1",
      decoded_contract_version: "coach-zones-e2e-v1",
      materializer_version: "coach-zones-e2e-v1",
      segments_generated_at: input.completedAt,
    });
    await transaction.insert(activityArtifacts).values({
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
    await transaction.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: activityId,
      artifact_id: artifactId,
      profile_id: input.profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: input.completedAt,
    });
    await transaction.insert(activitySegments).values(
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
          source_artifact_id: source?.kind === "artifact" ? artifactId : null,
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
          parser_version: "coach-zones-e2e-v1",
          materializer_version: "coach-zones-e2e-v1",
          created_at: input.completedAt,
        };
      }),
    );
  });
  await input.db.transaction((transaction) =>
    reconcileGeneratedActivityEvidence(transaction, {
      activityId,
      profileId: input.profileId,
      efforts: analysis.effortsToInsert,
      detectedLTHR: analysis.detectedLTHR,
      now: new Date(input.completedAt.getTime() + 1_000),
    }),
  );
}

test("assigned coach sees canonical bike zones without leaking them after metrics consent ends", async ({
  athleteActor,
  athletePage,
  actorFactory,
  coachActor,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Zones acceptance");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`zones-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(
    /\/organizations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/dashboard$/i,
  );
  const organizationId = new URL(athletePage.url()).pathname.match(
    /\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/dashboard$/i,
  )?.[1];
  if (!organizationId)
    throw new Error("Organization creation did not navigate to a UUID dashboard.");

  const calendarOnlyAthlete = await actorFactory.create("athlete", {
    label: "calendar-only-athlete",
  });
  const coachMembershipId = e2eIdentity.uuid("coach-membership");
  const metricsEngagementId = e2eIdentity.uuid("metrics-engagement");
  const calendarOnlyEngagementId = e2eIdentity.uuid("calendar-only-engagement");
  const metricsConsentId = e2eIdentity.uuid("metrics-consent");
  const planningDate = new Date().toISOString().slice(0, 10);
  const plannedStructure = activityPlanStructureSchema.parse({
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: e2eIdentity.uuid("planned-bike-step"),
        name: "Disposable calendar session",
        duration: { type: "time", seconds: 1_800 },
        targets: [{ type: "RPE", intensity: 5 }],
      },
    ],
  });
  const seedPlannedSession = (profileId: string, prefix: string) => {
    const planId = e2eIdentity.uuid(`${prefix}-plan`);
    const operationId = e2eIdentity.uuid(`${prefix}-operation`).replaceAll("-", "");
    return {
      plan: {
        id: planId,
        profile_id: profileId,
        name: `Private ${prefix} plan`,
        semantic_hash: activityPlanSemanticHash({
          structure: plannedStructure,
          trainingIntent: "general_maintenance",
        }),
        structure: plannedStructure,
        structure_hash: structureHash(plannedStructure),
      },
      session: {
        id: e2eIdentity.uuid(`${prefix}-session`),
        profile_id: profileId,
        activity_plan_id: planId,
        contract_version: "planned-session-v1",
        session_revision: 1,
        planning_date: planningDate,
        original_target_date: planningDate,
        source_kind: "direct" as const,
        direct_operation_id: operationId,
        idempotency_key: `direct:${operationId}`,
        status: "scheduled" as const,
      },
    };
  };
  const metricsPlan = seedPlannedSession(athleteActor.profileId, "metrics");
  const calendarOnlyPlan = seedPlannedSession(calendarOnlyAthlete.profileId, "calendar-only");

  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (transaction) => {
      await transaction.insert(organizationMemberships).values({
        id: coachMembershipId,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await transaction.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: coachMembershipId,
        role_key: "coach",
      });
      await transaction.insert(coachingEngagements).values([
        {
          id: metricsEngagementId,
          organization_id: organizationId,
          athlete_profile_id: athleteActor.profileId,
        },
        {
          id: calendarOnlyEngagementId,
          organization_id: organizationId,
          athlete_profile_id: calendarOnlyAthlete.profileId,
        },
      ]);
      await transaction.insert(coachingAssignments).values([
        {
          organization_id: organizationId,
          engagement_id: metricsEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
        {
          organization_id: organizationId,
          engagement_id: calendarOnlyEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
      ]);
      const metricsPolicyId = e2eIdentity.uuid("metrics-policy");
      const calendarPolicyId = e2eIdentity.uuid("calendar-policy");
      await transaction.insert(athleteConsentPolicyVersions).values([
        {
          id: metricsPolicyId,
          scope_key: "metrics",
          effective_from: new Date(Date.now() - 1_000),
          jurisdiction: "e2e",
          terms_text: "Disposable metrics consent",
          content_digest: `sha256:${metricsPolicyId}`,
        },
        {
          id: calendarPolicyId,
          scope_key: "calendar",
          effective_from: new Date(Date.now() - 1_000),
          jurisdiction: "e2e",
          terms_text: "Disposable calendar consent",
          content_digest: `sha256:${calendarPolicyId}`,
        },
      ]);
      await transaction.insert(athleteDataSharingConsents).values([
        {
          id: metricsConsentId,
          organization_id: organizationId,
          engagement_id: metricsEngagementId,
          athlete_profile_id: athleteActor.profileId,
          scope_key: "metrics",
          policy_version_id: metricsPolicyId,
          granted_by_profile_id: athleteActor.profileId,
        },
        {
          organization_id: organizationId,
          engagement_id: metricsEngagementId,
          athlete_profile_id: athleteActor.profileId,
          scope_key: "calendar",
          policy_version_id: calendarPolicyId,
          granted_by_profile_id: athleteActor.profileId,
        },
        {
          organization_id: organizationId,
          engagement_id: calendarOnlyEngagementId,
          athlete_profile_id: calendarOnlyAthlete.profileId,
          scope_key: "calendar",
          policy_version_id: calendarPolicyId,
          granted_by_profile_id: calendarOnlyAthlete.profileId,
        },
      ]);
      await transaction.insert(activityPlans).values([metricsPlan.plan, calendarOnlyPlan.plan]);
      await transaction
        .insert(plannedSessions)
        .values([metricsPlan.session, calendarOnlyPlan.session]);
    });
    await seedBikeActivity({
      db: database.db,
      profileId: athleteActor.profileId,
      completedAt: new Date(Date.now() - 3_600_000),
    });
  });

  const page = await coachActor.createPage(
    `/organizations/${organizationId}/athletes/${athleteActor.profileId}`,
  );
  await waitForAppHydration(page);
  await expect(page.getByRole("heading", { name: "Current training state" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Planned sessions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bike zones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Power" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LTHR" })).toBeVisible();
  await expect(page.getByText("237.5 W", { exact: true })).toBeVisible();
  await expect(page.getByText("170 bpm", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Rounded policy reference boundaries; not exact classification thresholds."),
  ).toHaveCount(2);
  await expect(page.getByText(planningDate, { exact: true }).first()).toBeVisible();
  await expectOpaqueDarkColorContrast(page, '[data-testid="coach-athlete-zones"]');
  await expectOpaqueDarkColorContrast(
    page,
    '[data-testid="coach-athlete-zones"] section[aria-label="Power"]',
  );

  for (const viewport of [
    { width: 1440, height: 1000, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`coach-athlete-zones-ready-${viewport.name}.png`),
      fullPage: true,
      scale: "css",
    });
  }

  await withLocalE2EDatabase(async (database) =>
    database.db
      .update(athleteDataSharingConsents)
      .set({ ended_at: new Date() })
      .where(eq(athleteDataSharingConsents.id, metricsConsentId)),
  );
  await page.goto(`/organizations/${organizationId}/athletes/${athleteActor.profileId}`);
  await waitForAppHydration(page);
  await expect(page.getByText("Bike metrics are not available for this athlete.")).toBeVisible();
  await expect(page.getByText("237.5 W", { exact: true })).toHaveCount(0);
  await expect(page.getByText(planningDate, { exact: true }).first()).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 1000, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`coach-athlete-zones-denied-${viewport.name}.png`),
      fullPage: true,
      scale: "css",
    });
  }

  await page.getByRole("button", { name: "Switch athlete" }).click();
  await page
    .getByRole("list", { name: "Switch athlete" })
    .locator(`a[href="/organizations/${organizationId}/athletes/${calendarOnlyAthlete.profileId}"]`)
    .click();
  await expect(page.getByRole("heading", { name: "Planned sessions" })).toBeVisible();
  await expect(page.getByText(planningDate, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Bike metrics are not available for this athlete.")).toBeVisible();
  await expect(page.getByText("237.5 W", { exact: true })).toHaveCount(0);
  await page.close();
});
