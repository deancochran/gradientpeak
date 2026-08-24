import { expect, test } from "../fixtures";

test("[P0] ordinary email sign-in survives reload and sign-out ends the session", async ({
  athleteActor,
  page,
}) => {
  await page.goto("/auth/login?redirect=%2Fsettings");
  await page.getByLabel(/^email/i).fill(athleteActor.email);
  await page.getByLabel(/^password/i).fill(athleteActor.password);
  await page.getByRole("button", { name: /^login$/i }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: /^settings$/i })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/settings$/);
  const accountInformation = page.locator("[data-slot=card]").filter({
    has: page.getByText("Account Information", { exact: true }),
  });
  await expect(accountInformation.getByText(athleteActor.email, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login(?:\?.*)?$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fsettings/);
});

test("sign out ends the current web session and returns to public access", async ({
  athletePage,
}) => {
  await athletePage.goto("/settings");
  await expect(athletePage.getByRole("heading", { name: /^settings$/i })).toBeVisible();
  await athletePage.getByRole("button", { name: "Sign Out", exact: true }).click();

  await expect(athletePage).toHaveURL(/\/auth\/login(?:\?.*)?$/);
  await athletePage.goto("/settings");
  await expect(athletePage).toHaveURL(/\/auth\/login\?redirect=%2Fsettings/);
});
