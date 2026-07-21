import { expect, test } from "../lane-support/auth/lane-test";
import { login, signUp, uniqueAuthActor } from "../lane-support/auth/mailbox";

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`persists full onboarding with baseline provenance, preferences, goal, and available social choices on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const actor = uniqueAuthActor(`onboarding-${viewport.name}`);
    const verification = await signUp(page, actor);
    await page.goto(verification.actionUrl);
    await login(page, actor);

    await expect(page.getByRole("heading", { name: /set up your profile/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /provider setup and import status/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /refresh provider status/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /review integration status after setup/i }),
    ).toHaveAttribute("href", "/integrations");
    await page.getByLabel(/full name/i).fill(`Web ${viewport.name} Athlete`);
    await page.getByLabel(/^username/i).fill(`web_${viewport.name}_${Date.now()}`);
    await page.getByLabel(/experience level/i).selectOption("advanced");
    await page.getByLabel("Improve fitness").check();
    await page.getByLabel("Weight (kg)").fill("72.5");
    await page.getByLabel("weight_kg source").selectOption("manual");
    await page.getByLabel("Maximum heart rate (bpm)").fill("188");
    await page.getByLabel("max_hr source").selectOption("estimated");
    await page.getByLabel("Save these preferences").check();
    await page.getByLabel("Progression approach").selectOption("balanced");
    await page.getByLabel("Goal title").fill("Run consistently");
    await page.getByLabel("Target date").fill("2027-06-01");
    await page.getByLabel("Activity").selectOption("run");
    for (const name of ["invitation_ids", "group_ids", "follow_profile_ids"]) {
      const option = page.locator(`input[name="${name}"]`).first();
      if ((await option.count()) > 0) await option.check();
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: /finish setup/i }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/$/);
  });
}

test("cross-site request cannot complete onboarding", async ({ page }) => {
  const actor = uniqueAuthActor("csrf-onboarding");
  const verification = await signUp(page, actor);
  await page.goto(verification.actionUrl);
  await login(page, actor);
  const actionUrl = await page.locator('form[method="post"]').last().getAttribute("action");
  expect(actionUrl).toBeTruthy();
  const response = await page.request.post(actionUrl as string, {
    form: {
      experience_level: "skip",
      full_name: "Forged",
      redirect: "/",
      username: `forged_${Date.now()}`,
    },
    headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" },
  });
  expect(response.status()).toBe(403);
});
