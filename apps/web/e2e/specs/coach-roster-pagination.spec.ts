import type { Page } from "@playwright/test";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations/normalized-power";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activitySegments,
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  dailyTrainingLoad,
  integrations,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profileAthleteState,
  profileGoals,
  profiles,
  providerSyncState,
} from "@repo/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import type { E2EActorFactory } from "../support/actors";
import { type E2EDrizzleTransaction, withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("coach pages through visual roster evidence without leaking unshared athlete facts", async ({
  athleteActor,
  athletePage,
  actorFactory,
  coachActor,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Paged visual roster");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`paged-roster-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/i);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");

  const assigned = [athleteActor, ...(await createAthletes(actorFactory, 22))];
  const unassigned = await actorFactory.create("athlete", {
    fullName: "Excluded roster sentinel",
    label: "excluded roster sentinel",
  });
  const membershipId = e2eIdentity.uuid("coach-membership");
  const engagements = new Map(
    assigned.map((athlete, index) => [athlete.profileId, e2eIdentity.uuid(`engagement-${index}`)]),
  );
  await withLocalE2EDatabase((database) =>
    database.db
      .update(profiles)
      .set({ full_name: "Paged roster athlete 00" })
      .where(eq(profiles.id, athleteActor.profileId)),
  );
  const ordered = await withLocalE2EDatabase((database) =>
    database.db
      .select({ fullName: profiles.full_name, profileId: profiles.id, username: profiles.username })
      .from(profiles)
      .where(
        inArray(
          profiles.id,
          assigned.map((athlete) => athlete.profileId),
        ),
      )
      .orderBy(asc(profiles.id)),
  );
  if (ordered.length !== 23) throw new Error("Expected exactly 23 assigned athlete identities");
  const [fresh, stalePartial, unshared] = ordered.slice(20);
  if (!fresh || !stalePartial || !unshared) throw new Error("Expected three second-page athletes");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const historical = historicalObservations();

  await withLocalE2EDatabase(async (database) =>
    database.typedTransaction(async (tx) => {
      await tx.insert(organizationMemberships).values({
        id: membershipId,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await tx.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: membershipId,
        role_key: "coach",
      });
      await tx.insert(coachingEngagements).values(
        assigned.map((athlete) => ({
          id: engagements.get(athlete.profileId) ?? "",
          organization_id: organizationId,
          athlete_profile_id: athlete.profileId,
        })),
      );
      await tx.insert(coachingAssignments).values(
        assigned.map((athlete) => ({
          organization_id: organizationId,
          engagement_id: engagements.get(athlete.profileId) ?? "",
          coach_membership_id: membershipId,
          assignment_kind: "primary" as const,
        })),
      );
      await tx
        .update(profiles)
        .set({ planning_timezone: "America/Los_Angeles" })
        .where(inArray(profiles.id, [fresh.profileId, stalePartial.profileId]));
      for (const scope of ["metrics", "activities", "goals"] as const) {
        const policyId = e2eIdentity.uuid(`policy-${scope}`);
        await tx.insert(athleteConsentPolicyVersions).values({
          id: policyId,
          scope_key: scope,
          effective_from: new Date(Date.now() - 1_000),
          jurisdiction: "e2e",
          terms_text: "Disposable paged roster consent",
          content_digest: `sha256:${policyId}`,
        });
        await tx.insert(athleteDataSharingConsents).values(
          [fresh, stalePartial].map((athlete) => ({
            organization_id: organizationId,
            engagement_id: engagements.get(athlete.profileId) ?? "",
            athlete_profile_id: athlete.profileId,
            scope_key: scope,
            policy_version_id: policyId,
            granted_by_profile_id: athlete.profileId,
          })),
        );
      }
      await tx.insert(profileAthleteState).values([
        {
          profile_id: fresh.profileId,
          source_revision: 1,
          published_revision: 1,
          fitness: 61,
          fatigue: 24,
          evidence_confidence: 0.8,
          computed_at: new Date(),
        },
        {
          profile_id: stalePartial.profileId,
          source_revision: 2,
          published_revision: 1,
          fitness: 79,
          fatigue: 48,
          evidence_confidence: 0.8,
          computed_at: new Date(),
        },
      ]);
      await tx.insert(dailyTrainingLoad).values([
        {
          profile_id: fresh.profileId,
          planning_date: today,
          common_load: 17,
          fitness: 61,
          fatigue: 24,
          form: 37,
          coverage_status: "complete",
          contributing_activity_count: 1,
          omitted_activity_count: 0,
          source_revision: 1,
          calculation_version: "e2e-paged-roster-v1",
        },
        {
          profile_id: stalePartial.profileId,
          planning_date: today,
          common_load: 29,
          fitness: 79,
          fatigue: 48,
          form: 31,
          coverage_status: "partial",
          contributing_activity_count: 1,
          omitted_activity_count: 1,
          source_revision: 1,
          calculation_version: "e2e-paged-roster-v1",
        },
      ]);
      await tx.insert(profileGoals).values({
        id: e2eIdentity.uuid("fresh-goal"),
        profile_id: fresh.profileId,
        title: "Paged roster target",
        priority: 1,
        activity_category: "run",
        target_date: "2027-03-01",
        target_payload: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 5_000,
          target_time_s: 1_500,
        },
        created_at: new Date(),
        updated_at: new Date(),
      });
      await seedFreshHistoricalEvidence({
        athleteProfileId: fresh.profileId,
        identity: e2eIdentity,
        observations: historical,
        transaction: tx,
      });
    }),
  );

  const page = await coachActor.createPage(`/organizations/${organizationId}/athletes`);
  const roster = page.getByRole("list", { name: "Assigned athletes" });
  await expect(page.getByRole("heading", { name: "Assigned athletes" })).toBeVisible();
  await expect(roster.getByRole("link")).toHaveCount(20);
  await expect(
    page.getByText(unassigned.username ?? "Excluded roster sentinel", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search assigned athletes" })
    .fill("Paged roster athlete");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/organizations/${organizationId}/athletes\\?q=Paged(?:%20|\\+)roster(?:%20|\\+)athlete$`,
    ),
  );
  await expect(roster.getByRole("link")).toHaveCount(20);
  await page.getByRole("link", { name: "Next page of athletes", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/organizations/${organizationId}/athletes\\?q=Paged(?:%20|\\+)roster(?:%20|\\+)athlete&cursor=${ordered[19]?.profileId}$`,
    ),
  );
  await expect(roster.getByRole("link")).toHaveCount(3);
  await expect(roster).toContainText(fresh.fullName ?? "");
  await expect(roster).toContainText(stalePartial.fullName ?? "");
  await expect(roster).toContainText(unshared.fullName ?? "");
  await expect(roster).toContainText("Fresh");
  await expect(roster).toContainText("stale · partial coverage");
  await expect(roster.getByText("Unshared", { exact: true })).toHaveCount(3);
  await expect(roster).not.toContainText(ordered[0]?.fullName ?? "");
  await expect(
    page.getByText(unassigned.username ?? "Excluded roster sentinel", { exact: false }),
  ).toHaveCount(0);

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await prepareFullPageCapture(page);
    await page.screenshot({
      path: testInfo.outputPath(`coach-roster-page-two-${viewport.width}.png`),
      fullPage: true,
      scale: "css",
    });
    await roster
      .locator(`a[href="/organizations/${organizationId}/athletes/${fresh.profileId}"]`)
      .focus();
    await page.keyboard.press("Enter");
    await waitForAppHydration(page);
    await expect(page).toHaveURL(
      new RegExp(`/organizations/${organizationId}/athletes/${fresh.profileId}$`),
    );
    await page.locator("summary").filter({ hasText: "Training context and shared data" }).click();
    await expect(page.getByText("61.0", { exact: true })).toBeVisible();
    await expect(page.getByText("24.0", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Historical training state" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Historical training state/ })).toBeVisible();
    await expect(
      page.getByText("Recent completed daily Common Load", { exact: true }),
    ).toBeVisible();
    const historyTable = page.getByRole("table");
    await expect(historyTable).toBeVisible();
    expect(await historyTable.getByRole("row").count()).toBeGreaterThanOrEqual(3);
    for (const observation of historical) {
      const observationRow = historyTable.getByRole("row").filter({
        has: page.getByRole("cell", { name: observation.date, exact: true }),
      });
      await expect(observationRow).toHaveCount(1);
      await expect(
        observationRow.getByRole("cell", {
          name: observation.dailyLoad.toFixed(1),
          exact: true,
        }),
      ).toBeVisible();
    }
    await expect(page.getByText(/Historical load is (unavailable|not available)/)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await prepareFullPageCapture(page);
    await page.screenshot({
      path: testInfo.outputPath(`coach-roster-page-two-${viewport.width}-fresh-detail.png`),
      fullPage: true,
      scale: "css",
    });
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(
        `/organizations/${organizationId}/athletes\\?q=Paged(?:%20|\\+)roster(?:%20|\\+)athlete&cursor=${ordered[19]?.profileId}$`,
      ),
    );
    await expect(roster.getByRole("link")).toHaveCount(3);

    await roster
      .locator(`a[href="/organizations/${organizationId}/athletes/${unshared.profileId}"]`)
      .click();
    await waitForAppHydration(page);
    await expect(page).toHaveURL(
      new RegExp(`/organizations/${organizationId}/athletes/${unshared.profileId}$`),
    );
    await expect(page.getByText(unshared.fullName ?? "", { exact: true })).toBeVisible();
    await page.locator("summary").filter({ hasText: "Training context and shared data" }).click();
    await expect(page.getByText("Athlete workspace unavailable")).toBeVisible();
    await expect(page.getByText("61.0", { exact: true })).toHaveCount(0);
    await expect(page.getByText("79.0", { exact: true })).toHaveCount(0);
    await expect(page.getByText("0.0", { exact: true })).toHaveCount(0);
    await expect(page.getByText(historical[0]?.date ?? "", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Paged roster target", { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await prepareFullPageCapture(page);
    await page.screenshot({
      path: testInfo.outputPath(`coach-roster-page-two-${viewport.width}-unshared-detail.png`),
      fullPage: true,
      scale: "css",
    });
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(
        `/organizations/${organizationId}/athletes\\?q=Paged(?:%20|\\+)roster(?:%20|\\+)athlete&cursor=${ordered[19]?.profileId}$`,
      ),
    );
    await expect(roster.getByRole("link")).toHaveCount(3);
    await expect(roster.getByText("Unshared", { exact: true })).toHaveCount(3);
    await prepareFullPageCapture(page);
    await page.screenshot({
      path: testInfo.outputPath(`coach-roster-page-two-${viewport.width}-returned.png`),
      fullPage: true,
      scale: "css",
    });
  }
  await page.close();
});

async function createAthletes(actorFactory: E2EActorFactory, count: number) {
  const athletes = [];
  for (let index = 1; index <= count; index += 1) {
    const ordinal = String(index).padStart(2, "0");
    athletes.push(
      await actorFactory.create("athlete", {
        fullName: `Paged roster athlete ${ordinal}`,
        label: `paged roster athlete ${ordinal}`,
      }),
    );
  }
  return athletes;
}

async function prepareFullPageCapture(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

function historicalObservations() {
  const coverageEnd = new Date();
  coverageEnd.setUTCDate(coverageEnd.getUTCDate() - 1);
  coverageEnd.setUTCHours(23, 59, 59, 999);
  return [210, 180].map((powerWatts, index) => {
    const finishedAt = new Date(coverageEnd);
    finishedAt.setUTCDate(finishedAt.getUTCDate() - (index + 1));
    finishedAt.setUTCHours(12, 0, 0, 0);
    return {
      dailyLoad: (powerWatts / 250) ** 2 * 100,
      finishedAt,
      powerWatts,
      date: finishedAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }),
    };
  });
}

async function seedFreshHistoricalEvidence(input: {
  athleteProfileId: string;
  identity: { uuid(label: string): string };
  observations: ReturnType<typeof historicalObservations>;
  transaction: E2EDrizzleTransaction;
}) {
  const { athleteProfileId, identity, observations, transaction } = input;
  const earliest = observations.at(-1);
  const latest = observations[0];
  if (!earliest || !latest) throw new Error("Historical fixture requires two observations");
  const coverageStart = new Date(earliest.finishedAt);
  coverageStart.setUTCDate(coverageStart.getUTCDate() - 84);
  coverageStart.setUTCHours(0, 0, 0, 0);
  const coverageEnd = new Date(latest.finishedAt);
  coverageEnd.setUTCDate(coverageEnd.getUTCDate() + 1);
  coverageEnd.setUTCHours(23, 59, 59, 999);
  const integrationId = identity.uuid("fresh-history-integration");
  await transaction.insert(integrations).values({
    id: integrationId,
    profile_id: athleteProfileId,
    provider: "wahoo",
    external_id: `history-${integrationId}`,
  });
  await transaction.insert(providerSyncState).values({
    integration_id: integrationId,
    provider: "wahoo",
    resource: "historical_activities",
    sync_mode: "full",
    last_sync_succeeded_at: coverageEnd,
    high_watermark: coverageEnd,
    metadata: {
      activityHistoryCoverage: {
        start: coverageStart.toISOString(),
        end: coverageEnd.toISOString(),
      },
    },
  });
  for (const [index, observation] of observations.entries()) {
    const activityId = identity.uuid(`fresh-history-activity-${index}`);
    const artifactId = identity.uuid(`fresh-history-artifact-${index}`);
    const digestSeed = identity.uuid(`fresh-history-digest-${index}`).replaceAll("-", "");
    const normalizedPower = calculateCyclingNormalizedPower({
      samples: Array.from({ length: 721 }, (_, sampleIndex) => ({
        timestampSeconds: sampleIndex * 5,
        powerWatts: observation.powerWatts,
      })),
    });
    const targets = buildPerformanceTargetFactsFixture({
      athleteId: athleteProfileId,
      asOf: observation.finishedAt.toISOString(),
      bikeThresholdWatts: 250,
      expiresAt: new Date(coverageEnd.getTime() + 365 * 86_400_000).toISOString(),
    });
    await transaction.insert(activities).values({
      id: activityId,
      profile_id: athleteProfileId,
      name: `Paged historical activity ${index + 1}`,
      started_at: new Date(observation.finishedAt.getTime() - 3_600_000),
      finished_at: observation.finishedAt,
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      timing_coverage: "complete",
      segments_revision: 1,
      parser_version: "e2e-paged-history-v1",
      decoded_contract_version: "e2e-paged-history-v1",
      materializer_version: "e2e-paged-history-v1",
      segments_generated_at: observation.finishedAt,
      athlete_state_common_load: observation.dailyLoad,
      athlete_state_activity_category: "bike",
      athlete_state_evidence_confidence: 0.9,
      athlete_state_capability_distance_meters: 1_000,
      athlete_state_capability_duration_minutes: 60,
      athlete_state_input_version: "e2e-paged-history-v1",
      athlete_state_computed_at: observation.finishedAt,
      performance_target_snapshot: {
        contractVersion: "completed-activity-performance-target-snapshot-v2",
        capturedAt: observation.finishedAt.toISOString(),
        publishedRevision: 1,
        publicationStatus: "available",
        targets,
      },
      created_at: observation.finishedAt,
      updated_at: observation.finishedAt,
    });
    await transaction.insert(activityArtifacts).values({
      id: artifactId,
      profile_id: athleteProfileId,
      digest_algorithm: "sha256",
      digest: `${digestSeed}${digestSeed}`,
      byte_size: 1_024,
      bucket: "activity-files",
      path: `artifacts/sha256/${athleteProfileId}/${digestSeed}${digestSeed}`,
      media_type: "application/vnd.ant.fit",
      format: "fit",
      availability: "accepted",
      first_accepted_at: observation.finishedAt,
    });
    await transaction.insert(activityArtifactLinks).values({
      id: identity.uuid(`fresh-history-link-${index}`),
      activity_id: activityId,
      artifact_id: artifactId,
      profile_id: athleteProfileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: observation.finishedAt,
    });
    await transaction.insert(activitySegments).values({
      id: identity.uuid(`fresh-history-segment-${index}`),
      activity_id: activityId,
      profile_id: athleteProfileId,
      ordinal: 0,
      role: "activity",
      activity_category: "bike",
      start_offset_ms: 0,
      end_offset_ms: 3_600_000,
      source_artifact_id: artifactId,
      source_session_index: 0,
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 3_600_000, movingMs: 3_600_000 },
        distanceMeters: 20_000,
        averagePowerWatts: observation.powerWatts,
        normalizedPowerResult: normalizedPower,
      },
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      segment_revision: 1,
      parser_version: "e2e-paged-history-v1",
      materializer_version: "e2e-paged-history-v1",
      created_at: observation.finishedAt,
    });
  }
}
