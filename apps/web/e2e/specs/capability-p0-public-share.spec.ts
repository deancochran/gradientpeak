import { expect, test } from "../fixtures";
import { withTrainingPlanLibraryFixture } from "../training-plans/data";

test("public activity-plan and training-plan links render anonymous readers", async ({
  page,
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, async ({ templateName }) => {
    await page.goto("/share/activity-plans/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    await expect(page.getByRole("heading", { name: "Playwright Tempo Builder" })).toBeVisible();
    await expect(page.getByText("Activity plan overview")).toBeVisible();
    await expect(page.getByText("Activity structure")).toBeVisible();

    await athletePage.goto("/training-plans");
    await athletePage.getByRole("searchbox", { name: /search training plans/i }).fill(templateName);
    const template = athletePage.getByText(templateName, { exact: true }).first();
    await expect(template).toBeVisible();
    await template.click();
    const trainingPlanId = athletePage.url().match(/\/training-plans\/([0-9a-f-]+)/)?.[1];
    if (!trainingPlanId) throw new Error("Training-plan fixture did not expose a UUID URL");

    await page.goto(`/share/training-plans/${trainingPlanId}`);
    await expect(page.getByRole("heading", { name: templateName })).toBeVisible();
    await expect(page.getByText("Plan overview")).toBeVisible();
  });
});
