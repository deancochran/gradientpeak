import {
  authLaneRequestHeaders,
  expect,
  type LaneServer,
  test,
} from "../lane-support/auth/lane-test";
import { signUp, uniqueAuthActor } from "../lane-support/auth/mailbox";
import { currentContractEpochHeaders } from "../utils/contractEpoch";

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
  expect(
    (
      await page.request.get(verification.actionUrl, {
        headers: authLaneRequestHeaders(laneServer),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: actor,
        headers: authLaneRequestHeaders(laneServer, currentContractEpochHeaders),
      })
    ).status(),
  ).toBe(200);
  await page.goto("/onboarding");
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`starts with provider selection only and completes no-provider review on ${viewport.name}`, async ({
    laneServer,
    page,
  }) => {
    await page.setViewportSize(viewport);
    await createVerifiedOnboardingSession({
      actor: uniqueAuthActor(`provider-first-${viewport.name}`),
      laneServer,
      page,
    });

    await expect(page.getByRole("heading", { name: "Connect your accounts" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Profile and intent" })).toBeVisible();
    await page.getByLabel("Full name").fill(`Web ${viewport.name} Athlete`);
    await page.getByLabel(/^Username/).fill(`provider_first_${viewport.name}_${Date.now()}`);
    await page.getByLabel("Goal title").fill("Build consistency");
    await page.getByLabel("Target date").fill("2027-06-01");
    await page.getByRole("button", { name: "Finalize setup" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/$/);
  });
}
