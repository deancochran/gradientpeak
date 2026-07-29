import { expect, test } from "../fixtures";
import {
  cleanupOwnedActivityPlans,
  e2eArtifactIdentity,
  runWithE2ECleanup,
} from "../utils/testData";

const duplicatedPlanDefaultName = "Playwright Tempo Builder (Copy)";
test("athlete can discover and open the activity plan library", async ({ athletePage }) => {
  await athletePage.getByRole("button", { name: /open user menu/i }).click();

  const activityPlansLink = athletePage.getByRole("menuitem", { name: /activity plans/i });
  await expect(activityPlansLink).toBeVisible();
  await activityPlansLink.click();

  await expect(athletePage).toHaveURL(/\/activity-plans$/);
  await expect(athletePage.getByRole("heading", { name: /^activity plans$/i })).toBeVisible();
  const search = athletePage.getByRole("searchbox", { name: /search activity plans/i });
  await expect(search).toBeVisible();
  await expect(athletePage.getByText("20+ activity plans loaded")).toBeVisible();

  await athletePage.getByRole("button", { name: /load more activity plans/i }).click();
  await expect(athletePage.getByText("22 activity plans loaded")).toBeVisible();

  await athletePage.getByRole("button", { name: /^running$/i }).click();
  await expect(athletePage.getByRole("button", { name: /playwright library 02/i })).toHaveCount(0);

  await athletePage.getByRole("button", { name: /^all$/i }).click();
  await search.fill("Tempo Builder");
  const planCard = athletePage.getByRole("button", { name: /playwright tempo builder/i });
  await expect(planCard).toBeVisible();
  await planCard.click();

  await expect(athletePage).toHaveURL(/\/activity-plans\/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee$/);
  await expect(
    athletePage.getByRole("heading", { name: /playwright tempo builder/i }),
  ).toBeVisible();
  await expect(athletePage.getByText("Bring bottles")).toBeVisible();
  await expect(athletePage.getByTestId("activity-plan-structure")).toBeVisible();
  await expect(athletePage.getByTestId("activity-plan-comments")).toBeVisible();
  await expect(athletePage.getByRole("heading", { name: "Owner" })).toBeVisible();
  await expect(athletePage.getByRole("button", { name: /^like$/i })).toBeVisible();
});

test("athlete can duplicate a shared plan into an owned editable copy", async ({
  athletePage,
}, testInfo) => {
  const duplicatedPlanName = e2eArtifactIdentity(testInfo, "duplicated activity plan");
  const cleanup = () =>
    cleanupOwnedActivityPlans({
      planNames: [duplicatedPlanDefaultName, duplicatedPlanName],
    });

  await runWithE2ECleanup(testInfo, cleanup, async () => {
    await athletePage.goto("/activity-plans/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    await athletePage.getByRole("button", { name: /^duplicate$/i }).click();

    await expect(
      athletePage.getByRole("heading", { name: duplicatedPlanDefaultName }),
    ).toBeVisible();
    await athletePage.getByRole("button", { name: /^edit$/i }).click();
    await athletePage.getByLabel("Plan name").fill(duplicatedPlanName);
    await athletePage.getByRole("button", { name: /save changes/i }).click();
    await expect(athletePage.getByRole("heading", { name: duplicatedPlanName })).toBeVisible();

    await athletePage.getByRole("button", { name: /^delete$/i }).click();
    await athletePage.getByRole("button", { name: /^delete plan$/i }).click();
    await expect(athletePage).toHaveURL(/\/activity-plans$/);
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
    await athletePage.goto("/activity-plans");
    await athletePage.getByRole("button", { name: /create activity plan/i }).click();
    await athletePage.getByLabel("Plan name").fill(authoredPlanName);
    await athletePage.getByLabel("Description").fill("A structured browser-authored activity plan");
    await athletePage.getByLabel("Plan activity category").selectOption("bike");
    await athletePage.getByLabel("Step 1").fill("Controlled threshold");
    await athletePage.getByRole("button", { name: "Activity" }).click();
    await athletePage.getByRole("button", { name: /create plan/i }).click();

    await expect(athletePage.getByRole("heading", { name: authoredPlanName })).toBeVisible();
    await expect(athletePage.getByText("Controlled threshold")).toBeVisible();

    await athletePage.getByRole("button", { name: /^edit$/i }).click();
    await athletePage.getByLabel("Plan name").fill(editedPlanName);
    await athletePage.getByRole("button", { name: /save changes/i }).click();
    await expect(athletePage.getByRole("heading", { name: editedPlanName })).toBeVisible();

    await athletePage.getByRole("button", { name: /^like$/i }).click();
    await expect(athletePage.getByRole("button", { name: /1 like/i })).toBeVisible();
    await athletePage.getByLabel("Add a comment").fill("Ready for Tuesday");
    await athletePage.getByRole("button", { name: /post comment/i }).click();
    await expect(athletePage.getByText("Ready for Tuesday")).toBeVisible();

    await athletePage.getByLabel("Schedule date").fill("2026-08-04");
    await athletePage.getByRole("button", { name: /^schedule$/i }).click();
    await expect(athletePage.getByRole("button", { name: /^reschedule$/i })).toBeVisible();

    await athletePage.getByLabel("Schedule date").fill("2026-08-05");
    await athletePage.getByRole("button", { name: /^reschedule$/i }).click();
    await expect(athletePage.getByText(/currently scheduled for 2026-08-05/i)).toBeVisible();

    await athletePage.getByRole("button", { name: /remove from schedule/i }).click();
    await expect(athletePage.getByRole("button", { name: /^schedule$/i })).toBeVisible();

    await athletePage.getByLabel("Schedule date").fill("2026-08-06");
    await athletePage.getByRole("button", { name: /^schedule$/i }).click();
    await expect(athletePage.getByRole("button", { name: /^reschedule$/i })).toBeVisible();

    await athletePage.getByRole("button", { name: /^delete$/i }).click();
    await expect(athletePage.getByText(/has 1 scheduled session/i)).toBeVisible();
    await athletePage.getByRole("button", { name: /remove schedules and delete/i }).click();
    await expect(athletePage).toHaveURL(/\/activity-plans$/);
  });
});
