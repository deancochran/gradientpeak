import { expect, test } from "../fixtures";

test("import-content is available through the current web boundary", async ({ athletePage }) => {
  await athletePage.goto("/activity-plans");
  await expect(athletePage.getByRole("button", { name: /import content/i })).toBeVisible();
});
