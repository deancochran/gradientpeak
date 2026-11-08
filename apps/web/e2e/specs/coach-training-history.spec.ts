import type { TestInfo } from "@playwright/test";
import { createObservationQuantificationBundle } from "@repo/core";
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
  integrations,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profileAthleteState,
  profilePerformanceEstimates,
  providerSyncState,
} from "@repo/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { readAthleteReadModel } from "../../../../packages/api/src/application/athlete-intelligence/athlete-read-model";
import { withRepeatableReadSnapshot } from "../../../../packages/api/src/db";
import { createActivityAnalysisStore } from "../../../../packages/api/src/infrastructure/repositories";
import {
  buildActivitySegmentDerivedSummaries,
  loadActivitySegmentsByActivityId,
} from "../../../../packages/api/src/lib/activity-analysis";
import { resolveActivitySourceIntegrity } from "../../../../packages/api/src/utils/workload";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("non-admin coach switches assigned athletes without receiving unshared metrics", async ({
  athletePage,
  athleteActor,
  actorFactory,
  coachActor,
  e2eIdentity,
}, testInfo: TestInfo) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Workspace acceptance");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`workspace-${e2eIdentity.uuid("org")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const secondAthlete = await actorFactory.create("athlete", { label: "second athlete" });
  const coachMembershipId = e2eIdentity.uuid("coach-membership");
  const firstEngagementId = e2eIdentity.uuid("first-engagement");
  const secondEngagementId = e2eIdentity.uuid("second-engagement");
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
          id: firstEngagementId,
          organization_id: organizationId,
          athlete_profile_id: athleteActor.profileId,
        },
        {
          id: secondEngagementId,
          organization_id: organizationId,
          athlete_profile_id: secondAthlete.profileId,
        },
      ]);
      await transaction.insert(coachingAssignments).values([
        {
          organization_id: organizationId,
          engagement_id: firstEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
        {
          organization_id: organizationId,
          engagement_id: secondEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
      ]);
    });
  });
  await athletePage.goto(`/organizations/${organizationId}/athletes`);
  await expect(athletePage.getByRole("button", { name: "Manage coaches" }).first()).toBeVisible();
  const page = await coachActor.createPage(`/organizations/${organizationId}/athletes`);
  await expect(page.getByRole("heading", { name: "Assigned athletes" })).toBeVisible();
  await page.getByRole("link", { name: athleteActor.username ?? "Assigned athlete" }).click();
  await expect(page.getByText("Athlete workspace unavailable")).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("coach-athlete-history-unavailable.png"),
    scale: "css",
  });
  await page.getByRole("button", { name: "Switch athlete" }).click();
  const switcher = page.getByRole("list", { name: "Switch athlete" });
  await expect(switcher.getByRole("link")).toHaveCount(2);
  const priorUrl = page.url();
  await switcher
    .locator(`a[href="/organizations/${organizationId}/athletes/${secondAthlete.profileId}"]`)
    .click();
  await expect(page).not.toHaveURL(priorUrl);
  await expect(page.getByText("Athlete workspace unavailable")).toBeVisible();
  // Published fixtures live only in this harness-created disposable database.
  await withLocalE2EDatabase(async (database) => {
    await withRepeatableReadSnapshot(
      database.db,
      async (transaction) => {
        const policy = e2eIdentity.uuid("metrics-policy");
        const now = new Date();
        await transaction.insert(athleteConsentPolicyVersions).values({
          id: policy,
          scope_key: "metrics",
          effective_from: new Date(now.getTime() - 1000),
          jurisdiction: "e2e",
          terms_text: "Disposable workspace metrics consent",
          content_digest: e2eIdentity.uuid("metrics-digest"),
        });
        for (const fixture of [
          {
            id: athleteActor.profileId,
            engagement: firstEngagementId,
            fitness: 41,
            fatigue: 35,
            watts: 211,
          },
          {
            id: secondAthlete.profileId,
            engagement: secondEngagementId,
            fitness: 72,
            fatigue: 80,
            watts: 322,
          },
        ]) {
          await transaction.insert(athleteDataSharingConsents).values({
            organization_id: organizationId,
            engagement_id: fixture.engagement,
            athlete_profile_id: fixture.id,
            scope_key: "metrics",
            policy_version_id: policy,
            granted_by_profile_id: fixture.id,
          });
          const state = {
            source_revision: 1,
            published_revision: 1,
            fitness: fixture.fitness,
            fatigue: fixture.fatigue,
            computed_at: now,
            coverage_end_at: now,
            evidence_confidence: 0.8,
          };
          await transaction
            .insert(profileAthleteState)
            .values({ profile_id: fixture.id, ...state })
            .onConflictDoUpdate({ target: profileAthleteState.profile_id, set: state });
          await transaction.insert(profilePerformanceEstimates).values({
            profile_id: fixture.id,
            capability_kind: "bike_ftp",
            activity_category: "bike",
            value: fixture.watts,
            unit: "watts",
            confidence: 0.8,
            effective_at: new Date(now.getTime() - 90 * 86_400_000),
            computed_at: now,
            algorithm_version: "workspace-fixture-v1",
            source_revision: 1,
          });
          if (fixture.id === secondAthlete.profileId) {
            const activityPolicy = e2eIdentity.uuid("activity-history-policy");
            const activityConsentId = e2eIdentity.uuid("activity-history-consent");
            await transaction.insert(athleteConsentPolicyVersions).values({
              id: activityPolicy,
              scope_key: "activities",
              effective_from: new Date(now.getTime() - 1000),
              jurisdiction: "e2e",
              terms_text: "Disposable activity history consent",
              content_digest: e2eIdentity.uuid("activity-history-digest"),
            });
            await transaction.insert(athleteDataSharingConsents).values({
              id: activityConsentId,
              organization_id: organizationId,
              engagement_id: fixture.engagement,
              athlete_profile_id: fixture.id,
              scope_key: "activities",
              policy_version_id: activityPolicy,
              granted_by_profile_id: fixture.id,
            });
            const integrationId = e2eIdentity.uuid("history-integration");
            // Keep provider coverage wholly in the past: canonical history only
            // treats a day as verified once its complete local day is covered.
            const end = new Date(now);
            end.setUTCDate(end.getUTCDate() - 1);
            end.setUTCHours(12, 0, 0, 0);
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - 84);
            start.setUTCHours(0, 0, 0, 0);
            const coverageEnd = new Date(end);
            coverageEnd.setUTCHours(23, 59, 59, 999);
            await transaction.insert(integrations).values({
              id: integrationId,
              profile_id: fixture.id,
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
                  start: start.toISOString(),
                  end: coverageEnd.toISOString(),
                },
              },
            });
            for (let offset = 1; offset <= 84; offset += 1) {
              const finishedAt = new Date(end);
              finishedAt.setUTCDate(finishedAt.getUTCDate() - offset);
              const activityId = e2eIdentity.uuid(`history-activity-${offset}`);
              const artifactId = e2eIdentity.uuid(`history-artifact-${offset}`);
              const segmentId = e2eIdentity.uuid(`history-segment-${offset}`);
              const digestSeed = e2eIdentity.uuid(`history-digest-${offset}`).replaceAll("-", "");
              const powerWatts = offset === 1 ? 210 : 180;
              const dailyLoad = (60 / 60) * (powerWatts / 250) ** 2 * 100;
              const normalizedPower = calculateCyclingNormalizedPower({
                samples: Array.from({ length: 721 }, (_, index) => ({
                  timestampSeconds: index * 5,
                  powerWatts,
                })),
              });
              const targets = buildPerformanceTargetFactsFixture({
                athleteId: fixture.id,
                asOf: finishedAt.toISOString(),
                bikeThresholdWatts: 250,
                // The projection validates snapshot evidence at read time, not only at activity time.
                // Keep every historical target valid beyond the fixture's most recent activity.
                expiresAt: new Date(end.getTime() + 365 * 86_400_000).toISOString(),
              });
              await transaction.insert(activities).values({
                id: activityId,
                profile_id: fixture.id,
                name: `History activity ${offset}`,
                started_at: new Date(finishedAt.getTime() - 3_600_000),
                finished_at: finishedAt,
                elapsed_ms: 3_600_000,
                active_ms: 3_600_000,
                moving_ms: 3_600_000,
                timing_coverage: "complete",
                segments_revision: 1,
                parser_version: "e2e-history-v1",
                decoded_contract_version: "e2e-history-v1",
                materializer_version: "e2e-history-v1",
                segments_generated_at: finishedAt,
                athlete_state_common_load: dailyLoad,
                athlete_state_activity_category: "bike",
                athlete_state_evidence_confidence: 0.9,
                athlete_state_capability_distance_meters: 1_000,
                athlete_state_capability_duration_minutes: 60,
                athlete_state_input_version: "e2e-history-v1",
                athlete_state_computed_at: finishedAt,
                performance_target_snapshot: {
                  contractVersion: "completed-activity-performance-target-snapshot-v2",
                  capturedAt: finishedAt.toISOString(),
                  publishedRevision: 1,
                  publicationStatus: "available",
                  targets,
                },
                created_at: finishedAt,
                updated_at: finishedAt,
              });
              await transaction.insert(activityArtifacts).values({
                id: artifactId,
                profile_id: fixture.id,
                digest_algorithm: "sha256",
                digest: `${digestSeed}${digestSeed}`,
                byte_size: 1_024,
                bucket: "activity-files",
                path: `artifacts/sha256/${fixture.id}/${digestSeed}${digestSeed}`,
                media_type: "application/vnd.ant.fit",
                format: "fit",
                availability: "accepted",
                first_accepted_at: finishedAt,
              });
              await transaction.insert(activityArtifactLinks).values({
                id: e2eIdentity.uuid(`history-link-${offset}`),
                activity_id: activityId,
                artifact_id: artifactId,
                profile_id: fixture.id,
                role: "source",
                ordinal: 0,
                is_current: true,
                linked_at: finishedAt,
              });
              await transaction.insert(activitySegments).values({
                id: segmentId,
                activity_id: activityId,
                profile_id: fixture.id,
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
                  averagePowerWatts: powerWatts,
                  normalizedPowerResult: normalizedPower,
                },
                summary_version: 1,
                timing_coverage: "complete",
                active_ms: 3_600_000,
                moving_ms: 3_600_000,
                segment_revision: 1,
                parser_version: "e2e-history-v1",
                materializer_version: "e2e-history-v1",
                created_at: finishedAt,
              });
            }

            const historyActivities = await transaction
              .select()
              .from(activities)
              .where(
                and(
                  eq(activities.profile_id, fixture.id),
                  inArray(
                    activities.id,
                    Array.from({ length: 84 }, (_, index) =>
                      e2eIdentity.uuid(`history-activity-${index + 1}`),
                    ),
                  ),
                ),
              );
            const historyActivityIds = historyActivities.map((activity) => activity.id);
            const historySegments = await loadActivitySegmentsByActivityId(
              transaction,
              historyActivityIds,
            );
            const segmentSummaries = await buildActivitySegmentDerivedSummaries({
              store: createActivityAnalysisStore(transaction),
              profileId: fixture.id,
              activities: historyActivities.map((activity) => ({
                ...activity,
                segments: historySegments.get(activity.id) ?? [],
              })),
              computedAsOf: now,
            });
            const incompleteSummary = segmentSummaries.find(
              (summary) => summary.common_load.status !== "available",
            );
            if (segmentSummaries.length !== historyActivities.length || incompleteSummary) {
              throw new Error(
                `History fixture must produce one complete canonical summary per activity: ${JSON.stringify(incompleteSummary?.common_load ?? { actual: segmentSummaries.length, expected: historyActivities.length })}`,
              );
            }

            const currentArtifactRows = await transaction
              .select({
                activityId: activityArtifactLinks.activity_id,
                artifactId: activityArtifactLinks.artifact_id,
              })
              .from(activityArtifactLinks)
              .innerJoin(
                activityArtifacts,
                and(
                  eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
                  eq(activityArtifacts.profile_id, activityArtifactLinks.profile_id),
                  eq(activityArtifacts.availability, "accepted"),
                ),
              )
              .where(
                and(
                  eq(activityArtifactLinks.profile_id, fixture.id),
                  inArray(activityArtifactLinks.activity_id, historyActivityIds),
                  eq(activityArtifactLinks.role, "source"),
                  eq(activityArtifactLinks.is_current, true),
                ),
              );
            const artifactsByActivityId = new Map<string, string[]>();
            for (const row of currentArtifactRows) {
              artifactsByActivityId.set(row.activityId, [
                ...(artifactsByActivityId.get(row.activityId) ?? []),
                row.artifactId,
              ]);
            }
            const summariesByActivityId = new Map<string, typeof segmentSummaries>();
            for (const summary of segmentSummaries) {
              summariesByActivityId.set(summary.activity_id, [
                ...(summariesByActivityId.get(summary.activity_id) ?? []),
                summary,
              ]);
            }
            const invalidFixtureActivity = historyActivities.find((activity) => {
              const summaries = summariesByActivityId.get(activity.id) ?? [];
              const quantification = createObservationQuantificationBundle({
                members: summaries.flatMap((summary) => summary.observationQuantification.members),
                summaryScope: "components",
              });
              return (
                resolveActivitySourceIntegrity({
                  evidence: {
                    currentArtifactIds: artifactsByActivityId.get(activity.id) ?? [],
                    providerReferences: [],
                  },
                  observationQuantification: quantification,
                }) !== "trusted" ||
                quantification.summary.commonLoad.status !== "complete" ||
                summaries.some((summary) => Date.parse(summary.computed_as_of) > now.getTime())
              );
            });
            if (invalidFixtureActivity) {
              throw new Error(
                "History fixture must retain trusted source evidence and complete summaries",
              );
            }
          }
        }
      },
      { accessMode: "read write" },
    );
  });
  const productionHistory = await withLocalE2EDatabase((database) =>
    readAthleteReadModel({
      db: database.db,
      profileId: secondAthlete.profileId,
      sections: { loadHistory: true },
      now: new Date(),
    }),
  );
  if (productionHistory.loadHistory?.result.status !== "available") {
    throw new Error(
      `Canonical history fixture unavailable: ${JSON.stringify(productionHistory.loadHistory?.result ?? null)}`,
    );
  }
  await page.reload();
  await waitForAppHydration(page);
  await expect(page.getByText("322 watts", { exact: true })).toBeVisible();
  await expect(page.getByText("Recent completed daily Common Load", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell", {
      name: ((60 / 60) * (210 / 250) ** 2 * 100).toFixed(1),
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("coach-athlete-history-populated.png"),
    scale: "css",
  });
  await withLocalE2EDatabase(async (database) =>
    database.db
      .update(athleteDataSharingConsents)
      .set({ ended_at: new Date() })
      .where(eq(athleteDataSharingConsents.id, e2eIdentity.uuid("activity-history-consent"))),
  );
  await page.reload();
  await waitForAppHydration(page);
  await expect(page.getByText("322 watts", { exact: true })).toBeVisible();
  await expect(page.getByText("Recent completed daily Common Load", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("coach-athlete-history-activities-consent-withdrawn.png"),
    scale: "css",
  });
  await expect(page.getByText("211 watts", { exact: true })).toHaveCount(0);
  await expect(page.getByText(`@${secondAthlete.username}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch athlete" }).click();
  await page
    .getByRole("list", { name: "Switch athlete" })
    .locator(`a[href="/organizations/${organizationId}/athletes/${athleteActor.profileId}"]`)
    .click();
  await expect(page.getByText("211 watts", { exact: true })).toBeVisible();
  await expect(page.getByText("322 watts", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Recent completed daily Common Load", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText(`@${athleteActor.username}`, { exact: true })).toBeVisible();
  await page.reload();
  await waitForAppHydration(page);
  await expect(page.getByText("211 watts", { exact: true })).toBeVisible();
  await page.close();
});
