import { expect, test } from "../fixtures/messaging";
import { MessagingPage, NotificationsPage } from "../pages";

test("creates a DM and a three-actor group with independent unread state", async ({
  messaging,
}) => {
  const { a, b, c } = messaging.actors;
  const sender = new MessagingPage(a.page);
  await sender.startDirectMessage(b.username);
  await expect(a.page).toHaveURL(/conversationId=/);

  await sender.createGroup("Three Actor Persisted Group", [b.username, c.username]);
  await sender.send("Three actor persisted hello");

  await new MessagingPage(b.page).openInbox();
  const bGroup = b.page.getByRole("link", { name: /Three Actor Persisted Group/i }).first();
  await expect(bGroup.getByText("1", { exact: true })).toBeVisible();
  await bGroup.click();
  await expect(b.page.getByText("Three actor persisted hello").last()).toBeVisible();

  await new MessagingPage(c.page).openInbox();
  const cGroup = c.page.getByRole("link", { name: /Three Actor Persisted Group/i }).first();
  await expect(cGroup.getByText("1", { exact: true })).toBeVisible();
  await cGroup.click();
  await expect(c.page.getByText("Three actor persisted hello").last()).toBeVisible();
});

test("rejects and accepts follow requests from notifications", async ({ messaging }) => {
  const { a } = messaging.actors;
  const notifications = new NotificationsPage(a.page);
  await messaging.seedFollowRequest("b", "a");
  await notifications.open();
  await notifications.respondToFollowRequest("Reject");
  await expect.poll(() => messaging.readFollowStatus("b", "a")).toBeNull();

  await messaging.seedFollowRequest("c", "a");
  await notifications.open();
  await notifications.respondToFollowRequest("Accept");
  await expect.poll(() => messaging.readFollowStatus("c", "a")).toBe("accepted");
});
