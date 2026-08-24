import { expect, test } from "../fixtures";
import { ActivityPlansPage, expectNoHorizontalOverflow, ShellPage } from "../pages";
import {
  cleanupOwnedActivityPlans,
  e2eArtifactIdentity,
  runWithE2ECleanup,
} from "../utils/testData";

const duplicatedPlanDefaultName = "Playwright Tempo Builder (Copy)";
test("athlete can discover and open the activity plan library", async ({
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
  const search = plans.searchInput();
  await expect(search).toBeVisible();
  await expect(athletePage.getByText("20+ activity plans loaded")).toBeVisible();

  await athletePage.getByRole("button", { name: /load more activity plans/i }).click();
  await expect(athletePage.getByText("22 activity plans loaded")).toBeVisible();

  await athletePage.getByRole("button", { name: /^running$/i }).click();
  await expect(athletePage.getByRole("button", { name: /playwright library 02/i })).toHaveCount(0);

  await athletePage.getByRole("button", { name: /^all$/i }).click();
  await search.fill("Tempo Builder");
  const planCard = plans.card(/playwright tempo builder/i);
  await expect(planCard).toBeVisible();
  await planCard.click();

  await expect(athletePage).toHaveURL(`/activity-plans/${athleteActor.activityPlanId}`);
  await expect(
    athletePage.getByRole("heading", { name: /playwright tempo builder/i }),
  ).toBeVisible();
  await expect(athletePage.getByText("Bring bottles")).toBeVisible();
  await expect(athletePage.getByTestId("activity-plan-structure")).toBeVisible();
  await expect(athletePage.getByTestId("activity-plan-comments")).toBeVisible();
  await expect(athletePage.getByText("Owner", { exact: true })).toBeVisible();
  await expect(athletePage.getByRole("button", { name: /^like$/i })).toBeVisible();
  await expectNoHorizontalOverflow(athletePage);
});

test("athlete can duplicate a shared plan into an owned editable copy", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  const duplicatedPlanName = e2eArtifactIdentity(testInfo, "duplicated activity plan");
  const cleanup = () =>
    cleanupOwnedActivityPlans({
      planNames: [duplicatedPlanDefaultName, duplicatedPlanName],
    });

  await runWithE2ECleanup(testInfo, cleanup, async () => {
    const plans = new ActivityPlansPage(athletePage);
    await athletePage.goto(`/activity-plans/${athleteActor.activityPlanId}`);
    await plans.duplicate();

    await expect(
      athletePage.getByRole("heading", { name: duplicatedPlanDefaultName }),
    ).toBeVisible();
    await athletePage.getByRole("button", { name: /^edit$/i }).click();
    await athletePage.getByLabel("Plan name").fill(duplicatedPlanName);
    await athletePage.getByRole("button", { name: /save changes/i }).click();
    await expect(athletePage.getByRole("heading", { name: duplicatedPlanName })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: duplicatedPlanName })).toBeVisible();

    await athletePage.getByRole("button", { name: /^delete$/i }).click();
    await athletePage.getByRole("button", { name: /^delete plan$/i }).click();
    await expect(athletePage).toHaveURL(/\/activity-plans$/);

    await athletePage.goto(`/activity-plans/${athleteActor.activityPlanId}`);
    await expect(
      athletePage.getByRole("heading", { name: "Playwright Tempo Builder" }),
    ).toBeVisible();
    await expect(athletePage.getByText("Tempo", { exact: true })).toBeVisible();
  });
});

test("athlete can author, edit, schedule, comment on, and dependency-delete a plan", async ({
  athletePage,
}, testInfo) => {
  const authoredPlanName = e2eArtifactIdentity(testInfo, "authored activity plan");
  const editedPlanName = e2eArtifactIdentity(testInfo, "edited activity plan");
  const cleanup = () =>
    cleanupOwnedActivityPlans({
      planNames: [authoredPlanName, editedPlanName],
    });

  await runWithE2ECleanup(testInfo, cleanup, async () => {
    const plans = new ActivityPlansPage(athletePage);
    await plans.create({
      name: authoredPlanName,
      description: "A structured browser-authored activity plan",
      category: "bike",
      firstStep: "Controlled threshold",
    });
    await expect(athletePage.getByText("Controlled threshold")).toBeVisible();

    await athletePage.getByRole("button", { name: /^edit$/i }).click();
    await athletePage.getByLabel("Plan name").fill(editedPlanName);
    await athletePage.getByRole("textbox", { name: "Step 1" }).fill("Edited threshold");
    await athletePage.getByRole("spinbutton", { name: "Amount" }).first().fill("900");
    await athletePage.getByRole("spinbutton", { name: "Intensity" }).first().fill("7");
    await athletePage.getByRole("button", { name: /save changes/i }).click();
    await expect(athletePage.getByRole("heading", { name: editedPlanName })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: editedPlanName })).toBeVisible();
    await expect(athletePage.getByText("Edited threshold", { exact: true })).toBeVisible();
    await expect(athletePage.getByText("900 sec · 7 RPE", { exact: true })).toBeVisible();

    await athletePage.getByRole("button", { name: /^like$/i }).click();
    await expect(athletePage.getByRole("button", { name: /1 like/i })).toBeVisible();
    await athletePage.getByLabel("Add a comment").fill("Ready for Tuesday");
    await athletePage.getByRole("button", { name: /post comment/i }).click();
    await expect(athletePage.getByText("Ready for Tuesday")).toBeVisible();

    await plans.schedule("2026-08-04");
    await expect(athletePage.getByRole("button", { name: /^reschedule$/i })).toBeVisible();

    await athletePage.getByLabel("Schedule date").fill("2026-08-05");
    await athletePage.getByRole("button", { name: /^reschedule$/i }).click();
    await expect(athletePage.getByText(/currently scheduled for 2026-08-05/i)).toBeVisible();

    await athletePage.getByRole("button", { name: /remove from schedule/i }).click();
    await expect(athletePage.getByRole("button", { name: /^schedule$/i })).toBeVisible();

    await plans.schedule("2026-08-06");
    await expect(athletePage.getByRole("button", { name: /^reschedule$/i })).toBeVisible();

    await athletePage.getByRole("button", { name: /^delete$/i }).click();
    await expect(athletePage.getByText(/has 1 scheduled session/i)).toBeVisible();
    await athletePage.getByRole("button", { name: /remove schedules and delete/i }).click();
    await expect(athletePage).toHaveURL(/\/activity-plans$/);
  });
});

test("athlete can correct an invalid structure and retry authoring", async ({
  athletePage,
}, testInfo) => {
  const authoredPlanName = e2eArtifactIdentity(testInfo, "structure retry activity plan");
  const cleanup = () => cleanupOwnedActivityPlans({ planNames: [authoredPlanName] });

  await runWithE2ECleanup(testInfo, cleanup, async () => {
    const plans = new ActivityPlansPage(athletePage);
    await plans.openLibrary();
    await plans.startCreate();
    await athletePage.getByLabel("Plan name").fill(authoredPlanName);

    await athletePage.getByRole("button", { name: "Delete segment" }).click();
    await expect(athletePage.getByRole("alert")).toContainText("Structure needs attention");
    await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();

    await athletePage.getByRole("button", { name: "Activity" }).click();
    await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeEnabled();
    await athletePage.getByRole("button", { name: "Create plan" }).click();
    await expect(athletePage.getByRole("heading", { name: authoredPlanName })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByTestId("activity-plan-structure")).toContainText("Activity");
  });
});
