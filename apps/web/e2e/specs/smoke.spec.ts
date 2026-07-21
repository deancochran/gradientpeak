import { expect, test } from "../fixtures";
import { openAppPage } from "../utils/navigation";

test("athlete can open migrated protected routes", async ({ athletePage }) => {
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();

  await openAppPage(athletePage, "/settings");
  await expect(athletePage.getByRole("heading", { name: /^settings$/i })).toBeVisible();

  await openAppPage(athletePage, "/notifications");
  await expect(athletePage.getByRole("heading", { name: /^notifications$/i })).toBeVisible();

  await openAppPage(athletePage, "/messages");
  await expect(athletePage.getByText(/select a conversation or start a new one/i)).toBeVisible();
});

test("mobile primary navigation opens, navigates, and closes", async ({ athletePage }) => {
  test.skip((athletePage.viewportSize()?.width ?? 0) >= 768, "Mobile-width browser journey");

  await expect(
    athletePage.getByRole("navigation", { name: "Primary navigation", exact: true }),
  ).toBeHidden();
  await athletePage.getByRole("button", { name: /open navigation/i }).click();

  const mobileNavigation = athletePage.getByRole("navigation", {
    name: "Mobile primary navigation",
    exact: true,
  });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: /^calendar$/i }).click();

  await expect(athletePage).toHaveURL(/\/calendar(?:\?|$)/);
  await expect(athletePage.getByRole("heading", { name: /^calendar$/i })).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
});

test("athlete can reach the migrated profile routes from the shell", async ({ athletePage }) => {
  await athletePage.getByRole("button", { name: /open user menu/i }).click();
  await athletePage.getByRole("menuitem", { name: /^profile$/i }).click();

  await expect(athletePage).toHaveURL(/\/user\/.+$/);
  await expect(athletePage.getByRole("heading", { level: 1 })).toBeVisible();

  await athletePage.getByRole("link", { name: /followers$/i }).click();
  await expect(athletePage).toHaveURL(/\/followers$/);
  await expect(athletePage.getByRole("heading", { name: /followers$/i })).toBeVisible();

  await athletePage.goBack();
  await athletePage.waitForTimeout(1_500);
  const followingLink = athletePage.getByRole("link", { name: /following$/i });
  await followingLink.focus();
  await athletePage.keyboard.press("Enter");
  await expect(athletePage).toHaveURL(/\/following$/);
  await expect(athletePage.getByRole("heading", { name: /following$/i })).toBeVisible();
});

test("legacy profile coaching route no longer renders a coaching environment", async ({
  coachPage,
}) => {
  await openAppPage(coachPage, "/coaching");

  await expect(coachPage).toHaveURL(/\/$/);
  await expect(coachPage.getByRole("heading", { name: /coaching dashboard/i })).toHaveCount(0);
});

test("organization coaching routes fail closed outside an authorized coach membership", async ({
  coachPage,
}) => {
  await openAppPage(coachPage, "/organizations/11111111-1111-4111-8111-111111111111/dashboard");

  await expect(coachPage.getByRole("heading", { name: /coaching access required/i })).toBeVisible();
  await expect(coachPage.getByRole("navigation", { name: /primary navigation/i })).toHaveCount(0);
  await expect(coachPage.getByRole("heading", { name: /coaching workspace/i })).toHaveCount(0);
});
