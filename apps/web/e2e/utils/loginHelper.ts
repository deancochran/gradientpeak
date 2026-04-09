import { expect, type Page } from "@playwright/test";

/**
 * Test user credentials - these users should be created in the database
 * before running E2E tests (see: utils/testData.ts)
 */
const USER_CREDENTIALS = {
  admin: { email: "admin@test.com", password: "TestPass123!" },
  coach: { email: "coach@test.com", password: "TestPass123!" },
  athlete: { email: "athlete@test.com", password: "TestPass123!" },
};
type UserRole = keyof typeof USER_CREDENTIALS;

/**
 * Navigate to login page and perform login
 * If user doesn't exist, creates them via sign-up
 */
export async function loginAs(page: Page, userRole: UserRole) {
  const credentials = USER_CREDENTIALS[userRole];
  const emailInput = page.getByTestId("login-email-input");
  const passwordInput = page.getByTestId("login-password-input");

  // Navigate to login page
  await page.goto("/auth/login");
  await page.waitForURL("**/auth/login", { timeout: 10000 });

  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await expect(passwordInput).toBeVisible();

  // Fill in email and password
  await emailInput.fill(credentials.email);
  await passwordInput.fill(credentials.password);

  // Click the login button
  await page.getByTestId("login-submit-button").click();

  // Wait for a navigation to happen or a timeout if we stay on the same page
  await page.waitForNavigation({ waitUntil: "networkidle", timeout: 5000 }).catch(() => {
    // This is fine, it means we likely stayed on the login page
  });

  // If we're still on the login page, the user probably doesn't exist.
  if (page.url().includes("/auth/login")) {
    // eslint-disable-next-line no-console
    console.log(`User ${credentials.email} not found, creating via signup...`);

    // Navigate to signup page
    await page.goto("/auth/sign-up");

    // Fill in the signup form
    await page.locator("#email").fill(credentials.email);
    await page.locator("#password").fill(credentials.password);
    await page.locator("#repeat-password").fill(credentials.password);

    // Click sign up button
    await page.getByRole("button", { name: /sign up/i }).click();

    // Wait for redirection to the success page, which confirms creation
    await page.waitForURL("**/auth/sign-up-success", { timeout: 10000 });
    // eslint-disable-next-line no-console
    console.log("Signup successful, performing final login...");

    // Now that user is created, log them in
    await page.goto("/auth/login");
    await page.waitForURL("**/auth/login", { timeout: 10000 });
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill(credentials.email);
    await passwordInput.fill(credentials.password);
    await page.getByTestId("login-submit-button").click();
  }

  // At this point, we should be logged in and redirected.
  // Assert that we are on the main page and no longer in the auth flow.
  await expect(page).toHaveURL(/.*\/$/);
  await expect(page).not.toHaveURL(/.*auth/);

  // Wait for page to fully load
  await page.waitForLoadState("networkidle");
}

/**
 * Navigate to login page (without logging in)
 */
export async function goToLoginPage(page: Page) {
  await page.goto("/auth/login");
}
