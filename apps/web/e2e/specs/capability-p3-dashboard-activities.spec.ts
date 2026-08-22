import { expect, test } from "../fixtures";
import { withPlanningPathFixture } from "../planning/data";

test("home.view-dashboard shows seeded plan data", async ({ athletePage }, testInfo) => {
  await withPlanningPathFixture(testInfo, async () => {
    await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();

    for (const title of ["Fitness", "Fatigue", "Form", "Consistency", "Active Plan"]) {
      await expect(athletePage.getByText(title, { exact: true })).toBeVisible();
    }

    await expect(athletePage.getByText("Playwright Tempo Builder", { exact: true })).toHaveCount(2);
    await expect(
      athletePage.getByRole("heading", { name: "Upcoming Schedule", exact: true }),
    ).toBeVisible();
    await expect(
      athletePage.getByRole("heading", { name: "Current Focus", exact: true }),
    ).toBeVisible();
  });
});
