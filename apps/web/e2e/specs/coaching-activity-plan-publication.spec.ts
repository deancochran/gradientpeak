import {
  activities,
  activityPlans,
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  athletePlanEditGrants,
  coachingActivityPlanPublications,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  plannedSessions,
  profileAthleteState,
  profilePerformanceEstimates,
  profiles,
} from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { seedOwnedActivityPlan } from "../seeds/activity-plans";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

function addUtcDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function captureSurface(input: {
  name: string;
  page: import("@playwright/test").Page;
  testInfo: import("@playwright/test").TestInfo;
}) {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await input.page.setViewportSize(viewport);
    await input.page.evaluate(() => window.scrollTo({ top: 0 }));
    await expect.poll(() => input.page.evaluate(() => window.scrollY)).toBe(0);
    const path = input.testInfo.outputPath(`${input.name}-${viewport.width}.png`);
    await input.page.screenshot({ path, fullPage: true, scale: "css" });
    await input.testInfo.attach(`${input.name}-${viewport.width}`, {
      path,
      contentType: "image/png",
    });
  }
}

test("[coaching-publication] athlete grants, coach publishes an owned activity plan, and revocation denies a later publication", async ({
  actorFactory,
  athleteActor,
  athletePage,
  coachActor,
  coachPage,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  const today = new Date().toISOString().slice(0, 10);
  // A same-day plan makes the journey exercise the real completion affordance;
  // it must not claim a future planned session was performed.
  const planningDate = today;
  const deniedDate = addUtcDays(today, 1);
  const activityPlanName = "Coach-prepared tempo with targets";
  const publishedActivityPlanName = `${activityPlanName} (Copy)`;

  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Publication acceptance");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`publication-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/i);
  const organizationId = new URL(athletePage.url()).pathname.match(
    /\/organizations\/([0-9a-f-]{36})\/dashboard$/i,
  )?.[1];
  if (!organizationId) throw new Error("Organization creation did not provide a UUID.");

  const coachMembershipId = e2eIdentity.uuid("publication-coach-membership");
  const engagementId = e2eIdentity.uuid("publication-engagement");
  const metricsPolicyId = e2eIdentity.uuid("publication-metrics-policy");
  const metricsConsentId = e2eIdentity.uuid("publication-metrics-consent");
  await e2eDatabase.typedTransaction(async (transaction) => {
    await transaction
      .update(profiles)
      .set({ planning_timezone: "UTC", updated_at: new Date() })
      .where(eq(profiles.id, athleteActor.profileId));
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
    await transaction.insert(coachingEngagements).values({
      id: engagementId,
      organization_id: organizationId,
      athlete_profile_id: athleteActor.profileId,
    });
    await transaction.insert(coachingAssignments).values({
      organization_id: organizationId,
      engagement_id: engagementId,
      coach_membership_id: coachMembershipId,
      assignment_kind: "primary",
    });
    await transaction.insert(athleteConsentPolicyVersions).values({
      id: metricsPolicyId,
      scope_key: "metrics",
      effective_from: new Date(Date.now() - 1_000),
      jurisdiction: "e2e",
      terms_text: "Disposable coach assessment metrics consent",
      content_digest: `sha256:${metricsPolicyId}`,
    });
    await transaction.insert(athleteDataSharingConsents).values({
      id: metricsConsentId,
      organization_id: organizationId,
      engagement_id: engagementId,
      athlete_profile_id: athleteActor.profileId,
      scope_key: "metrics",
      policy_version_id: metricsPolicyId,
      granted_by_profile_id: athleteActor.profileId,
    });
    const assessedAt = new Date();
    const athleteState = {
      source_revision: 1,
      published_revision: 1,
      fitness: 52,
      fatigue: 44,
      computed_at: assessedAt,
      coverage_end_at: assessedAt,
      evidence_confidence: 0.8,
    };
    await transaction
      .insert(profileAthleteState)
      .values({ profile_id: athleteActor.profileId, ...athleteState })
      .onConflictDoUpdate({ target: profileAthleteState.profile_id, set: athleteState });
    await transaction.insert(profilePerformanceEstimates).values({
      profile_id: athleteActor.profileId,
      capability_kind: "bike_ftp",
      activity_category: "bike",
      value: 255,
      unit: "watts",
      confidence: 0.8,
      effective_at: assessedAt,
      computed_at: assessedAt,
      algorithm_version: "publication-assessment-fixture-v1",
      source_revision: 1,
    });
  });

  await athletePage.goto("/settings#coaching");
  await waitForAppHydration(athletePage);
  const grant = athletePage.getByRole("switch", {
    name: /Allow .* to publish activity plans/i,
  });
  await expect(grant).toBeVisible();
  await expect(grant).not.toBeChecked();
  await grant.click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: /can now publish activity plans/i }),
  ).toBeVisible();
  await expect(grant).toBeChecked();
  await captureSurface({ name: "publication-athlete-grant", page: athletePage, testInfo });

  await coachPage.goto(`/organizations/${organizationId}/athletes/${athleteActor.profileId}`);
  await waitForAppHydration(coachPage);
  await expect(coachPage.getByText("255 watts", { exact: true })).toBeVisible();
  await expect(coachPage.getByText("Published training state", { exact: true })).toBeVisible();
  await expect(coachPage.getByText(/Fitness \(Long-term load\)/)).toBeVisible();
  await expect(coachPage.getByText(/Fatigue \(Recent load\)/)).toBeVisible();
  await expect(coachPage.getByText(/Form \(Load balance\)/)).toBeVisible();
  await expect(coachPage.getByText("Publish an activity plan", { exact: true })).toBeVisible();
  await coachPage.getByLabel("Athlete planning date", { exact: true }).fill(planningDate);
  await coachPage.getByRole("link", { name: "Prepare activity plan", exact: true }).click();
  await expect(coachPage.getByText("Preparing for an athlete", { exact: true })).toBeVisible();
  await coachPage.getByRole("button", { name: "Create activity plan", exact: true }).click();
  await expect(coachPage.getByLabel("Plan name", { exact: true })).toBeVisible();
  await coachPage.getByLabel("Plan name", { exact: true }).fill(activityPlanName);
  await coachPage.getByLabel("Activity category", { exact: true }).selectOption("bike");
  await coachPage.getByRole("button", { name: "Add step", exact: true }).click();
  const preparedStep = coachPage.getByTestId("activity-plan-item-0");
  await preparedStep.getByRole("button", { name: "Add name", exact: true }).click();
  await preparedStep.getByLabel("Name (optional)", { exact: true }).fill("Tempo block");
  await preparedStep.getByRole("button", { name: "Add instructions", exact: true }).click();
  await preparedStep
    .getByLabel("Instructions (optional)", { exact: true })
    .fill("Hold smooth pressure through the full interval.");
  // Use the native combobox’s rendered accessible role and name.
  await coachPage.getByRole("combobox", { name: "Completion", exact: true }).selectOption("time");
  await coachPage.getByLabel("Quantity", { exact: true }).fill("600");
  await coachPage.getByRole("button", { name: "Add target", exact: true }).click();
  await coachPage.getByLabel("Target type 1", { exact: true }).selectOption("RPE");
  await coachPage.getByLabel("Target intensity 1", { exact: true }).fill("4");
  await coachPage.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(coachPage.getByText("Publish an activity plan", { exact: true })).toBeVisible();
  const activityPlan = coachPage.getByLabel("Your activity plan", { exact: true });
  await expect(activityPlan).toHaveValue(/^[0-9a-f-]{36}$/i);
  const activityPlanId = await activityPlan.inputValue();
  expect(activityPlanId).toMatch(/^[0-9a-f-]{36}$/i);
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ name: activityPlans.name, structure: activityPlans.structure })
        .from(activityPlans)
        .where(
          and(
            eq(activityPlans.id, activityPlanId),
            eq(activityPlans.profile_id, coachActor.profileId),
          ),
        ),
    )
    .toEqual([
      {
        name: activityPlanName,
        structure: expect.objectContaining({
          version: 5,
          activity_category: "bike",
          items: [
            expect.objectContaining({
              id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
              type: "step",
              name: "Tempo block",
              instructions: "Hold smooth pressure through the full interval.",
              duration: { type: "time", seconds: 600 },
              targets: [{ type: "RPE", intensity: 4 }],
            }),
          ],
        }),
      },
    ]);
  await expect(coachPage.getByLabel("Athlete planning date", { exact: true })).toHaveValue(
    planningDate,
  );
  await coachPage.getByRole("button", { name: "Preview publication", exact: true }).click();
  await expect(
    coachPage.getByText(`Ready to publish: ${activityPlanName}`, { exact: true }),
  ).toBeVisible();
  await expect(
    coachPage.getByText(`${planningDate} in the athlete’s UTC planning time zone.`, {
      exact: true,
    }),
  ).toBeVisible();
  await captureSurface({ name: "publication-coach-preview", page: coachPage, testInfo });
  await coachPage.getByRole("button", { name: "Publish activity plan", exact: true }).click();
  await expect(
    coachPage
      .getByRole("status")
      .filter({ hasText: `Published ${activityPlanName} for ${planningDate}.` }),
  ).toBeVisible();

  const [publication] = await e2eDatabase.db
    .select({ copiedActivityPlanId: coachingActivityPlanPublications.copied_activity_plan_id })
    .from(coachingActivityPlanPublications)
    .where(
      and(
        eq(coachingActivityPlanPublications.athlete_profile_id, athleteActor.profileId),
        eq(coachingActivityPlanPublications.organization_id, organizationId),
        eq(coachingActivityPlanPublications.source_activity_plan_id, activityPlanId),
        eq(coachingActivityPlanPublications.planning_date, planningDate),
      ),
    );
  if (!publication)
    throw new Error("The published activity plan did not create a publication receipt.");
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ name: activityPlans.name, planningDate: plannedSessions.planning_date })
        .from(plannedSessions)
        .innerJoin(activityPlans, eq(activityPlans.id, plannedSessions.activity_plan_id))
        .where(
          and(
            eq(plannedSessions.profile_id, athleteActor.profileId),
            eq(plannedSessions.activity_plan_id, publication.copiedActivityPlanId),
          ),
        ),
    )
    .toEqual([{ name: publishedActivityPlanName, planningDate }]);

  await athletePage.goto(
    `/calendar?month=${planningDate.slice(0, 7)}&date=${planningDate}&view=month`,
  );
  await waitForAppHydration(athletePage);
  await expect(athletePage.getByText("Personal planned sessions", { exact: true })).toBeVisible();
  await athletePage.goto("/plan");
  await waitForAppHydration(athletePage);
  const followSession = athletePage.getByRole("link", {
    name: /^Open (?:& follow )?session$/,
    exact: true,
  });
  await expect(followSession).toBeVisible();
  await followSession.click();
  await expect(athletePage).toHaveURL(/\/calendar\/events\/[0-9a-f-]{36}/i);
  await expect(
    athletePage.getByRole("heading", { name: publishedActivityPlanName, exact: true }),
  ).toBeVisible();
  await expect(
    athletePage.getByText(
      "Current activity plan instructions. No personalized adjustments are shown.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(athletePage.getByText("Tempo block", { exact: true })).toBeVisible();
  await expect(
    athletePage.getByText("Hold smooth pressure through the full interval.", { exact: true }),
  ).toBeVisible();
  await expect(athletePage.getByText("600 sec · 4 RPE", { exact: true })).toBeVisible();
  await expect(athletePage.getByText("Completion", { exact: true })).toBeVisible();
  await athletePage.getByRole("button", { name: "Actual details (optional)", exact: true }).click();
  await athletePage.getByLabel("Actual duration (minutes, optional)").fill("45");
  await athletePage.getByLabel("Actual distance (meters, optional)").fill("12300");
  await athletePage.getByLabel("RPE (1-10, optional)").fill("6");
  const completionNote = "Held steady through the final interval.";
  await athletePage.getByLabel("Notes (optional)").fill(completionNote);
  await athletePage.getByRole("button", { name: "Complete activity", exact: true }).click();
  const completedActivityLink = athletePage.getByRole("link", {
    name: "View linked completed activity",
    exact: true,
  });
  await expect(completedActivityLink).toBeVisible();
  const completedActivityId = (await completedActivityLink.getAttribute("href"))?.split("/").at(-1);
  if (!completedActivityId)
    throw new Error("Manual completion did not expose its linked activity.");
  await captureSurface({
    name: "publication-athlete-completed-session",
    page: athletePage,
    testInfo,
  });

  // The activity-plan id and session id are distinct. Read the session by its
  // durable publication relation rather than relying only on the page URL.
  const [linkedSession] = await e2eDatabase.db
    .select({ activityId: plannedSessions.completed_activity_id, id: plannedSessions.id })
    .from(plannedSessions)
    .where(
      and(
        eq(plannedSessions.profile_id, athleteActor.profileId),
        eq(plannedSessions.activity_plan_id, publication.copiedActivityPlanId),
        eq(plannedSessions.planning_date, planningDate),
      ),
    );
  if (!linkedSession) throw new Error("Published session was not retained after completion.");
  expect(linkedSession.activityId).toBe(completedActivityId);
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({
          distance: activities.distance_meters,
          elapsed: activities.elapsed_ms,
          notes: activities.notes,
          provenance: activities.entry_provenance,
        })
        .from(activities)
        .where(eq(activities.id, completedActivityId)),
    )
    .toEqual([
      {
        distance: 12300,
        elapsed: 2_700_000,
        notes: completionNote,
        provenance: "manual",
      },
    ]);

  // Add a second independently linked completion so the review surface is
  // exercised as a queue. The runner owns this disposable database; the first
  // completion above remains a real browser-created completion.
  const secondActivityId = e2eIdentity.uuid("publication-second-completed-activity");
  const secondSessionId = e2eIdentity.uuid("publication-second-completed-session");
  const secondPlanningDate = addUtcDays(planningDate, -1);
  const secondOperationId = e2eIdentity.uuid("publication-second-operation").replaceAll("-", "");
  await e2eDatabase.typedTransaction(async (transaction) => {
    await transaction.insert(activities).values({
      id: secondActivityId,
      profile_id: athleteActor.profileId,
      name: "Disposable second completed session",
      entry_provenance: "manual",
      manual_activity_category: "run",
      diary_date: secondPlanningDate,
      diary_timezone: "UTC",
      elapsed_ms: 1_800_000,
      parser_version: "e2e-completion-review-v1",
      decoded_contract_version: "e2e-completion-review-v1",
      materializer_version: "e2e-completion-review-v1",
    });
    await transaction.insert(plannedSessions).values({
      id: secondSessionId,
      profile_id: athleteActor.profileId,
      contract_version: "planned-session-v1",
      session_revision: 1,
      planning_date: secondPlanningDate,
      original_target_date: secondPlanningDate,
      source_kind: "direct",
      direct_operation_id: secondOperationId,
      idempotency_key: `direct:${secondOperationId}`,
      activity_plan_id: publication.copiedActivityPlanId,
      status: "completed",
      completed_activity_id: secondActivityId,
      completion_state: "linked",
      completion_outcome: "full",
      linked_at: new Date("2026-11-05T12:00:00.000Z"),
    });
  });

  const activitiesPolicyId = e2eIdentity.uuid("publication-activities-policy");
  const calendarPolicyId = e2eIdentity.uuid("publication-calendar-policy");
  const activitiesConsentId = e2eIdentity.uuid("publication-activities-consent");
  const calendarConsentId = e2eIdentity.uuid("publication-calendar-consent");
  await e2eDatabase.typedTransaction(async (transaction) => {
    await transaction.insert(athleteConsentPolicyVersions).values([
      {
        id: activitiesPolicyId,
        scope_key: "activities",
        effective_from: new Date(Date.now() - 1_000),
        jurisdiction: "e2e",
        terms_text: "Disposable completed activities consent",
        content_digest: `sha256:${activitiesPolicyId}`,
      },
      {
        id: calendarPolicyId,
        scope_key: "calendar",
        effective_from: new Date(Date.now() - 1_000),
        jurisdiction: "e2e",
        terms_text: "Disposable completed session calendar consent",
        content_digest: `sha256:${calendarPolicyId}`,
      },
    ]);
    await transaction.insert(athleteDataSharingConsents).values([
      {
        id: activitiesConsentId,
        organization_id: organizationId,
        engagement_id: engagementId,
        athlete_profile_id: athleteActor.profileId,
        scope_key: "activities",
        policy_version_id: activitiesPolicyId,
        granted_by_profile_id: athleteActor.profileId,
      },
      {
        id: calendarConsentId,
        organization_id: organizationId,
        engagement_id: engagementId,
        athlete_profile_id: athleteActor.profileId,
        scope_key: "calendar",
        policy_version_id: calendarPolicyId,
        granted_by_profile_id: athleteActor.profileId,
      },
    ]);
  });

  await coachPage.goto(`/organizations/${organizationId}/athletes/${athleteActor.profileId}`);
  await waitForAppHydration(coachPage);
  await expect(coachPage.getByText("Completed activities", { exact: true })).toBeVisible();
  const completedActivities = coachPage.getByRole("list", { name: "Completed activities" });
  await expect(completedActivities.getByRole("listitem")).toHaveCount(2);
  await expect(completedActivities).toContainText("Completed session");
  await expect(completedActivities).toContainText(`Planned ${planningDate}`);
  await expect(completedActivities).not.toContainText(publishedActivityPlanName);
  await expect(completedActivities).not.toContainText(completionNote);
  await expect(
    coachPage.getByText("Opening this list does not mark anything reviewed.", { exact: false }),
  ).toBeVisible();
  await captureSurface({
    name: "publication-coach-completed-activities",
    page: coachPage,
    testInfo,
  });

  // Reading is observational: it must neither duplicate nor rewrite the link.
  await coachPage.reload();
  await waitForAppHydration(coachPage);
  await expect(completedActivities.getByRole("listitem")).toHaveCount(2);
  await expect(completedActivities).toContainText("Completed session");
  await expect(completedActivities).not.toContainText(completionNote);
  expect(
    await e2eDatabase.db
      .select({ activityId: plannedSessions.completed_activity_id })
      .from(plannedSessions)
      .where(eq(plannedSessions.id, linkedSession.id)),
  ).toEqual([{ activityId: completedActivityId }]);
  expect(
    await e2eDatabase.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.id, completedActivityId)),
  ).toHaveLength(1);

  // Reading above did not acknowledge either row. Acknowledging one must leave
  // the other pending after the authoritative reload.
  const originalCompletion = completedActivities
    .getByRole("listitem")
    .filter({ hasText: `Planned ${planningDate}` });
  await originalCompletion.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(
    coachPage.getByRole("status").filter({ hasText: "Marked reviewed. The queue is up to date." }),
  ).toBeVisible();
  await expect(completedActivities.getByRole("listitem")).toHaveCount(1);
  await captureSurface({
    name: "publication-coach-reviewed-queue",
    page: coachPage,
    testInfo,
  });
  await coachPage.reload();
  await waitForAppHydration(coachPage);
  await expect(completedActivities.getByRole("listitem")).toHaveCount(1);

  // Review history is versioned. A changed completion must reappear rather
  // than being hidden by acknowledgement of its prior evidence version.
  await e2eDatabase.db
    .update(plannedSessions)
    .set({ linked_at: new Date("2026-11-06T12:00:00.000Z") })
    .where(eq(plannedSessions.id, linkedSession.id));
  await coachPage.reload();
  await waitForAppHydration(coachPage);
  await expect(completedActivities.getByRole("listitem")).toHaveCount(2);

  // Consent facts are append/revoke-only: revoke calendar while activities is
  // still valid, then revoke activities too. Each independently denies access.
  for (const consentId of [calendarConsentId, activitiesConsentId]) {
    await e2eDatabase.db
      .update(athleteDataSharingConsents)
      .set({ ended_at: new Date() })
      .where(eq(athleteDataSharingConsents.id, consentId));
    await coachPage.reload();
    await waitForAppHydration(coachPage);
    await expect(
      coachPage.getByText("Completed activities unavailable", { exact: true }),
    ).toBeVisible();
  }
  const foreignCoach = await actorFactory.create("coach", { label: "foreign-publication-coach" });
  const foreignCoachPage = await foreignCoach.createPage(
    `/organizations/${organizationId}/athletes/${athleteActor.profileId}`,
  );
  await expect(
    foreignCoachPage.getByRole("heading", { name: "Coaching access required", exact: true }),
  ).toBeVisible();
  await foreignCoachPage.close();

  await athletePage.goto("/settings#coaching");
  await waitForAppHydration(athletePage);
  await expect(grant).toBeChecked();
  await grant.click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: /can no longer publish activity plans/i }),
  ).toBeVisible();
  await expect(grant).not.toBeChecked();
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ id: athletePlanEditGrants.id })
        .from(athletePlanEditGrants)
        .where(
          and(
            eq(athletePlanEditGrants.engagement_id, engagementId),
            eq(athletePlanEditGrants.coach_membership_id, coachMembershipId),
            isNull(athletePlanEditGrants.revoked_at),
          ),
        ),
    )
    .toEqual([]);

  await coachPage.getByLabel("Athlete planning date", { exact: true }).fill(deniedDate);
  await expect(
    coachPage.getByRole("button", { name: "Preview publication", exact: true }),
  ).toBeDisabled();
  await coachPage.close();
});

