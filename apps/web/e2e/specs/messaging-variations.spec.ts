import type { Page, Route } from "@playwright/test";
import { expect, test } from "../fixtures/messaging";
import { MessagingPage, NotificationsPage } from "../pages";
import { isTrpcProcedure, withTrpcFailure } from "../pages/network";

function waitForSearchResponse(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && isTrpcProcedure(url, "social.searchUsers");
  });
}

test("[variation:messaging.composer:input-enter-search] Enter in the recipient search stays on Messages and loads matching results", async ({
  messaging,
}) => {
  const { a, b } = messaging.actors;
  const composer = new MessagingPage(a.page);
  await composer.openComposer();
  const searchbox = a.page.getByRole("searchbox", { name: "Search message recipients" });
  const searchResponse = waitForSearchResponse(a.page);
  await searchbox.fill(b.username);
  await searchbox.press("Enter");
  await expect.poll(() => new URL(a.page.url()).pathname).toBe("/messages");
  await expect.poll(() => new URL(a.page.url()).searchParams.get("composeQuery")).toBe(b.username);
  await expect((await searchResponse).ok()).toBeTruthy();
  await expect(a.page.getByRole("button", { name: `@${b.username}` })).toBeVisible();
});

test("[variation:messaging.composer:delayed-empty-search] a delayed empty recipient search announces loading before the explicit empty state", async ({
  messaging,
}) => {
  const { a, b } = messaging.actors;
  const composer = new MessagingPage(a.page);
  await composer.openComposer();
  let releaseSearch: (() => void) | undefined;
  const searchReleased = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });
  const matcher = (url: URL) => isTrpcProcedure(url, "social.searchUsers");
  const delaySearch = async (route: Route) => {
    await searchReleased;
    await route.continue();
  };
  await a.page.route(matcher, delaySearch, { times: 1 });
  try {
    const query = `${b.username}-no-recipient`;
    const searchbox = a.page.getByRole("searchbox", { name: "Search message recipients" });
    const searchResponse = waitForSearchResponse(a.page);
    await searchbox.fill(query);
    await searchbox.press("Enter");
    await expect(a.page.getByRole("status", { name: "Searching profiles" })).toBeVisible();
    releaseSearch?.();
    await expect((await searchResponse).ok()).toBeTruthy();
    await expect(a.page.getByRole("status")).toContainText("No profiles found");
    await expect(a.page.getByText("No users match that search yet.")).toBeVisible();
  } finally {
    releaseSearch?.();
    await a.page.unroute(matcher, delaySearch);
  }
});

test("[variation:messaging.conversations:keyboard-dm] keyboard recipient selection creates a DM and sends a persisted reply", async ({
  messaging,
}) => {
  const { a, b } = messaging.actors;
  const sender = new MessagingPage(a.page);
  await sender.startDirectMessage(b.username, "keyboard");
  await sender.send("Keyboard direct hello", "keyboard");
  await new MessagingPage(b.page).openInbox();
  await b.page
    .getByRole("link", { name: /Messaging Alpha/i })
    .first()
    .click();
  await expect(b.page.getByText("Keyboard direct hello", { exact: true }).last()).toBeVisible();
  await b.page.reload();
  await expect(b.page.getByText("Keyboard direct hello", { exact: true }).last()).toBeVisible();
});

