import { expect, test } from "../fixtures";
import { waitForProcedure } from "../lane-support/feed/discovery";
import { seedSocialState } from "../lane-support/social/social-state";
import { ProfilePage, withTrpcResponse } from "../pages";

test("profile hub and settings expose owned profile journeys", async ({ athletePage }) => {
  const profile = new ProfilePage(athletePage);
  await profile.openOwnedProfile();

  await expect(athletePage.getByRole("heading", { name: /your library/i })).toBeVisible();
  await expect(athletePage.getByRole("heading", { name: /^groups$/i })).toBeVisible();
  await profile.openSettings();

  await expect(athletePage).toHaveURL(/\/settings/);
  await expect(athletePage.getByLabel("Full name")).toBeVisible();
  await expect(athletePage.getByLabel("Preferred units")).toBeVisible();
  await expect(athletePage.getByRole("group", { name: /theme preference/i })).toBeVisible();
  await expect(athletePage.getByLabel("Current password")).toBeVisible();
  await expect(athletePage.getByRole("button", { name: /sign out other sessions/i })).toBeVisible();
});

test("private profiles protect details while a follow request persists and is restored", async ({
  athletePage,
  coachActor: _coachActor,
  request,
}) => {
  const social = await seedSocialState(request);
  try {
    const profileResponse = waitForProcedure(athletePage, "social.searchUsers");
    await athletePage.goto("/search?q=playwright_coach");
    await athletePage.getByRole("tab", { name: "Profiles" }).click();
    await expect((await profileResponse).ok()).toBeTruthy();
    await athletePage
      .getByTestId(`discover-users-${social.coachId}`)
      .getByRole("link", { name: "View profile" })
      .click();

    await expect(athletePage.getByText("This account is private")).toBeVisible();
    await expect(athletePage.getByText("Area 4 private coach biography")).toHaveCount(0);
    await expect(athletePage.getByRole("heading", { name: "Recent Activities" })).toHaveCount(0);
    await expect(athletePage.getByRole("button", { name: "Message" })).toBeVisible();

    await athletePage.getByRole("button", { name: "Follow" }).click();
    await expect(athletePage.getByRole("button", { name: "Cancel request" })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("button", { name: "Cancel request" })).toBeVisible();

    await athletePage.getByRole("button", { name: "Cancel request" }).click();
    await expect(athletePage.getByRole("button", { name: "Follow" })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("button", { name: "Follow" })).toBeVisible();
  } finally {
    await social.cleanup();
  }
});

test("social graph pages expose data, empty, error recovery, and bounded controls", async ({
  athletePage,
  coachActor: _coachActor,
  request,
}) => {
  test.setTimeout(120_000);
  const social = await test.step("seed social actors and state", () => seedSocialState(request));
  try {
    await test.step("load retained follower data", async () => {
      const followersResponse = waitForProcedure(athletePage, "social.getFollowers");
      await athletePage.goto(`/user/${social.athleteId}/followers`);
      await expect((await followersResponse).ok()).toBeTruthy();
      await expect(athletePage.getByRole("heading", { name: "1 followers" })).toBeVisible();
      await expect(athletePage.getByRole("link", { name: "playwright_coach" })).toBeVisible();
      await expect(athletePage.getByRole("link", { name: "Load more" })).toHaveCount(0);
      await expect(athletePage.getByRole("link", { name: "Back" })).toBeVisible();
    });

    await test.step("surface and recover from retained follower refetch failure", async () => {
      await expect(athletePage.getByRole("link", { name: "playwright_coach" })).toBeVisible();
      await expect(athletePage.getByRole("button", { name: "Refresh followers" })).toBeVisible();
      await withTrpcResponse(
        athletePage,
        "social.getFollowers",
        {
          status: 503,
          body: {
            error: {
              json: {
                code: -32603,
                data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 },
                message: "Injected follower refetch failure",
              },
            },
          },
        },
        async () => {
          await athletePage
            .getByRole("button", { name: "Refresh followers" })
            .click({ timeout: 10_000 });
          await expect(athletePage.getByRole("alert")).toContainText("Unable to load followers", {
            timeout: 15_000,
          });
          await expect(athletePage.getByRole("link", { name: "playwright_coach" })).toBeVisible();
        },
      );
      const retryResponse = waitForProcedure(athletePage, "social.getFollowers");
      await athletePage.getByRole("button", { name: "Try again" }).click();
      await expect((await retryResponse).ok()).toBeTruthy();
      await expect(athletePage.getByRole("alert")).toHaveCount(0);
    });

    await test.step("show an empty following list", async () => {
      const followingResponse = waitForProcedure(athletePage, "social.getFollowing");
      await athletePage.goto(`/user/${social.athleteId}/following`);
      await expect((await followingResponse).ok()).toBeTruthy();
      await expect(athletePage.getByText("Not following anyone yet")).toBeVisible();
    });
  } finally {
    await test.step("restore seeded social state", () => social.cleanup());
  }
});
