import {
  activities,
  activitySegments,
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingCompletionReviews,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  plannedSessions,
  profiles,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { seedOwnedActivityPlan } from "../seeds/activity-plans";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

function addUtcDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("coach reviews linked completion evidence and returns to the same athlete workspace", async ({
  athleteActor,
  athletePage,
  coachActor,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  const today = new Date().toISOString().slice(0, 10);
  const recordedDate = addUtcDays(today, -2);
  const partialDate = addUtcDays(today, -1);
  const skippedDate = today;

  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Completion review");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`completion-review-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/i);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization id");

  const coachMembershipId = e2eIdentity.uuid("coach-membership");
  const engagementId = e2eIdentity.uuid("engagement");
  const activitiesPolicyId = e2eIdentity.uuid("activities-policy");
  const calendarPolicyId = e2eIdentity.uuid("calendar-policy");
  const recordedActivityId = e2eIdentity.uuid("recorded-activity");
  const partialActivityId = e2eIdentity.uuid("partial-activity");
  const recordedSessionId = e2eIdentity.uuid("recorded-session");
  const partialSessionId = e2eIdentity.uuid("partial-session");
  const skippedSessionId = e2eIdentity.uuid("skipped-session");
  const recordedOperationId = e2eIdentity.uuid("recorded-operation").replaceAll("-", "");
  const partialOperationId = e2eIdentity.uuid("partial-operation").replaceAll("-", "");
  const skippedOperationId = e2eIdentity.uuid("skipped-operation").replaceAll("-", "");
  const plan = await seedOwnedActivityPlan(
    e2eDatabase,
    athleteActor.profileId,
    e2eIdentity.suffix("completion-review", 64),
  );

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
    await transaction.insert(athleteConsentPolicyVersions).values([
      {
        id: activitiesPolicyId,
        scope_key: "activities",
        effective_from: new Date(Date.now() - 1_000),
        jurisdiction: "e2e",
        terms_text: "Disposable completion review activities consent",
        content_digest: `sha256:${activitiesPolicyId}`,
      },
      {
        id: calendarPolicyId,
        scope_key: "calendar",
        effective_from: new Date(Date.now() - 1_000),
        jurisdiction: "e2e",
        terms_text: "Disposable completion review calendar consent",
        content_digest: `sha256:${calendarPolicyId}`,
      },
    ]);
    await transaction.insert(athleteDataSharingConsents).values([
      {
        organization_id: organizationId,
        engagement_id: engagementId,
        athlete_profile_id: athleteActor.profileId,
        scope_key: "activities",
        policy_version_id: activitiesPolicyId,
        granted_by_profile_id: athleteActor.profileId,
      },
      {
        organization_id: organizationId,
        engagement_id: engagementId,
        athlete_profile_id: athleteActor.profileId,
        scope_key: "calendar",
        policy_version_id: calendarPolicyId,
        granted_by_profile_id: athleteActor.profileId,
      },
    ]);
    await transaction.insert(activities).values([
      {
        id: recordedActivityId,
        profile_id: athleteActor.profileId,
        name: "Private recorded evidence",
        started_at: new Date(`${recordedDate}T08:00:00.000Z`),
        finished_at: new Date(`${recordedDate}T09:00:00.000Z`),
        elapsed_ms: 3_600_000,
        distance_meters: 10_000,
        parser_version: "e2e-completion-review-v1",
        decoded_contract_version: "e2e-completion-review-v1",
        materializer_version: "e2e-completion-review-v1",
      },
      {
        id: partialActivityId,
        profile_id: athleteActor.profileId,
        name: "Private manual partial evidence",
        entry_provenance: "manual",
        manual_activity_category: "run",
        diary_date: partialDate,
        diary_timezone: "UTC",
        elapsed_ms: 1_800_000,
        distance_meters: 5_000,
        parser_version: "e2e-completion-review-v1",
        decoded_contract_version: "e2e-completion-review-v1",
        materializer_version: "e2e-completion-review-v1",
      },
    ]);
    await transaction.insert(activitySegments).values({
      id: e2eIdentity.uuid("recorded-segment"),
      activity_id: recordedActivityId,
      profile_id: athleteActor.profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "run",
      start_offset_ms: 0,
      end_offset_ms: 3_600_000,
      summary: { version: 1, timing: { timingCoverage: "unavailable" } },
      summary_version: 1,
      timing_coverage: "unavailable",
      parser_version: "e2e-completion-review-v1",
      materializer_version: "e2e-completion-review-v1",
    });
    await transaction.insert(plannedSessions).values([
      {
        id: recordedSessionId,
        profile_id: athleteActor.profileId,
        contract_version: "planned-session-v1",
        session_revision: 1,
        planning_date: recordedDate,
        original_target_date: recordedDate,
        source_kind: "direct",
        direct_operation_id: recordedOperationId,
        idempotency_key: `direct:${recordedOperationId}`,
        activity_plan_id: plan.activityPlanId,
        status: "completed",
        completed_activity_id: recordedActivityId,
        completion_state: "linked",
        completion_outcome: "full",
        linked_at: new Date(`${recordedDate}T10:00:00.000Z`),
      },
      {
        id: partialSessionId,
        profile_id: athleteActor.profileId,
        contract_version: "planned-session-v1",
        session_revision: 1,
        planning_date: partialDate,
        original_target_date: partialDate,
        source_kind: "direct",
        direct_operation_id: partialOperationId,
        idempotency_key: `direct:${partialOperationId}`,
        activity_plan_id: plan.activityPlanId,
        status: "completed",
        completed_activity_id: partialActivityId,
        completion_state: "linked",
        completion_outcome: "partial",
        linked_at: new Date(`${partialDate}T10:00:00.000Z`),
      },
      {
        id: skippedSessionId,
        profile_id: athleteActor.profileId,
        contract_version: "planned-session-v1",
        session_revision: 1,
        planning_date: skippedDate,
        original_target_date: skippedDate,
        source_kind: "direct",
        direct_operation_id: skippedOperationId,
        idempotency_key: `direct:${skippedOperationId}`,
        activity_plan_id: plan.activityPlanId,
        status: "completed",
        completion_outcome: "skipped",
        skip_operation_id: e2eIdentity.uuid("skipped-operation-id"),
        linked_at: new Date(`${skippedDate}T10:00:00.000Z`),
      },
    ]);
  });

  const beforeRead = await e2eDatabase.db
    .select({ id: coachingCompletionReviews.id })
    .from(coachingCompletionReviews)
    .where(eq(coachingCompletionReviews.engagement_id, engagementId));
  expect(beforeRead).toEqual([]);

  const page = await coachActor.createPage(`/organizations/${organizationId}/athletes`);
  await expect(page.getByRole("heading", { name: "Assigned athletes" })).toBeVisible();
  await page.getByRole("link", { name: athleteActor.username ?? "Assigned athlete" }).click();
  await waitForAppHydration(page);

  const completedActivities = page.getByRole("list", { name: "Completed activities" });
  await expect(completedActivities.getByRole("listitem")).toHaveCount(2);
  await expect(completedActivities).toContainText(`Planned ${recordedDate}`);
  await expect(completedActivities).toContainText(`Planned ${partialDate}`);
  await expect(completedActivities).toContainText("60 min");
  await expect(completedActivities).toContainText("10.0 km");
  await expect(completedActivities).toContainText("30 min");
  await expect(completedActivities).toContainText("5.0 km");
  await expect(completedActivities).toContainText("run");
  await expect(completedActivities).not.toContainText("Private recorded evidence");
  await expect(completedActivities).not.toContainText("Private manual partial evidence");
  await expect(completedActivities).not.toContainText(skippedDate);
  await expect(
    page.getByText("Opening this list does not mark anything reviewed.", { exact: false }),
  ).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    const path = testInfo.outputPath(`coach-completion-review-${viewport.width}.png`);
    await page.screenshot({ fullPage: true, path, scale: "css" });
    await testInfo.attach(`coach-completion-review-${viewport.width}`, {
      contentType: "image/png",
      path,
    });
  }

  expect(
    await e2eDatabase.db
      .select({ id: coachingCompletionReviews.id })
      .from(coachingCompletionReviews)
      .where(eq(coachingCompletionReviews.engagement_id, engagementId)),
  ).toEqual([]);
  const partialCompletion = completedActivities
    .getByRole("listitem")
    .filter({ hasText: `Planned ${partialDate}` });
  await partialCompletion.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Marked reviewed. The queue is up to date." }),
  ).toBeVisible();
  await expect(completedActivities.getByRole("listitem")).toHaveCount(1);
  expect(
    await e2eDatabase.db
      .select({ sessionId: coachingCompletionReviews.session_id })
      .from(coachingCompletionReviews)
      .where(eq(coachingCompletionReviews.engagement_id, engagementId)),
  ).toEqual([{ sessionId: partialSessionId }]);

  await page.getByRole("link", { name: "Message athlete" }).click();
  await expect(page.getByRole("heading", { name: "New message" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Remove @${athleteActor.username} from recipients` }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Close" }).click();
  await expect(page.getByRole("link", { name: "Return to athlete workspace" })).toBeVisible();
  await page.getByRole("link", { name: "Return to athlete workspace" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/organizations/${organizationId}/athletes/${athleteActor.profileId}$`),
  );
  await expect(completedActivities.getByRole("listitem")).toHaveCount(1);

  const sessions = await e2eDatabase.db
    .select({
      activityId: plannedSessions.completed_activity_id,
      outcome: plannedSessions.completion_outcome,
      sessionId: plannedSessions.id,
      state: plannedSessions.completion_state,
      status: plannedSessions.status,
    })
    .from(plannedSessions)
    .where(
      and(
        eq(plannedSessions.profile_id, athleteActor.profileId),
        eq(plannedSessions.activity_plan_id, plan.activityPlanId),
      ),
    );
  expect(sessions).toEqual(
    expect.arrayContaining([
      {
        sessionId: recordedSessionId,
        activityId: recordedActivityId,
        outcome: "full",
        state: "linked",
        status: "completed",
      },
      {
        sessionId: partialSessionId,
        activityId: partialActivityId,
        outcome: "partial",
        state: "linked",
        status: "completed",
      },
      {
        sessionId: skippedSessionId,
        activityId: null,
        outcome: "skipped",
        state: null,
        status: "completed",
      },
    ]),
  );
});
