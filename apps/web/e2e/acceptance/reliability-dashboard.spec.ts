import { expect, test } from "@playwright/test";

import { login } from "./helpers";

test("shows an unavailable dashboard and recovers through its scoped retry", async ({ page }) => {
  await page.route("**/api/trpc/home.getDashboard**", async (route) => {
    await route.abort("failed");
  });

  await login(page);

  await expect(page.getByText("Dashboard status could not be loaded")).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();

  await page.unroute("**/api/trpc/home.getDashboard**");
  await retry.click();

  await expect(page.getByText("No upcoming sessions scheduled.")).toBeVisible();
  await expect(page.getByText("Dashboard status could not be loaded")).toHaveCount(0);
});
