import { expect, test } from "../fixtures";

const requiresSeededUsers =
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
  Boolean(process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY);
const profileTest = requiresSeededUsers ? test : test.skip;

profileTest("profile hub and settings expose owned profile journeys", async ({ athletePage }) => {
  await athletePage.getByRole("button", { name: /open user menu/i }).click();
  await athletePage.getByRole("menuitem", { name: /^profile$/i }).click();

  await expect(athletePage.getByRole("heading", { name: /your library/i })).toBeVisible();
  await expect(athletePage.getByRole("heading", { name: /^groups$/i })).toBeVisible();
  await athletePage.getByRole("link", { name: /edit profile/i }).click();

  await expect(athletePage).toHaveURL(/\/settings/);
  await expect(athletePage.getByLabel("Full name")).toBeVisible();
  await expect(athletePage.getByLabel("Preferred units")).toBeVisible();
  await expect(athletePage.getByRole("group", { name: /theme preference/i })).toBeVisible();
  await expect(athletePage.getByLabel("Current password")).toBeVisible();
  await expect(athletePage.getByRole("button", { name: /sign out other sessions/i })).toBeVisible();
});

profileTest(
  "social profile launches follow and direct-message actions",
  async ({ athletePage }) => {
    await athletePage.goto("/search");
    await athletePage.getByPlaceholder(/search/i).fill("coach");
    const coachLink = athletePage.getByRole("link", { name: /coach/i }).first();
    await expect(coachLink).toBeVisible();
    await coachLink.click();

    const follow = athletePage.getByRole("button", { name: /follow|cancel request|unfollow/i });
    await expect(follow).toBeVisible();
    await expect(athletePage.getByRole("button", { name: /^message$/i })).toBeVisible();
  },
);

profileTest(
  "social graph pages provide failure-safe pagination controls",
  async ({ athletePage }) => {
    await athletePage.getByRole("button", { name: /open user menu/i }).click();
    await athletePage.getByRole("menuitem", { name: /^profile$/i }).click();
    await athletePage.getByRole("link", { name: /followers/i }).click();

    await expect(athletePage.getByRole("heading", { name: /followers/i })).toBeVisible();
    await expect(athletePage.getByRole("link", { name: /^back$/i })).toBeVisible();
  },
);
