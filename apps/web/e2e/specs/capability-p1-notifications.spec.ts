import { expect, test } from "../fixtures";

test("[P1] opening a notification reaches its destination and persists read state", async ({
  messagingNotificationsPage,
}) => {
  const page = messagingNotificationsPage;
  await page.goto("/notifications?view=all");
  await expect(page.getByText("You have 2 unread notifications.", { exact: true })).toBeVisible();

  const messageNotification = page.getByText("New Message", { exact: true }).locator("..");
  await messageNotification.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(
    /\/messages\?conversationId=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}/,
  );
  const seededMessage = page.getByText("Seeded unread hello", { exact: true });
  await expect(seededMessage).toHaveCount(2);
  await expect(seededMessage.last()).toBeVisible();

  await page.goto("/notifications?view=unread");
  await expect(page.getByText("You have 1 unread notification.", { exact: true })).toBeVisible();
  await expect(page.getByText("New Message", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Coaching Invite", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("You have 1 unread notification.", { exact: true })).toBeVisible();
  await expect(page.getByText("New Message", { exact: true })).toHaveCount(0);
});

test("[P2] mark-all-read persists while previously read notifications remain available", async ({
  messagingNotificationsPage,
}) => {
  const page = messagingNotificationsPage;
  await page.goto("/notifications?view=all");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("You have 0 unread notifications.", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("You have 0 unread notifications.", { exact: true })).toBeVisible();
  await expect(page.getByText("New Message", { exact: true })).toBeVisible();
  await expect(page.getByText("Coaching Invite", { exact: true })).toBeVisible();
  await expect(page.getByText("New Follower", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Unread", exact: true }).click();
  await expect(page.getByText("No unread notifications.", { exact: true })).toBeVisible();
});
