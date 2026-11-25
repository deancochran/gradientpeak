import {
  authLaneRequestHeaders,
  expect,
  type LaneServer,
  test,
} from "../lane-support/auth/lane-test";
import { signUp, uniqueAuthActor } from "../lane-support/auth/mailbox";
import { AuthPage } from "../pages";
import { createE2EExecutionIdentity } from "../support/identity";
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
  test(`completes identity-first profile-only onboarding on ${viewport.name}`, async ({
    laneServer,
    page,
  }) => {
    await page.setViewportSize(viewport);
    await createVerifiedOnboardingSession({
      actor: uniqueAuthActor(`identity-first-${viewport.name}`),
      laneServer,
      page,
    });

    await expect(page.getByRole("heading", { name: "Finish your profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Connect your accounts" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Goal title")).toHaveCount(0);
    await expect(page.getByLabel("Target date")).toHaveCount(0);
    await new AuthPage(page).completeProfile({
      fullName: `Web ${viewport.name} Athlete`,
      username: `identity_first_${viewport.name}_${createE2EExecutionIdentity(test.info()).suffix(`onboarding-${viewport.name}`, 12)}`,
    });
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/$/);
  });
}
