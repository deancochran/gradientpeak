import { expect, test } from "@playwright/test";

import { login } from "./helpers";

test("keeps the authenticated session after unavailable account deletion is dismissed", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings");

  await page.getByRole("button", { name: "Delete Account" }).click();
  await expect(
    page.getByRole("heading", { name: "Account deletion is unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Account Unavailable" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.reload();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
