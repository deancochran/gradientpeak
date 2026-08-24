import { expect, test } from "../fixtures";
import { waitForProcedure } from "../lane-support/feed/discovery";

test("[variation:responsive-discovery] clears an empty profile search then opens a route result", async ({
  athletePage,
}) => {
  await athletePage.setViewportSize({ width: 390, height: 844 });
  await athletePage.goto("/search");
  await athletePage.getByRole("tab", { name: "Profiles" }).click();
  const profiles = athletePage.getByRole("textbox", { name: /search profiles/i });
  await profiles.fill("zzzz-no-responsive-profile");
  await athletePage.getByRole("button", { name: "Search", exact: true }).click();
  await expect(athletePage.getByText("No profiles match your search and filters.")).toBeVisible();
  await athletePage.getByRole("button", { name: /clear search and filters/i }).click();
  await expect(profiles).toHaveValue("");
  const response = waitForProcedure(athletePage, "routes.list");
  await athletePage.getByRole("tab", { name: "Routes" }).click();
  await expect((await response).ok()).toBeTruthy();
  const firstRoute = athletePage.getByTestId(/^discover-routes-/).first();
  await firstRoute.scrollIntoViewIfNeeded();
  await firstRoute.getByRole("link", { name: /view route/i }).click();
  await expect(athletePage.getByText("Map preview", { exact: true })).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByRole("tab", { name: "Routes" })).toHaveAttribute(
    "data-state",
    "active",
  );
});

test("[variation:notification-history] opens a message, returns, filters unread, and retains state", async ({
  messagingNotificationsPage,
}) => {
  const page = messagingNotificationsPage;
  await page.goto("/notifications?view=all");
  const notice = page.getByText("New Message", { exact: true }).locator("..");
  await notice.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("Seeded unread hello", { exact: true })).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "Unread", exact: true }).click();
  await expect(page.getByText("New Message", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/view=unread/);
  await expect(page.getByText("Coaching Invite", { exact: true })).toBeVisible();
});

test("[variation:notifications.open:keyboard-destination] keyboard opening marks only the selected message read and returns to filtered history", async ({
  messagingNotificationsPage,
}) => {
  const page = messagingNotificationsPage;
  await page.goto("/notifications?view=all");
  const message = page.getByText("New Message", { exact: true }).locator("..");
  const open = message.getByRole("button", { name: "Open", exact: true });
  await open.focus();
  await expect(open).toBeFocused();
  await open.press("Enter");
  await expect(page.getByText("Seeded unread hello", { exact: true })).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "Unread", exact: true }).press("Enter");
  await expect(page.getByText("New Message", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Coaching Invite", { exact: true })).toBeVisible();
});

test("[variation:notifications.mark-all:cancel-navigation] leaving before marking read preserves both unread notifications on return", async ({
  messagingNotificationsPage,
}) => {
  const page = messagingNotificationsPage;
  await page.goto("/notifications?view=all");
  await expect(page.getByText("You have 2 unread notifications.", { exact: true })).toBeVisible();
  await page.goto("/messages");
  await page.goBack();
  await expect(page.getByText("You have 2 unread notifications.", { exact: true })).toBeVisible();
  await expect(page.getByText("New Message", { exact: true })).toBeVisible();
  await expect(page.getByText("Coaching Invite", { exact: true })).toBeVisible();
});

test("[variation:notifications.mark-all:history] marked-read history remains available through unread and browser back navigation", async ({
  messagingNotificationsPage,
}) => {
  const page = messagingNotificationsPage;
  await page.goto("/notifications?view=all");
  await page.getByRole("button", { name: "Mark all as read" }).press("Enter");
  await expect(page.getByText("You have 0 unread notifications.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Unread", exact: true }).click();
  await expect(page.getByText("No unread notifications.", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/view=all/);
  await expect(page.getByText("New Message", { exact: true })).toBeVisible();
  await expect(page.getByText("New Follower", { exact: true })).toBeVisible();
});
