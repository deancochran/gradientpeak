import { expect, test } from "../fixtures";
import { openAppPage } from "../utils/navigation";

async function waitForDashboardRequest(page: Parameters<typeof openAppPage>[0]) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/api/trpc/") && response.url().includes("home.getDashboard"),
  );
}

test("athlete can open migrated protected routes", async ({ athletePage }) => {
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();

  await openAppPage(athletePage, "/settings");
  await expect(athletePage.getByRole("heading", { name: /^settings$/i })).toBeVisible();

  await openAppPage(athletePage, "/notifications");
  await expect(athletePage.getByRole("heading", { name: /^notifications$/i })).toBeVisible();

  await openAppPage(athletePage, "/messages");
  await expect(athletePage.getByText(/select a conversation or start a new one/i)).toBeVisible();
});

test("dashboard presents an explicit error and recovers its server content", async ({
  athletePage,
}) => {
  await openAppPage(athletePage, "/calendar");
  await athletePage.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("home.getDashboard")) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await openAppPage(athletePage, "/");
  await expect(athletePage.getByRole("alert")).toContainText("Dashboard unavailable", {
    timeout: 15_000,
  });

  await athletePage.unroute("**/api/trpc/**");
  const recoveryResponse = waitForDashboardRequest(athletePage);
  await athletePage.getByRole("button", { name: "Retry dashboard" }).click();
  await expect((await recoveryResponse).ok()).toBeTruthy();
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();
});

test("mobile primary navigation opens, navigates, and closes", async ({ athletePage }) => {
  await athletePage.setViewportSize({ width: 390, height: 844 });

  await expect(
    athletePage.getByRole("navigation", { name: "Primary navigation", exact: true }),
  ).toBeHidden();
  const openNavigation = athletePage.getByRole("button", { name: /open navigation/i });
  await openNavigation.focus();
  await athletePage.keyboard.press("Enter");

  const mobileNavigation = athletePage.getByRole("navigation", {
    name: "Mobile primary navigation",
    exact: true,
  });
  await expect(mobileNavigation).toBeVisible();
  const calendarLink = mobileNavigation.getByRole("link", { name: /^calendar$/i });
  await calendarLink.focus();
  await athletePage.keyboard.press("Enter");

  await expect(athletePage).toHaveURL(/\/calendar(?:\?|$)/);
  await expect(athletePage.getByRole("heading", { name: /^calendar$/i })).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
  await expect(openNavigation).toBeFocused();
  const overflow = await athletePage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("desktop primary navigation exposes named destinations", async ({ athletePage }) => {
  await athletePage.setViewportSize({ width: 1280, height: 900 });

  const primaryNavigation = athletePage.getByRole("navigation", {
    name: "Primary navigation",
    exact: true,
  });
  await expect(primaryNavigation).toBeVisible();
  const calendarLink = primaryNavigation.getByRole("link", { name: /^calendar$/i });
  await calendarLink.focus();
  await athletePage.keyboard.press("Enter");

  await expect(athletePage).toHaveURL(/\/calendar(?:\?|$)/);
  await expect(calendarLink).toHaveAttribute("aria-current", "page");
});

test("athlete can reach the migrated profile routes from the shell", async ({ athletePage }) => {
  const userMenu = athletePage.getByRole("button", { name: /open user menu/i });
  await userMenu.focus();
  await athletePage.keyboard.press("Enter");
  const profileMenuItem = athletePage.getByRole("menuitem", { name: /^profile$/i });
  await profileMenuItem.focus();
  await athletePage.keyboard.press("Enter");

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

test("organization coaching routes fail closed outside an authorized coach membership", async ({
  coachPage,
}) => {
  await openAppPage(coachPage, "/organizations/11111111-1111-4111-8111-111111111111/dashboard");

  await expect(coachPage.getByRole("heading", { name: /coaching access required/i })).toBeVisible();
  await expect(coachPage.getByRole("navigation", { name: /primary navigation/i })).toHaveCount(0);
  await expect(coachPage.getByRole("heading", { name: /coaching workspace/i })).toHaveCount(0);
});
