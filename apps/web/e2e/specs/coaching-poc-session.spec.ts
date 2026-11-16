import { createHash } from "node:crypto";
import {
  activityPlanSemanticHash,
  activityPlanStructureSchema,
  getCanonicalActivityPlanStructureHashInput,
} from "@repo/core/activity-plan";
import { activityPlans, plannedSessions, profiles } from "@repo/db/schema";
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

const sessionStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "e3000000-0000-4000-8000-000000000001",
      name: "Warm-up",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "%FTP", intensity: 60 }],
    },
    {
      type: "repeat",
      id: "e3000000-0000-4000-8000-000000000002",
      count: 3,
      steps: [
        {
          type: "step",
          id: "e3000000-0000-4000-8000-000000000003",
          name: "Main set",
          duration: { type: "time", seconds: 600 },
          targets: [{ type: "%FTP", intensity: 90 }],
        },
        {
          type: "step",
          id: "e3000000-0000-4000-8000-000000000004",
          name: "Recovery",
          duration: { type: "time", seconds: 120 },
          targets: [{ type: "%FTP", intensity: 50 }],
        },
      ],
    },
    {
      type: "step",
      id: "e3000000-0000-4000-8000-000000000005",
      name: "Cool-down",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "%FTP", intensity: 55 }],
    },
  ],
});

function sessionStructureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256")
    .update(getCanonicalActivityPlanStructureHashInput(structure))
    .digest("hex")}`;
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
  await e2eDatabase.db
    .update(activityPlans)
    .set({
      structure: sessionStructure,
      structure_hash: sessionStructureHash(sessionStructure),
      semantic_hash: activityPlanSemanticHash({
        structure: sessionStructure,
        trainingIntent: "general_maintenance",
      }),
      updated_at: new Date(),
    })
    .where(eq(activityPlans.id, activityPlanId));

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
  await expect(athletePage.getByText("Main set", { exact: true })).toBeVisible();
  await expect(athletePage.getByText("Recovery", { exact: true })).toBeVisible();
  await expect(athletePage.getByText("Cool-down", { exact: true })).toBeVisible();
  await expect(athletePage.getByText(/600 sec.*60% FTP/)).toBeVisible();
  await expect(athletePage.getByText(/600 sec.*90% FTP/)).toBeVisible();
  await expect(athletePage.getByText("Repeat 3 times", { exact: true })).toBeVisible();
  await expect(athletePage.getByText(/Current activity plan instructions/)).toBeVisible();
  await expectNoHorizontalOverflow(athletePage);
  const headingBounds = await athletePage
    .getByRole("heading", { name: "Playwright Tempo Builder" })
    .boundingBox();
  const viewport = athletePage.viewportSize();
  if (viewport?.width === 390 && headingBounds) {
    expect(headingBounds.x + headingBounds.width).toBeLessThanOrEqual(viewport.width);
  }
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
