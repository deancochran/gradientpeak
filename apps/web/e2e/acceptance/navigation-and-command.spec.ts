import { expect, test } from "@playwright/test";

import { login, openMobileNavigation } from "./helpers";

test("navigates to Profile and Settings from the desktop header", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await login(page);

  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/[0-9a-f-]+$/);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("navigates to Profile and Settings from the mobile menu", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await login(page);

  await openMobileNavigation(page);
  await page
    .getByRole("dialog", { name: "Navigation" })
    .getByRole("link", { name: "Profile" })
    .click();
  await expect(page).toHaveURL(/\/user\/[0-9a-f-]+$/);

  await openMobileNavigation(page);
  await page
    .getByRole("dialog", { name: "Navigation" })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("Enter selects the matching command destination", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: "Search routes, plans, athletes, or actions" }).click();
  const searchInput = page.getByPlaceholder("Search the web app...");
  await searchInput.fill("settings");
  await searchInput.press("Enter");

  await expect(page).toHaveURL(/\/settings$/);
});
