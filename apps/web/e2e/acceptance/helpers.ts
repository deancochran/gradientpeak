import { expect, type Page } from "@playwright/test";

import { acceptanceUser } from "./setup";

export async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email *").fill(acceptanceUser.email);
  await page.getByLabel("Password *").fill(acceptanceUser.password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function openMobileNavigation(page: Page) {
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
}
