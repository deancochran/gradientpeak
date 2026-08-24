import { expect, test } from "../fixtures/messaging";
import { MessagingPage, NotificationsPage } from "../pages";

test("[variation:messaging.conversations:keyboard-dm] keyboard recipient selection creates a DM and sends a persisted reply", async ({
  messaging,
}) => {
  const { a, b } = messaging.actors;
  const sender = new MessagingPage(a.page);
  await sender.startDirectMessage(b.username, "keyboard");
  await sender.send("Keyboard direct hello", "keyboard");
  await new MessagingPage(b.page).openInbox();
  await b.page
    .getByRole("link", { name: new RegExp(a.username, "i") })
    .first()
    .click();
  await expect(b.page.getByText("Keyboard direct hello", { exact: true })).toBeVisible();
  await b.page.reload();
  await expect(b.page.getByText("Keyboard direct hello", { exact: true })).toBeVisible();
});

test("[variation:messaging.conversations:group-history] group unread counts clear independently and browser history restores the conversation", async ({
  messaging,
}) => {
  const { a, b, c } = messaging.actors;
  const sender = new MessagingPage(a.page);
  await sender.createGroup("Variation History Group", [b.username, c.username]);
  await sender.send("History group hello");
  await new MessagingPage(b.page).openInbox();
  const group = b.page.getByRole("link", { name: /Variation History Group/i }).first();
  await expect(group.getByText("1", { exact: true })).toBeVisible();
  await group.click();
  await b.page.goto("/notifications");
  await b.page.goBack();
  await expect(b.page.getByText("History group hello", { exact: true })).toBeVisible();
  await new MessagingPage(c.page).openInbox();
  await expect(
    c.page
      .getByRole("link", { name: /Variation History Group/i })
      .first()
      .getByText("1", {
        exact: true,
      }),
  ).toBeVisible();
});

test("[variation:messaging.follow-requests:reject-reload] rejected request stays absent after notification reload", async ({
  messaging,
}) => {
  const { a } = messaging.actors;
  const notifications = new NotificationsPage(a.page);
  await messaging.seedFollowRequest("b", "a");
  await notifications.open();
  const request = notifications.requestFor(/messaging_bravo/i);
  await request.getByRole("button", { name: "Reject" }).press("Enter");
  await expect.poll(() => messaging.readFollowStatus("b", "a")).toBeNull();
  await a.page.reload();
  await expect(request.getByRole("button", { name: "Reject" })).toHaveCount(0);
});

test("[variation:messaging.follow-requests:accept-profile] accepted request persists and its actor profile remains reachable from notifications", async ({
  messaging,
}) => {
  const { a } = messaging.actors;
  const notifications = new NotificationsPage(a.page);
  await messaging.seedFollowRequest("c", "a");
  await notifications.open();
  const request = notifications.requestFor(/messaging_charlie/i);
  await request.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => messaging.readFollowStatus("c", "a")).toBe("accepted");
  await a.page.reload();
  await expect(request.getByRole("button", { name: "Accept" })).toHaveCount(0);
  const profile = a.page.getByRole("link", { name: /messaging_charlie/i }).first();
  await profile.click();
  await expect(a.page.getByRole("heading", { level: 1 })).toContainText(/Messaging Charlie/i);
});
