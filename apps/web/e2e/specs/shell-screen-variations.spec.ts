import { expect, test } from "../fixtures";
import {
  ActivitiesPage,
  MessagingPage,
  NotificationsPage,
  ProfilePage,
  RoutesPage,
  ShellPage,
  withTrpcFailure,
} from "../pages";

test("[variation:screens.protected:feature-history] calendar, goals, and recording actions retain their own page outcomes through history", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await shell.open("/calendar?month=2026-07&date=2026-07-20&view=month");
  await expect(athletePage.getByText("July 2026")).toBeVisible();
  await shell.open("/goals");
  await expect(athletePage.getByLabel("Search goals")).toBeVisible();
  await shell.open("/record");
  await expect(athletePage.getByRole("button", { name: /^open recorder$/i })).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByLabel("Search goals")).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByText("July 2026")).toBeVisible();
});

test("[variation:screens.protected:narrow-actions] narrow routes, plans, and messages expose their real primary controls after scrolling", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  const routes = new RoutesPage(athletePage);
  await athletePage.setViewportSize({ width: 390, height: 844 });
  await routes.openLibrary();
  await expect(athletePage.getByRole("button", { name: /upload route/i })).toBeVisible();
  await shell.open("/activity-plans");
  const create = athletePage.getByRole("button", { name: /create activity plan/i });
  await create.scrollIntoViewIfNeeded();
  await expect(create).toBeVisible();
  await shell.open("/messages");
  await expect(athletePage.getByRole("link", { name: /^new message$/i })).toBeVisible();
});

test("[variation:screens.empty-actions:notification-history] unread empty state returns to all notifications and preserves the selected filter on forward", async ({
  athletePage,
}) => {
  await new NotificationsPage(athletePage).open();
  await athletePage.getByRole("link", { name: /^unread$/i }).press("Enter");
  await expect(athletePage.getByText(/no unread notifications/i)).toBeVisible();
  await athletePage.getByRole("link", { name: /^all$/i }).click();
  await expect(athletePage).toHaveURL(/view=all/);
  await athletePage.goBack();
  await expect(athletePage).toHaveURL(/view=unread/);
  await expect(athletePage.getByText(/no unread notifications/i)).toBeVisible();
  await athletePage.goForward();
  await expect(athletePage.getByRole("heading", { name: "Notifications" })).toBeVisible();
});

test("[variation:screens.empty-actions:entry-back] activity import and route upload entries each return to their owning libraries", async ({
  athletePage,
}) => {
  const activities = new ActivitiesPage(athletePage);
  const routes = new RoutesPage(athletePage);
  await activities.openLibrary();
  await athletePage.getByRole("button", { name: /import activity/i }).press("Enter");
  await expect(athletePage.getByTestId("activity-import-file-input")).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByRole("heading", { name: "Activities", exact: true })).toBeVisible();
  await routes.openLibrary();
  await athletePage.getByRole("button", { name: /upload route/i }).press("Enter");
  await expect(athletePage.getByTestId("route-upload-file-input")).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByRole("heading", { name: "Routes", exact: true })).toBeVisible();
});

test("[variation:screens.message-composer:keyboard-back] keyboard opens compose and browser back restores the empty inbox", async ({
  athletePage,
}) => {
  await new ShellPage(athletePage).open("/messages");
  const compose = athletePage.getByRole("link", { name: /^new message$/i });
  await compose.focus();
  await compose.press("Enter");
  await expect(athletePage.getByRole("heading", { name: /new message/i })).toBeVisible();
  await expect(
    athletePage.getByRole("searchbox", { name: "Search message recipients" }),
  ).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByText(/select a conversation or start a new one/i)).toBeVisible();
});

test("[variation:screens.message-composer:empty-search] recipient empty search keeps the composer open for a corrected query", async ({
  athletePage,
}) => {
  await new MessagingPage(athletePage).openComposer();
  const search = athletePage.getByRole("searchbox", { name: "Search message recipients" });
  await search.fill("zzzz-no-message-recipient");
  await athletePage.getByRole("button", { name: /^search$/i }).click();
  await expect(athletePage.getByText(/no .*recipient|no profiles found/i)).toBeVisible();
  await search.fill("playwright_coach");
  await athletePage.getByRole("button", { name: /^search$/i }).press("Enter");
  await expect(athletePage.getByRole("heading", { name: /new message/i })).toBeVisible();
});

