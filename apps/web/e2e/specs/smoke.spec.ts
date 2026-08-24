import { expect, test } from "../fixtures";
import {
  expectAuthenticatedShell,
  expectNoHorizontalOverflow,
  isTrpcProcedure,
  ProfilePage,
  ShellPage,
  withTrpcFailure,
} from "../pages";

async function waitForDashboardRequest(page: import("@playwright/test").Page) {
  return page.waitForResponse((response) =>
    isTrpcProcedure(new URL(response.url()), "home.getDashboard"),
  );
}

test("athlete can open migrated protected routes", async ({ athletePage }) => {
  const shell = new ShellPage(athletePage);
  await expectAuthenticatedShell(athletePage);
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();

  await shell.open("/settings");
  await expect(athletePage.getByRole("heading", { name: /^settings$/i })).toBeVisible();

  await shell.open("/notifications");
  await expect(athletePage.getByRole("heading", { name: /^notifications$/i })).toBeVisible();

  await shell.open("/messages");
  await expect(athletePage.getByText(/select a conversation or start a new one/i)).toBeVisible();
});

test("dashboard presents an explicit error and recovers its server content", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await shell.open("/calendar");
  await withTrpcFailure(athletePage, "home.getDashboard", async () => {
    await shell.open("/");
    await expect(athletePage.getByRole("alert")).toContainText("Dashboard unavailable", {
      timeout: 15_000,
    });
  });
  const recoveryResponse = waitForDashboardRequest(athletePage);
  await athletePage.getByRole("button", { name: "Retry dashboard" }).click();
  await expect((await recoveryResponse).ok()).toBeTruthy();
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();
});

test("mobile primary navigation opens, navigates, and closes", async ({ athletePage }) => {
  const shell = new ShellPage(athletePage);
  await athletePage.setViewportSize({ width: 390, height: 844 });

  await expect(
    athletePage.getByRole("navigation", { name: "Primary navigation", exact: true }),
  ).toBeHidden();
  const openNavigation = shell.openMobileNavigationButton;
  await openNavigation.click();

  const mobileNavigation = shell.mobileNavigation;
  await expect(mobileNavigation).toBeVisible();
  const calendarLink = mobileNavigation.getByRole("link", { name: /^calendar$/i });
  await calendarLink.click();

  await expect(athletePage).toHaveURL(/\/calendar(?:\?|$)/);
  await expect(athletePage.getByRole("heading", { name: /^calendar$/i })).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
  await expect(openNavigation).toBeFocused();
  await expectNoHorizontalOverflow(athletePage);
});

test("desktop primary navigation exposes named destinations", async ({ athletePage }) => {
  const shell = new ShellPage(athletePage);
  await athletePage.setViewportSize({ width: 1280, height: 900 });

  const primaryNavigation = shell.primaryNavigation;
  await expect(primaryNavigation).toBeVisible();
  const calendarLink = primaryNavigation.getByRole("link", { name: /^calendar$/i });
  await calendarLink.focus();
  await athletePage.keyboard.press("Enter");

  await expect(athletePage).toHaveURL(/\/calendar(?:\?|$)/);
  await expect(calendarLink).toHaveAttribute("aria-current", "page");
});

test("athlete can reach the migrated profile routes from the shell", async ({ athletePage }) => {
  const profile = new ProfilePage(athletePage);
  await athletePage.getByRole("link", { name: /^profile$/i }).click();

  await expect(athletePage).toHaveURL(/\/user\/.+$/);
  await expect(athletePage.getByRole("heading", { level: 1 })).toBeVisible();

  await profile.openFollowers();
  await expect(athletePage).toHaveURL(/\/followers$/);
  await expect(athletePage.getByRole("heading", { name: /followers$/i })).toBeVisible();

  await athletePage.goBack();
  const followingLink = athletePage.getByRole("link", { name: /following$/i });
  await followingLink.click();
  await expect(athletePage).toHaveURL(/\/following$/);
  await expect(athletePage.getByRole("heading", { name: /following$/i })).toBeVisible();
});

test("organization coaching routes fail closed outside an authorized coach membership", async ({
  coachPage,
}) => {
  await new ShellPage(coachPage).open(
    "/organizations/11111111-1111-4111-8111-111111111111/dashboard",
  );

  await expect(coachPage.getByRole("heading", { name: /coaching access required/i })).toBeVisible();
  await expect(coachPage.getByRole("navigation", { name: /primary navigation/i })).toHaveCount(0);
  await expect(coachPage.getByRole("heading", { name: /coaching workspace/i })).toHaveCount(0);
});
