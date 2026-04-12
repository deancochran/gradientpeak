import { expect, type Page } from "@playwright/test";

const USER_CREDENTIALS = {
  athlete: { email: "athlete@test.com", password: "TestPass123!" },
  coach: { email: "coach@test.com", password: "TestPass123!" },
};

type UserRole = keyof typeof USER_CREDENTIALS;

export async function loginAs(page: Page, userRole: UserRole) {
  const credentials = USER_CREDENTIALS[userRole];

  await page.goto("/auth/login");
  await page.waitForURL("**/auth/login", { timeout: 10000 });
  await expect(page.getByLabel("Email *")).toBeVisible();
  await expect(page.getByLabel("Password *")).toBeVisible();

  await page.getByLabel("Email *").fill(credentials.email);
  await page.getByLabel("Password *").fill(credentials.password);
  await page.getByRole("button", { name: /^login$/i }).click();

  await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}