test("[variation:screens.account-menu:keyboard-destination] keyboard account menu opens integrations and history returns focusable menu access", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  const trigger = shell.userMenuButton;
  await trigger.focus();
  await trigger.press("Enter");
  const integration = shell.accountDestination("Integrations");
  await integration.focus();
  await integration.press("Enter");
  await expect(
    athletePage.getByRole("heading", { name: "Integrations", exact: true }),
  ).toBeVisible();
  await athletePage.goBack();
  await trigger.focus();
  await expect(trigger).toBeFocused();
});

test("[variation:screens.account-menu:narrow-scroll] narrow extended menu scrolls to training preferences and opens its feature content", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await athletePage.setViewportSize({ width: 390, height: 844 });
  await shell.openAccountMenu();
  const preferences = shell.accountDestination("Training preferences");
  await preferences.scrollIntoViewIfNeeded();
  await preferences.click();
  await expect(athletePage).toHaveURL(/\/training-preferences$/);
  await expect(athletePage.getByRole("heading", { name: /training preferences/i })).toBeVisible();
});

test("[variation:smoke.protected-routes:nav-links] header notification and message links open their exact feature content", async ({
  athletePage,
}) => {
  await athletePage.getByRole("link", { name: /^notifications(?: \(|$)/i }).click();
  await expect(athletePage.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await athletePage.getByRole("link", { name: /^messages(?: \(|$)/i }).click();
  await expect(athletePage.getByText(/select a conversation or start a new one/i)).toBeVisible();
});

test("[variation:smoke.protected-routes:reload-history] settings reload and messages history retain authenticated feature content", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await shell.open("/settings");
  await athletePage.reload();
  await expect(athletePage.getByLabel("Preferred units")).toBeVisible();
  await shell.open("/messages");
  await expect(athletePage.getByRole("link", { name: /^new message$/i })).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByRole("group", { name: "Theme preference" })).toBeVisible();
  await athletePage.goForward();
  await expect(athletePage.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
});

test("[variation:dashboard.recovery:keyboard] keyboard retry replaces the dashboard alert with server content", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await shell.open("/calendar");
  await withTrpcFailure(athletePage, "home.getDashboard", async () => {
    await shell.open("/");
    await expect(athletePage.getByRole("alert")).toContainText("Dashboard unavailable");
  });
  const retry = athletePage.getByRole("button", { name: "Retry dashboard" });
  await retry.focus();
  await retry.press("Enter");
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();
});

test("[variation:dashboard.recovery:feature-history] recovered dashboard remains healthy after calendar back-forward navigation", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await shell.open("/calendar");
  await withTrpcFailure(athletePage, "home.getDashboard", async () => {
    await shell.open("/");
    await expect(athletePage.getByRole("alert")).toBeVisible();
  });
  await athletePage.getByRole("button", { name: "Retry dashboard" }).click();
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await shell.open("/calendar");
  await athletePage.goBack();
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await athletePage.goForward();
  await expect(athletePage.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
});

test("[variation:navigation.mobile:escape-focus] Escape closes the mobile sheet and restores focus before reopening", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await athletePage.setViewportSize({ width: 390, height: 844 });
  const open = shell.openMobileNavigationButton;
  await open.press("Enter");
  const mobile = shell.mobileNavigation;
  await expect(mobile).toBeVisible();
  await athletePage.keyboard.press("Escape");
  await expect(mobile).toBeHidden();
  await expect(open).toBeFocused();
  await open.press("Enter");
  await expect(mobile).toBeVisible();
});

