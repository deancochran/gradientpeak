import { expect, test } from "../fixtures";

const requiresSeededUsers =
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
  Boolean(process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY);

const authUserTest = requiresSeededUsers ? test : test.skip;

authUserTest(
  "protected routes redirect through login and return after authentication",
  async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/auth\/login\?redirect=/);

    await page.getByLabel("Email *").fill("athlete@test.com");
    await page.getByLabel("Password *").fill("TestPass123!");
    await page.getByRole("button", { name: /^login$/i }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: /^settings$/i })).toBeVisible();
  },
);

test("forgot password submits without leaking email into the URL", async ({ page }) => {
  await page.goto("/auth/forgot-password");

  const email = "athlete@test.com";
  await page.getByLabel("Email *").fill(email);
  await page.getByRole("button", { name: /send reset email/i }).click();

  await expect(page).not.toHaveURL(new RegExp(encodeURIComponent(email)));
  await expect(page).toHaveURL(/(\/auth\/forgot-password(\?submitted=true)?$)|(_serverFn\/)/);
});

test("reset password submit does not leak password values into the URL", async ({ page }) => {
  await page.goto("/auth/update-password?token=test-reset-token");

  const password = "SafePass123!";
  await page.getByLabel("New password *").fill(password);
  await page.getByLabel("Confirm password *").fill(password);
  await page.getByRole("button", { name: /save new password/i }).click();

  await expect(page).not.toHaveURL(new RegExp(encodeURIComponent(password)));
  await expect(page).toHaveURL(/(\/auth\/update-password\?token=test-reset-token$)|(_serverFn\/)/);
});

authUserTest("authenticated user can sign out and return to login", async ({ athletePage }) => {
  await athletePage.getByRole("button", { name: /open user menu/i }).click();
  await athletePage.getByRole("menuitem", { name: /log out/i }).click();

  await expect(athletePage).toHaveURL(/\/auth\/login$/);
  await expect(athletePage.getByRole("heading", { name: /^login$/i })).toBeVisible();
});

authUserTest(
  "settings profile form redirects back to settings after update",
  async ({ athletePage }) => {
    await athletePage.goto("/settings");

    const usernameInput = athletePage.getByLabel("Username");
    await usernameInput.fill("athlete_user");
    await athletePage.getByRole("button", { name: /update profile/i }).click();

    await expect(athletePage).toHaveURL(/\/settings\?updated=profile$/);
    await expect(athletePage.getByText(/profile updated successfully/i)).toBeVisible();
  },
);
