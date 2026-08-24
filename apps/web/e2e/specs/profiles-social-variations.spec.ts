import { expect, test } from "../fixtures";
import { waitForProcedure } from "../lane-support/feed/discovery";
import { seedSocialState } from "../lane-support/social/social-state";
import { ProfilePage, withTrpcFailure } from "../pages";

test("[variation:profile.hub:narrow-menu] narrow account menu opens the profile library and scrolls to settings", async ({
  athletePage,
}) => {
  await athletePage.setViewportSize({ width: 390, height: 844 });
  const profile = new ProfilePage(athletePage);
  await profile.openOwnedProfile("keyboard");
  await expect(athletePage.getByRole("heading", { name: /your library/i })).toBeVisible();
  const edit = athletePage.getByRole("link", { name: /edit profile/i });
  await edit.scrollIntoViewIfNeeded();
  await edit.click();
  await expect(athletePage.getByLabel("Full name")).toBeVisible();
  await expect(athletePage.getByRole("button", { name: /sign out other sessions/i })).toBeVisible();
});

test("[variation:profile.hub:history] profile-to-settings history restores owned groups and library content", async ({
  athletePage,
}) => {
  const profile = new ProfilePage(athletePage);
  await profile.openOwnedProfile();
  const profileUrl = athletePage.url();
  await athletePage.getByRole("link", { name: /edit profile/i }).click();
  await expect(athletePage.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage).toHaveURL(profileUrl);
  await expect(athletePage.getByRole("heading", { name: /your library/i })).toBeVisible();
  await expect(athletePage.getByRole("heading", { name: /^groups$/i })).toBeVisible();
  await athletePage.goForward();
  await expect(athletePage.getByLabel("Preferred units")).toBeVisible();
});

test("[variation:profiles.private:keyboard-cancel] keyboard follow request persists, then keyboard cancellation restores protected profile state", async ({
  athletePage,
  coachActor: _coachActor,
  request,
}) => {
  const social = await seedSocialState(request);
  try {
    await athletePage.goto(`/user/${social.coachId}`);
    await expect(athletePage.getByText("This account is private")).toBeVisible();
    await athletePage.getByRole("button", { name: "Follow" }).press("Enter");
    await athletePage.reload();
    const cancel = athletePage.getByRole("button", { name: "Cancel request" });
    await cancel.focus();
    await cancel.press("Enter");
    await expect(athletePage.getByRole("button", { name: "Follow" })).toBeVisible();
    await expect(athletePage.getByText("Area 4 private coach biography")).toHaveCount(0);
  } finally {
    await social.cleanup();
  }
});

test("[variation:profiles.private:message-history] private profile message action opens compose and back retains privacy disclosure", async ({
  athletePage,
  coachActor: _coachActor,
  request,
}) => {
  const social = await seedSocialState(request);
  try {
    await athletePage.goto(`/user/${social.coachId}`);
    await athletePage.getByRole("button", { name: "Message" }).click();
    await expect(athletePage).toHaveURL(/\/messages/);
    await expect(athletePage.getByRole("heading", { name: /messages|new message/i })).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage.getByText("This account is private")).toBeVisible();
    await expect(athletePage.getByRole("heading", { name: "Recent Activities" })).toHaveCount(0);
  } finally {
    await social.cleanup();
  }
});

test("[variation:social.graph:follower-profile] follower link opens the exact profile and browser back restores the bounded list", async ({
  athletePage,
  coachActor: _coachActor,
  request,
}) => {
  const social = await seedSocialState(request);
  try {
    const response = waitForProcedure(athletePage, "social.getFollowers");
    await athletePage.goto(`/user/${social.athleteId}/followers`);
    await expect((await response).ok()).toBeTruthy();
    await athletePage.getByRole("link", { name: "playwright_coach" }).click();
    await expect(athletePage.getByText("This account is private")).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage.getByRole("heading", { name: "1 followers" })).toBeVisible();
    await expect(athletePage.getByRole("link", { name: "Load more" })).toHaveCount(0);
  } finally {
    await social.cleanup();
  }
});

test("[variation:social.graph:narrow-retry] narrow follower refresh failure retains the card and keyboard retry clears the alert", async ({
  athletePage,
  coachActor: _coachActor,
  request,
}) => {
  const social = await seedSocialState(request);
  try {
    await athletePage.setViewportSize({ width: 390, height: 844 });
    await athletePage.goto(`/user/${social.athleteId}/followers`);
    const follower = athletePage.getByRole("link", { name: "playwright_coach" });
    await follower.scrollIntoViewIfNeeded();
    await withTrpcFailure(athletePage, "social.getFollowers", async () => {
      await athletePage.getByRole("button", { name: "Refresh followers" }).click();
      await expect(athletePage.getByRole("alert")).toContainText("Unable to load followers");
      await expect(follower).toBeVisible();
    });
    await athletePage.getByRole("button", { name: "Try again" }).press("Enter");
    await expect(athletePage.getByRole("alert")).toHaveCount(0);
    await expect(follower).toBeVisible();
  } finally {
    await social.cleanup();
  }
});