test("[variation:navigation.mobile:scroll-record] mobile sheet scrolls to recording and closes after exact destination navigation", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await athletePage.setViewportSize({ width: 390, height: 844 });
  await shell.openMobileNavigation();
  const mobile = shell.mobileNavigation;
  const record = mobile.getByRole("link", { name: /^record$/i });
  await record.scrollIntoViewIfNeeded();
  await record.click();
  await expect.poll(() => new URL(athletePage.url()).pathname).toBe("/record");
  await expect(athletePage.getByRole("button", { name: /^open recorder$/i })).toBeVisible();
  await expect(mobile).toBeHidden();
});

test("[variation:navigation.desktop:keyboard-goals] desktop keyboard account navigation opens goals and exposes filters", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await athletePage.setViewportSize({ width: 1280, height: 900 });
  await shell.openAccountMenu("keyboard");
  const goals = shell.accountDestination("Goals");
  await goals.focus();
  await goals.press("Enter");
  await expect.poll(() => new URL(athletePage.url()).pathname).toBe("/goals");
  await expect(athletePage.getByLabel("Search goals")).toBeVisible();
});

test("[variation:navigation.desktop:history-current] desktop current destination follows calendar-to-plan back-forward history", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await athletePage.setViewportSize({ width: 1280, height: 900 });
  const nav = shell.primaryNavigation;
  await nav.getByRole("link", { name: /^calendar$/i }).click();
  await nav.getByRole("link", { name: /^plan$/i }).click();
  await expect(nav.getByRole("link", { name: /^plan$/i })).toHaveAttribute("aria-current", "page");
  await athletePage.goBack();
  await expect(nav.getByRole("link", { name: /^calendar$/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await athletePage.goForward();
  await expect(athletePage.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
});

test("[variation:profile.shell:follower-history] profile followers and following links retain exact list headings through history", async ({
  athletePage,
}) => {
  const profile = new ProfilePage(athletePage);
  await profile.openOwnedProfile();
  await profile.openFollowers();
  await expect(athletePage.getByRole("heading", { name: /followers$/i })).toBeVisible();
  await athletePage.goBack();
  await profile.openFollowing("keyboard");
  await expect(athletePage.getByRole("heading", { name: /following$/i })).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByRole("heading", { name: /your library/i })).toBeVisible();
});

test("[variation:profile.shell:narrow-settings] narrow profile opens settings and returns to the same owned library", async ({
  athletePage,
}) => {
  const profile = new ProfilePage(athletePage);
  await athletePage.setViewportSize({ width: 390, height: 844 });
  await profile.openOwnedProfile();
  const edit = athletePage.getByRole("link", { name: /edit profile/i });
  await edit.scrollIntoViewIfNeeded();
  await edit.click();
  await expect(athletePage.getByLabel("Full name")).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByRole("heading", { name: /your library/i })).toBeVisible();
});

test("[variation:coaching.denied:narrow-reload] narrow unauthorized dashboard denial remains closed after reload", async ({
  coachPage,
}) => {
  await coachPage.setViewportSize({ width: 390, height: 844 });
  await new ShellPage(coachPage).open(
    "/organizations/11111111-1111-4111-8111-111111111111/dashboard",
  );
  await expect(coachPage.getByRole("heading", { name: /coaching access required/i })).toBeVisible();
  await coachPage.reload();
  await expect(coachPage.getByRole("heading", { name: /coaching access required/i })).toBeVisible();
  await expect(coachPage.getByRole("heading", { name: /coaching workspace/i })).toHaveCount(0);
});

test("[variation:coaching.denied:history] unauthorized coaching deep link cannot expose workspace through browser history", async ({
  coachPage,
}) => {
  const shell = new ShellPage(coachPage);
  await shell.open("/organizations");
  await shell.open("/organizations/11111111-1111-4111-8111-111111111111/dashboard");
  await expect(coachPage.getByRole("heading", { name: /coaching access required/i })).toBeVisible();
  await coachPage.goBack();
  await expect(
    coachPage.getByRole("heading", { name: "Coaching organizations", exact: true }),
  ).toBeVisible();
  await coachPage.goForward();
  await expect(coachPage.getByRole("heading", { name: /coaching access required/i })).toBeVisible();
  await expect(coachPage.getByRole("navigation", { name: /primary navigation/i })).toHaveCount(0);
});
