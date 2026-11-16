import { plannedSessions, profiles } from "@repo/db/schema";
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

async function captureSessionSurface(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
) {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const path = testInfo.outputPath(`coaching-poc-session-${viewport.width}.png`);
    await page.screenshot({ fullPage: true, path, scale: "css" });
    await testInfo.attach(`coaching-poc-session-${viewport.width}`, {
      contentType: "image/png",
      path,
    });
  }
}

test("coaching POC session shows structured instructions and persists a valid past completion", async ({
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
  const { activityPlanId } = await seedOwnedActivityPlan(
    e2eDatabase,
    athleteActor.profileId,
    e2eIdentity.suffix("coaching-poc-session", 64),
  );

  await athletePage.goto(`/activity-plans/${activityPlanId}`);
  await waitForAppHydration(athletePage);
  await athletePage.getByLabel("Schedule date", { exact: true }).fill(futureDate);
  await athletePage.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(athletePage.getByRole("button", { name: "Reschedule", exact: true })).toBeVisible();

  const [futureSession] = await e2eDatabase.db
    .select({ id: plannedSessions.id })
    .from(plannedSessions)
    .where(
      and(
        eq(plannedSessions.profile_id, athleteActor.profileId),
        eq(plannedSessions.activity_plan_id, activityPlanId),
      ),
    );
  if (!futureSession) throw new Error("Scheduling did not create a planned session.");

  await athletePage.goto(`/calendar/events/${futureSession.id}?resourceType=planned_session`);
  await expect(
    athletePage.getByRole("heading", { name: "Playwright Tempo Builder" }),
  ).toBeVisible();
  await expect(athletePage.getByText("Session Flow", { exact: true })).toBeVisible();
  await expect(athletePage.getByText("Warm-up", { exact: true })).toBeVisible();
  await expect(athletePage.getByText("Tempo", { exact: true })).toBeVisible();
  await expect(athletePage.getByText("Cool-down", { exact: true })).toBeVisible();
  await expect(athletePage.getByText(/Current activity plan instructions/)).toBeVisible();
  await expect(
    athletePage.getByRole("button", { name: "Complete activity", exact: true }),
  ).toBeDisabled();
  await expect(
    athletePage.getByRole("button", { name: "Complete partially", exact: true }),
  ).toBeDisabled();
  await expect(
    athletePage.getByRole("button", { name: "Skip session", exact: true }),
  ).toBeDisabled();
  await captureSessionSurface(athletePage, testInfo);

  await athletePage.getByRole("link", { name: "Open activity plan", exact: true }).click();
  await athletePage.getByLabel("Schedule date", { exact: true }).fill(pastDate);
  await athletePage.getByRole("button", { name: "Reschedule", exact: true }).click();
  await expect(athletePage.getByText(`Currently scheduled for ${pastDate}.`)).toBeVisible();

  await athletePage.goto(`/calendar/events/${futureSession.id}?resourceType=planned_session`);
  await athletePage.getByRole("button", { name: "Complete activity", exact: true }).click();
  const completedActivity = athletePage.getByRole("link", {
    name: "View linked completed activity",
    exact: true,
  });
  await expect(completedActivity).toBeVisible();
  await athletePage.reload();
  await expect(completedActivity).toBeVisible();
});
