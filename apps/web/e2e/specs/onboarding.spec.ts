import {
  authLaneRequestHeaders,
  expect,
  type LaneServer,
  test,
} from "../lane-support/auth/lane-test";
import { signUp, uniqueAuthActor } from "../lane-support/auth/mailbox";
import { currentContractEpochHeaders } from "../utils/contractEpoch";

async function reloadAfterRouteRedirect(page: Parameters<typeof signUp>[0]) {
  try {
    await page.reload();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/(?:NS_BINDING_ABORTED|NS_ERROR_FAILURE|ERR_ABORTED)/.test(error.message)
    ) {
      throw error;
    }
  }
}

async function createVerifiedOnboardingSession({
  actor,
  laneServer,
  page,
}: {
  actor: { email: string; password: string };
  laneServer: LaneServer;
  page: Parameters<typeof signUp>[0];
}) {
  const verification = await signUp(page, actor);
  const verificationResponse = await page.request.get(verification.actionUrl, {
    headers: authLaneRequestHeaders(laneServer),
  });
  expect(verificationResponse.status()).toBe(200);

  const signInResponse = await page.request.post("/api/auth/sign-in/email", {
    data: actor,
    headers: authLaneRequestHeaders(laneServer, currentContractEpochHeaders),
  });
  expect(signInResponse.status()).toBe(200);
  expect((await page.context().cookies()).some((cookie) => cookie.name.includes("session"))).toBe(
    true,
  );

  await page.goto("/onboarding");
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`persists full onboarding with baseline provenance, preferences, goal, and available social choices on ${viewport.name}`, async ({
    laneServer,
    page,
  }) => {
    await page.setViewportSize(viewport);
    const actor = uniqueAuthActor(`onboarding-${viewport.name}`);
    const fullName = `Web ${viewport.name} Athlete`;
    const username = `web_${viewport.name}_${Date.now()}`;
    await createVerifiedOnboardingSession({ actor, laneServer, page });

    await expect(page.getByRole("heading", { name: /set up your profile/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /provider setup and import status/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /refresh provider status/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /review integration status after setup/i }),
    ).toHaveAttribute("href", "/integrations");
    await page.getByLabel(/full name/i).fill(fullName);
    await page.getByLabel(/^username/i).fill(username);
    await page.getByLabel(/experience level/i).selectOption("advanced");
    await page.getByLabel("Improve fitness").check();
    await page.getByLabel("Weight (kg)").fill("72.5");
    await page.getByLabel("weight_kg source").selectOption("manual");
    await page.getByLabel("Maximum heart rate (bpm)").fill("188");
    await page.getByLabel("max_hr source").selectOption("estimated");
    await page.getByLabel("Save these preferences").check();
    await page.getByLabel("Progression approach").selectOption("push_harder");
    await page.getByLabel("Minimum sessions/week").fill("4");
    await page.getByLabel("Maximum sessions/week").fill("6");
    await page.getByLabel("Maximum session minutes").fill("95");
    await page.getByLabel("Maximum weekly minutes").fill("420");
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

    if (viewport.name === "desktop") {
      await page.goto("/settings");
      await reloadAfterRouteRedirect(page);
      await expect(page.getByLabel("Full name")).toHaveValue(fullName);
      await expect(page.getByLabel("Username")).toHaveValue(username);

      await page.goto("/goals");
      await expect(page.getByText("Run consistently", { exact: true })).toBeVisible();

      await page.goto("/training-preferences");
      await expect(page.getByRole("heading", { name: "Training preferences" })).toBeVisible();
      await page.getByRole("button", { name: "Schedule" }).click();
      await expect(page.getByTestId("training-preferences-min-sessions-per-week")).toHaveValue("4");
      await expect(page.getByTestId("training-preferences-max-sessions-per-week")).toHaveValue("6");
      await expect(
        page.getByTestId("training-preferences-max-single-session-duration"),
      ).toHaveValue("95");
      await expect(page.getByTestId("training-preferences-max-weekly-duration")).toHaveValue("420");
      await page.getByRole("button", { name: "Training style" }).click();
      await expect(page.getByTestId("training-preferences-progression-pace")).toHaveValue("0.75");

      await page.goto("/profile-metrics");
      await expect(page.getByRole("button", { name: /weight/i })).toContainText("72.5");
      await expect(page.getByRole("button", { name: /max.*heart/i })).toContainText("188");
    }

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/$/);
  });
}

test("rejects invalid preference ranges without completing onboarding, then permits a corrected retry", async ({
  laneServer,
  page,
}) => {
  const actor = uniqueAuthActor("onboarding-validation");
  await createVerifiedOnboardingSession({ actor, laneServer, page });
  await page.getByLabel(/full name/i).fill("Validation Athlete");
  await page.getByLabel(/^username/i).fill(`validation_${Date.now()}`);
  await page.getByLabel("Save these preferences").check();
  await page.getByLabel("Minimum sessions/week").fill("8");
  await page.getByLabel("Maximum sessions/week").fill("2");
  await page.getByRole("button", { name: /finish setup/i }).click();

  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  await expect(
    page.getByText(/minimum sessions per week cannot exceed maximum sessions/i),
  ).toBeVisible();
  const actionUrl = await page.locator('form[method="post"]').last().getAttribute("action");
  expect(actionUrl).toBeTruthy();
  const crossSiteResponse = await page.request.post(actionUrl as string, {
    form: {
      experience_level: "skip",
      full_name: "Forged",
      redirect: "/",
      username: `forged_${Date.now()}`,
    },
    headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" },
  });
  expect(crossSiteResponse.status()).toBe(403);

  await page.getByLabel(/full name/i).fill("Validation Athlete");
  await page.getByLabel(/^username/i).fill(`validation_retry_${Date.now()}`);
  await page.getByLabel("Save these preferences").check();
  await page.getByLabel("Minimum sessions/week").fill("2");
  await page.getByLabel("Maximum sessions/week").fill("4");
  await page.getByRole("button", { name: /finish setup/i }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
});
