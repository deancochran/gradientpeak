import { activityPlans, plannedSessions } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { ActivityPlansPage, expectNoHorizontalOverflow, ShellPage } from "../pages";
import { captureAuthoring } from "../pages/authoring";
import {
  cleanupOwnedActivityPlans,
  e2eArtifactIdentity,
  runWithE2ECleanup,
} from "../utils/testData";

test("athlete can discover and open the canonical V5 activity plan library", async ({
  athleteActor,
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  const plans = new ActivityPlansPage(athletePage);
  await shell.openAccountMenu();
  const activityPlansLink = shell.accountDestination(/activity plans/i);
  await expect(activityPlansLink).toBeVisible();
  await activityPlansLink.click();
  await expect(athletePage).toHaveURL(/\/activity-plans$/);
  await expect(athletePage.getByRole("heading", { name: /^activity plans$/i })).toBeVisible();
  await plans.search("Tempo Builder");
  const planCard = plans.card(/playwright tempo builder/i);
  await expect(planCard).toBeVisible();
  await planCard.press("Enter");
  await expect(athletePage).toHaveURL(`/activity-plans/${athleteActor.activityPlanId}`);
  await expect(
    athletePage.getByRole("heading", { name: /playwright tempo builder/i }),
  ).toBeVisible();
  const sessionFlow = athletePage.getByTestId("activity-plan-session-flow");
  await expect(sessionFlow).toContainText("Ordered fixed steps, repeats, and targets.");
  await expect(sessionFlow.getByTestId("activity-plan-session-flow-timeline")).toBeVisible();
  await expect(sessionFlow.locator("ol:has(> li > div > h3)")).toHaveCount(1);
  await expect(sessionFlow).toContainText("Step 1");
  await expect(sessionFlow).toContainText("600 sec · 60% FTP");
  await expect(athletePage.getByTestId("activity-plan-estimates")).toBeVisible();
  await expect(sessionFlow).not.toContainText(/segment|adapt/i);
  await expectNoHorizontalOverflow(athletePage);
});
test("V5 authoring persists zero targets, recovers invalid drafts, and schedules its UI-edited RPE plan reference", async ({
  athleteActor,
  athletePage,
  e2eDatabase,
}, testInfo) => {
  test.setTimeout(120000);
  const plans = new ActivityPlansPage(athletePage);
  const createdName = e2eArtifactIdentity(testInfo, "V5 authored activity plan");
  const editedName = `${createdName} edited`;
  const duplicatedName = `${editedName} (Copy)`;
  const scheduleDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const cleanup = () =>
    cleanupOwnedActivityPlans(
      { planNames: [createdName, editedName, duplicatedName] },
      athleteActor.email,
    );
  await runWithE2ECleanup(testInfo, cleanup, async () => {
    await plans.openLibrary();
    await plans.startCreate();
    await expect(athletePage.getByLabel("Plan name")).toHaveValue("");
    await expect(athletePage.getByTestId(/^activity-plan-item-/)).toHaveCount(0);
    await expect(athletePage.getByText(/segment|training intent|adaptation/i)).toHaveCount(0);
    await athletePage.getByLabel("Plan name").fill(createdName);
    await athletePage.getByLabel("Activity category").selectOption("bike");
    await athletePage.getByRole("button", { name: "Add repeat", exact: true }).click();
    const firstItem = athletePage.getByTestId("activity-plan-item-0");
    await expect(firstItem.getByLabel("Repeat count")).toHaveValue("2");
    await firstItem.getByRole("button", { name: "Add step", exact: true }).click();
    const firstStep = firstItem.locator('[id^="activity-plan-step-"]').first();
    await expect(firstStep.getByRole("button", { name: "Add name", exact: true })).toBeVisible();
    await expect(
      firstStep.getByRole("button", { name: "Add instructions", exact: true }),
    ).toBeVisible();
    await firstStep.getByRole("button", { name: "Add name", exact: true }).click();
    await firstStep.getByLabel("Name (optional)").fill("Zero-power work");
    await firstStep.getByRole("button", { name: "Add instructions", exact: true }).click();
    await firstStep.getByLabel("Instructions (optional)").fill("Keep the cadence smooth.");
    await firstStep.getByLabel("Completion").selectOption("time");
    await firstStep.getByLabel("Quantity").fill("600");
    await firstStep.getByRole("button", { name: "Add target", exact: true }).click();
    await firstStep.getByLabel("Target type 1").selectOption("watts");
    const target = firstStep.getByLabel("Target intensity 1");
    await target.fill("not-a-number");
    await expect(target).toHaveValue("not-a-number");
    await expect(target).toHaveAttribute("aria-invalid", "true");
    await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();
    await target.fill("0");
    await expect(target).toHaveValue("0");
    await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeEnabled();
    await firstStep.getByRole("button", { name: "Add target" }).click();
    const cadenceTarget = firstStep.getByLabel("Target intensity 2");
    await expect(cadenceTarget).toHaveValue("");
    // Core correctly rejects combining perceived effort with objective power.
    // Cadence is the permitted supplemental target for this zero-power step.
    await firstStep.getByLabel("Target type 2").selectOption("cadence");
    await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();
    await cadenceTarget.fill("90");
    await firstStep.getByRole("button", { name: "Close editor for step 1" }).click();
    await firstItem.getByRole("button", { name: "Add step", exact: true }).click();
    const secondStep = firstItem.locator('[id^="activity-plan-step-"]').nth(1);
    await secondStep.getByRole("button", { name: "Add name", exact: true }).click();
    await secondStep.getByLabel("Name (optional)").fill("Recovery");
    await secondStep.getByRole("button", { name: "Add instructions", exact: true }).click();
    await secondStep.getByLabel("Instructions (optional)").fill("Easy spin.");
    await secondStep.getByLabel("Completion").selectOption("time");
    await secondStep.getByLabel("Quantity").fill("60");
    await secondStep.getByRole("button", { name: "Close editor for step 2" }).click();
    await firstItem.getByRole("button", { name: "Duplicate item" }).click();
    await expect(athletePage.getByTestId(/^activity-plan-item-/)).toHaveCount(2);
    const lastItem = athletePage.getByTestId("activity-plan-item-1");
    athletePage.once("dialog", (dialog) => dialog.accept());
    await lastItem.getByRole("button", { name: "Delete item" }).click();
    await expect(athletePage.getByTestId(/^activity-plan-item-/)).toHaveCount(1);
    await captureAuthoring(athletePage, testInfo, "v5-authoring-recovered");
    await athletePage.getByRole("button", { name: "Create plan" }).click();
    await expect(
      athletePage.getByRole("heading", { name: createdName, exact: true }),
    ).toBeVisible();
    const planId = athletePage.url().match(/activity-plans\/([0-9a-f-]+)/i)?.[1];
    if (!planId) throw new Error("Created V5 activity plan did not expose its ID.");
    const stored = async () =>
      (
        await e2eDatabase.db
          .select({ name: activityPlans.name, structure: activityPlans.structure })
          .from(activityPlans)
          .where(
            and(eq(activityPlans.id, planId), eq(activityPlans.profile_id, athleteActor.profileId)),
          )
      )[0];
    await expect.poll(stored).toMatchObject({
      name: createdName,
      structure: {
        version: 5,
        activity_category: "bike",
        items: [
          {
            type: "repeat",
            count: 2,
            steps: [
              {
                name: "Zero-power work",
                instructions: "Keep the cadence smooth.",
                duration: { type: "time", seconds: 600 },
                targets: [
                  { type: "watts", intensity: 0 },
                  { type: "cadence", intensity: 90 },
                ],
              },
              {
                name: "Recovery",
                instructions: "Easy spin.",
                duration: { type: "time", seconds: 60 },
              },
            ],
          },
        ],
      },
    });
    const savedSessionFlow = athletePage.getByTestId("activity-plan-session-flow");
    await expect(savedSessionFlow.getByTestId("activity-plan-session-flow-timeline")).toBeVisible();
    await expect(savedSessionFlow).toContainText("600 sec · 0 W, 90 rpm");
    await expect(savedSessionFlow.locator("ol:has(> li > div > h3)")).toHaveCount(1);
    await expect(athletePage.getByTestId("activity-plan-estimates")).toBeVisible();
    await athletePage.getByRole("button", { name: "Edit", exact: true }).click();
    await athletePage.getByLabel("Plan name").fill(editedName);
    // The persisted zero-watt draft above proves raw-zero authoring. Scheduling
    // absolute watts correctly needs a current calibration fact, and the web
    // product currently exposes no UI to create one. Convert this same saved
    // plan through its editor to RPE before exercising schedule/retry/history.
    await athletePage.getByLabel("Target type 1").selectOption("RPE");
    await athletePage.getByLabel("Target intensity 1").fill("5");
    await athletePage.getByRole("button", { name: "Delete target" }).last().click();
    await athletePage.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(athletePage.getByRole("heading", { name: editedName, exact: true })).toBeVisible();
    await athletePage.reload();
    await expect.poll(stored).toMatchObject({
      name: editedName,
      structure: {
        version: 5,
        items: [
          expect.objectContaining({
            type: "repeat",
            steps: expect.arrayContaining([
              expect.objectContaining({ targets: [{ type: "RPE", intensity: 5 }] }),
            ]),
          }),
        ],
      },
    });
    await plans.duplicate();
    await expect(
      athletePage.getByRole("heading", { name: duplicatedName, exact: true }),
    ).toBeVisible();
    await athletePage.getByRole("button", { name: "Delete", exact: true }).click();
    await athletePage.getByRole("button", { name: "Delete plan", exact: true }).click();
    await expect(athletePage).toHaveURL(/\/activity-plans$/);
    await expect
      .poll(async () =>
        e2eDatabase.db
          .select({ id: activityPlans.id })
          .from(activityPlans)
          .where(
            and(
              eq(activityPlans.name, duplicatedName),
              eq(activityPlans.profile_id, athleteActor.profileId),
            ),
          ),
      )
      .toEqual([]);
    await athletePage.goto(`/activity-plans/${planId}`);
    await expect(athletePage.getByRole("heading", { name: editedName, exact: true })).toBeVisible();
    await plans.schedule(scheduleDate);
    await expect(
      athletePage.getByRole("button", { name: "Reschedule", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await e2eDatabase.db
              .select({
                activityPlanId: plannedSessions.activity_plan_id,
                activityPlanRevision: plannedSessions.activity_plan_revision,
                planningDate: plannedSessions.planning_date,
                prescriptionCapturedAt: plannedSessions.prescription_captured_at,
                resolutionManifest: plannedSessions.resolution_manifest,
                status: plannedSessions.status,
              })
              .from(plannedSessions)
              .where(
                and(
                  eq(plannedSessions.activity_plan_id, planId),
                  eq(plannedSessions.profile_id, athleteActor.profileId),
                ),
              )
          )[0],
      )
      .toEqual(
        expect.objectContaining({
          activityPlanId: planId,
          activityPlanRevision: null,
          planningDate: scheduleDate,
          prescriptionCapturedAt: null,
          resolutionManifest: null,
          status: "scheduled",
        }),
      );
    await athletePage.getByLabel("Add a comment").fill("Ready for the fixed V5 session");
    await athletePage.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(
      athletePage.getByText("Ready for the fixed V5 session", { exact: true }),
    ).toBeVisible();
    await athletePage.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(
      athletePage.getByText(/has planned-session history.*cannot be deleted/i),
    ).toBeVisible();
    await expect(
      athletePage.getByRole("button", { name: "Delete plan", exact: true }),
    ).toBeDisabled();
    await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(athletePage.getByText(`Currently scheduled for ${scheduleDate}.`)).toBeVisible();
  });
});