test("[variation:messaging.conversations:group-history] group unread counts clear independently and browser history restores the conversation", async ({
  messaging,
}) => {
  const { a, b, c } = messaging.actors;
  const sender = new MessagingPage(a.page);
  await sender.createGroup("Variation History Group", [b.username, c.username]);
  await sender.send("History group hello");
  await expect(a.page.getByText("History group hello", { exact: true }).last()).toBeVisible();
  await new MessagingPage(b.page).openInbox();
  const group = b.page.getByRole("link", { name: /Variation History Group/i }).first();
  await expect(group.getByText("1", { exact: true })).toBeVisible();
  await group.click();
  await b.page.goto("/notifications");
  await b.page.goBack();
  await expect(b.page.getByText("History group hello", { exact: true }).last()).toBeVisible();
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

test("[variation:messaging.composer:recipients-group-reload] selected recipients announce, can be removed, and create an optional named group that persists", async ({
  messaging,
}, testInfo) => {
  const { a, b, c } = messaging.actors;
  const composer = new MessagingPage(a.page);
  await composer.openComposer();
  await composer.selectRecipient(b.username, "keyboard");
  await expect(a.page.getByRole("status")).toContainText(`Added @${b.username} to recipients`);
  await composer.removeRecipient(b.username);
  await expect(a.page.getByRole("status")).toContainText(`Removed @${b.username} from recipients`);
  await composer.selectRecipient(b.username);
  await composer.selectRecipient(c.username);
  await a.page.getByLabel("Group name").fill("Recipient reload group");
  await a.page.getByRole("button", { name: "Create conversation" }).click();
  await expect(a.page.getByText("Recipient reload group", { exact: true }).last()).toBeVisible();
  await a.page.screenshot({
    path: testInfo.outputPath("recipient-group-created.png"),
    fullPage: true,
  });
  await a.page.reload();
  await expect(a.page.getByText("Recipient reload group", { exact: true }).last()).toBeVisible();
});

test("[variation:messaging.composer:search-failure] a failed profile search preserves the composition draft and offers retry", async ({
  messaging,
}) => {
  const { a, b, c } = messaging.actors;
  const recipients = [b, c].map((recipient) => ({
    avatar_url: null,
    id: recipient.profileId,
    is_public: null,
    username: recipient.username,
  }));
  const initialSearchResponse = waitForSearchResponse(a.page);
  await a.page.goto(
    `/messages?compose=true&composeGroup=${encodeURIComponent("Retained after search failure")}&composeRecipients=${encodeURIComponent(JSON.stringify(recipients))}`,
  );
  await expect((await initialSearchResponse).ok()).toBeTruthy();

  await withTrpcFailure(
    a.page,
    "social.searchUsers",
    async () => {
      await a.page
        .getByRole("searchbox", { name: "Search message recipients" })
        .fill("unavailable");
      await a.page.getByRole("button", { name: /^search$/i }).click();
      await expect(a.page.getByRole("alert")).toContainText("Profiles could not be loaded");
      await expect(a.page.getByLabel("Group name")).toHaveValue("Retained after search failure");
      await expect(
        a.page.getByRole("button", { name: `Remove @${b.username} from recipients` }),
      ).toBeVisible();
    },
    { times: 1 },
  );

  const recoveryResponse = waitForSearchResponse(a.page);
  await a.page.getByRole("button", { name: "Retry search" }).click();
  await expect((await recoveryResponse).ok()).toBeTruthy();
  await expect(a.page.getByRole("alert")).toHaveCount(0);
  await expect(a.page.getByRole("button", { name: `@${b.username}` })).toBeVisible();
  await expect(a.page.getByLabel("Group name")).toHaveValue("Retained after search failure");
  await expect(
    a.page.getByRole("button", { name: `Remove @${c.username} from recipients` }),
  ).toBeVisible();
});

test("[variation:messaging.follow-requests:reject-reload] rejected request stays absent after notification reload", async ({
  messaging,
}) => {
  const { a } = messaging.actors;
  const notifications = new NotificationsPage(a.page);
  await messaging.seedFollowRequest("b", "a");
  await notifications.open();
  const request = notifications.followRequest();
  await request.getByRole("button", { name: "Reject" }).press("Enter");
  await expect.poll(() => messaging.readFollowStatus("b", "a")).toBeNull();
  await a.page.reload();
  await expect(request.getByRole("button", { name: "Reject" })).toHaveCount(0);
});

test("[variation:messaging.follow-requests:accept-profile] accepted request persists and its actor profile remains reachable from notifications", async ({
  messaging,
}) => {
  const { a, c } = messaging.actors;
  const notifications = new NotificationsPage(a.page);
  await messaging.seedFollowRequest("c", "a");
  await notifications.open();
  const request = notifications.followRequest();
  await request.getByRole("button", { name: "Open" }).click();
  await expect(a.page.getByRole("heading", { level: 1 })).toHaveText(c.username);
  await a.page.goBack();
  await request.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => messaging.readFollowStatus("c", "a")).toBe("accepted");
  await a.page.reload();
  await expect(request.getByRole("button", { name: "Accept" })).toHaveCount(0);
});
