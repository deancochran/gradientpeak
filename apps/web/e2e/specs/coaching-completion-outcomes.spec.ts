import { activities, plannedSessions, profiles } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { seedOwnedActivityPlan } from "../seeds/activity-plans";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

function addUtcDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function schedulePastSession(input: {
  activityPlanId: string;
  athletePage: import("@playwright/test").Page;
  e2eDatabase: Parameters<typeof seedOwnedActivityPlan>[0];
  futureDate: string;
  pastDate: string;
  profileId: string;
}) {
  const { activityPlanId, athletePage, e2eDatabase, futureDate, pastDate, profileId } = input;
  await athletePage.goto(`/activity-plans/${activityPlanId}`);
  await waitForAppHydration(athletePage);
  await athletePage.getByLabel("Schedule date", { exact: true }).fill(futureDate);
  await athletePage.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(athletePage.getByRole("button", { name: "Reschedule", exact: true })).toBeVisible();
  await athletePage.getByLabel("Schedule date", { exact: true }).fill(pastDate);
  await athletePage.getByRole("button", { name: "Reschedule", exact: true }).click();
  await expect(athletePage.getByText(`Currently scheduled for ${pastDate}.`)).toBeVisible();

  const [session] = await e2eDatabase.db
    .select({ id: plannedSessions.id })
    .from(plannedSessions)
    .where(
      and(
        eq(plannedSessions.profile_id, profileId),
        eq(plannedSessions.activity_plan_id, activityPlanId),
      ),
    );
  if (!session) throw new Error("Scheduling did not create a planned session.");
  return session.id;
}

async function captureOutcomeSurface(input: {
  name: string;
  page: import("@playwright/test").Page;
  testInfo: import("@playwright/test").TestInfo;
}) {
  const path = input.testInfo.outputPath(`${input.name}-${input.testInfo.project.name}.png`);
  await input.page.screenshot({ fullPage: true, path, scale: "css" });
  await input.testInfo.attach(input.name, { contentType: "image/png", path });
}

test("manual partial and skipped sessions retain truthful labels after reload", async ({
  athleteActor,
  athletePage,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  const today = new Date().toISOString().slice(0, 10);
  const futureDate = addUtcDays(today, 2);
  const pastDate = addUtcDays(today, -1);
  await e2eDatabase.typedTransaction(async (transaction) => {
    await transaction
      .update(profiles)
      .set({ planning_timezone: "UTC", updated_at: new Date() })
      .where(eq(profiles.id, athleteActor.profileId));
  });
  const partialPlan = await seedOwnedActivityPlan(
    e2eDatabase,
    athleteActor.profileId,
    e2eIdentity.suffix("coaching-completion-partial", 64),
  );
  const skippedPlan = await seedOwnedActivityPlan(
    e2eDatabase,
    athleteActor.profileId,
    e2eIdentity.suffix("coaching-completion-skipped", 64),
  );

  const partialSessionId = await schedulePastSession({
    activityPlanId: partialPlan.activityPlanId,
    athletePage,
    e2eDatabase,
    futureDate,
    pastDate,
    profileId: athleteActor.profileId,
  });
  await athletePage.goto(`/calendar/events/${partialSessionId}?resourceType=planned_session`);
  await waitForAppHydration(athletePage);
  await athletePage.getByRole("button", { name: "Complete partially", exact: true }).click();
  await expect(athletePage.getByText("Partially completed", { exact: true })).toBeVisible();
  await athletePage.reload();
  await waitForAppHydration(athletePage);
  await expect(athletePage.getByText("Partially completed", { exact: true })).toBeVisible();
  await captureOutcomeSurface({ name: "coaching-partial-outcome", page: athletePage, testInfo });

  const [partialReadback] = await e2eDatabase.db
    .select({
      activityId: plannedSessions.completed_activity_id,
      outcome: plannedSessions.completion_outcome,
      status: plannedSessions.status,
    })
    .from(plannedSessions)
    .where(eq(plannedSessions.id, partialSessionId));
  expect(partialReadback).toMatchObject({ outcome: "partial", status: "completed" });
  expect(partialReadback?.activityId).not.toBeNull();

  const skippedSessionId = await schedulePastSession({
    activityPlanId: skippedPlan.activityPlanId,
    athletePage,
    e2eDatabase,
    futureDate,
    pastDate,
    profileId: athleteActor.profileId,
  });
  await athletePage.goto(`/calendar/events/${skippedSessionId}?resourceType=planned_session`);
  await waitForAppHydration(athletePage);
  await athletePage.getByRole("button", { name: "Skip session", exact: true }).click();
  await expect(athletePage.getByText("Skipped", { exact: true })).toBeVisible();
  await expect(athletePage.getByText("This session was skipped.", { exact: true })).toBeVisible();
  await athletePage.reload();
  await waitForAppHydration(athletePage);
  await expect(athletePage.getByText("Skipped", { exact: true })).toBeVisible();
  await expect(athletePage.getByText("This session was skipped.", { exact: true })).toBeVisible();
  await captureOutcomeSurface({ name: "coaching-skipped-outcome", page: athletePage, testInfo });

  const [skippedReadback] = await e2eDatabase.db
    .select({
      activityId: plannedSessions.completed_activity_id,
      outcome: plannedSessions.completion_outcome,
      status: plannedSessions.status,
    })
    .from(plannedSessions)
    .where(eq(plannedSessions.id, skippedSessionId));
  expect(skippedReadback).toMatchObject({
    activityId: null,
    outcome: "skipped",
    status: "completed",
  });
  const skippedActivities = await e2eDatabase.db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.reconciled_planned_session_id, skippedSessionId));
  expect(skippedActivities).toHaveLength(0);

  await athletePage.goto(`/calendar?date=${pastDate}&month=${pastDate.slice(0, 7)}&view=agenda`);
  await waitForAppHydration(athletePage);
  await expect(athletePage.getByText(`${pastDate} · Partially completed`)).toBeVisible();
  await expect(athletePage.getByText(`${pastDate} · Skipped`)).toBeVisible();
});
