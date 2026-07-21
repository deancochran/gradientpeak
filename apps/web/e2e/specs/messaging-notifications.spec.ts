import { expect, openAppPage, test } from "../fixtures/messaging";

test("creates a DM and a three-actor group with independent unread state", async ({
  messaging,
}) => {
  const { a, b, c } = messaging.actors;
  await openAppPage(a.page, "/messages?compose=true");
  await a.page.getByRole("searchbox", { name: "Search message recipients" }).fill(b.username);
  await a.page.getByRole("button", { name: /^search$/i }).click();
  await a.page.getByRole("button", { name: new RegExp(`@${b.username}`, "i") }).click();
  await a.page.getByRole("button", { name: "Start conversation" }).click();
  await expect(a.page).toHaveURL(/conversationId=/);

  await openAppPage(a.page, "/messages?compose=true");
  for (const actor of [b, c]) {
    const search = a.page.getByRole("searchbox", { name: "Search message recipients" });
    await search.fill(actor.username);
    await a.page.getByRole("button", { name: /^search$/i }).click();
    await a.page.getByRole("button", { name: new RegExp(`@${actor.username}`, "i") }).click();
  }
  await a.page.getByLabel("Group name").fill("Three Actor Persisted Group");
  await a.page.getByRole("button", { name: "Create conversation" }).click();
  await a.page.getByPlaceholder("Type a message...").fill("Three actor persisted hello");
  await a.page.getByRole("button", { name: /^send message$/i }).click();

  await openAppPage(b.page, "/messages");
  const bGroup = b.page.getByRole("link", { name: /Three Actor Persisted Group/i }).first();
  await expect(bGroup.getByText("1", { exact: true })).toBeVisible();
  await bGroup.click();
  await expect(b.page.getByText("Three actor persisted hello").last()).toBeVisible();

  await openAppPage(c.page, "/messages");
  const cGroup = c.page.getByRole("link", { name: /Three Actor Persisted Group/i }).first();
  await expect(cGroup.getByText("1", { exact: true })).toBeVisible();
  await cGroup.click();
  await expect(c.page.getByText("Three actor persisted hello").last()).toBeVisible();
});

test("rejects and accepts follow requests from notifications", async ({ messaging }) => {
  const { a } = messaging.actors;
  await messaging.seedFollowRequest("b", "a");
  await openAppPage(a.page, "/notifications");
  await a.page.getByRole("button", { name: "Reject" }).click();
  await expect.poll(() => messaging.readFollowStatus("b", "a")).toBeNull();

  await messaging.seedFollowRequest("c", "a");
  await openAppPage(a.page, "/notifications");
  await a.page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => messaging.readFollowStatus("c", "a")).toBe("accepted");
});