test("[coaching-publication] coach can cancel creation and correct a seeded plan before publishing", async ({
  athleteActor,
  athletePage,
  coachActor,
  coachPage,
  e2eDatabase,
  e2eIdentity,
}) => {
  test.setTimeout(120_000);
  const planName = "Playwright Tempo Builder";
  const revisedPlanName = "Playwright Tempo Builder — coach revised";

  await athletePage.goto("/organizations/new");
  await athletePage
    .getByLabel("Organization name", { exact: true })
    .fill("Publication edit coverage");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`publication-edit-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/i);
  const organizationId = new URL(athletePage.url()).pathname.match(
    /\/organizations\/([0-9a-f-]{36})\/dashboard$/i,
  )?.[1];
  if (!organizationId) throw new Error("Organization creation did not provide a UUID.");

  const coachMembershipId = e2eIdentity.uuid("publication-edit-coach-membership");
  const engagementId = e2eIdentity.uuid("publication-edit-engagement");
  await e2eDatabase.typedTransaction(async (transaction) => {
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
    await transaction.insert(coachingEngagements).values({
      id: engagementId,
      organization_id: organizationId,
      athlete_profile_id: athleteActor.profileId,
    });
    await transaction.insert(coachingAssignments).values({
      organization_id: organizationId,
      engagement_id: engagementId,
      coach_membership_id: coachMembershipId,
      assignment_kind: "primary",
    });
  });
  const { activityPlanId } = await seedOwnedActivityPlan(
    e2eDatabase,
    coachActor.profileId,
    e2eIdentity.suffix("publication-edit-coach-activity-plan", 64),
  );

  await athletePage.goto("/settings#coaching");
  await waitForAppHydration(athletePage);
  const grant = athletePage.getByRole("switch", {
    name: /Allow .* to publish activity plans/i,
  });
  await expect(grant).not.toBeChecked();
  await grant.click();
  await expect(grant).toBeChecked();

  await coachPage.goto(`/organizations/${organizationId}/athletes/${athleteActor.profileId}`);
  await waitForAppHydration(coachPage);
  await coachPage
    .getByLabel("Athlete planning date", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await coachPage.getByRole("link", { name: "Prepare activity plan", exact: true }).click();
  await expect(coachPage.getByText("Preparing for an athlete", { exact: true })).toBeVisible();
  await coachPage.getByRole("button", { name: "Create activity plan", exact: true }).click();
  await expect(coachPage.getByLabel("Plan name", { exact: true })).toBeVisible();
  await coachPage.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(coachPage.getByText("Preparing for an athlete", { exact: true })).toBeVisible();

  await coachPage.getByRole("searchbox", { name: "Search activity plans" }).fill(planName);
  await coachPage
    .getByRole("button", { name: `Open activity plan ${planName}`, exact: true })
    .click();
  await coachPage.getByRole("link", { name: "Back to activity plans", exact: true }).click();
  await expect(coachPage.getByText("Preparing for an athlete", { exact: true })).toBeVisible();
  await coachPage.getByRole("searchbox", { name: "Search activity plans" }).fill(planName);
  await coachPage
    .getByRole("button", { name: `Open activity plan ${planName}`, exact: true })
    .click();
  await coachPage.getByRole("button", { name: "Edit", exact: true }).click();
  const planNameField = coachPage.getByLabel("Plan name", { exact: true });
  await planNameField.fill("");
  await expect(planNameField).toHaveValue("");
  await expect(coachPage.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await planNameField.fill(revisedPlanName);
  await coachPage.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(coachPage.getByText("Publish an activity plan", { exact: true })).toBeVisible();
  await expect(coachPage.getByLabel("Your activity plan", { exact: true })).toHaveValue(
    activityPlanId,
  );
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ name: activityPlans.name })
        .from(activityPlans)
        .where(eq(activityPlans.id, activityPlanId)),
    )
    .toEqual([{ name: revisedPlanName }]);
});
