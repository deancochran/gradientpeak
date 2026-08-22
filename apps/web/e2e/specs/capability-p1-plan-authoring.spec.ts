import { expect, test } from "../fixtures";

test.fail(
  "import-content is not available through the current web boundary",
  async ({ athletePage }) => {
    await athletePage.goto("/activity-plans");
    await expect(athletePage.getByRole("button", { name: /import content/i })).toBeVisible();
  },
);
