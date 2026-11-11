import { type Page, test } from "@playwright/test";

export class MessagingPage {
  constructor(readonly page: Page) {}

  async openComposer() {
    await this.page.goto("/messages?compose=true");
  }

  async openInbox() {
    await this.page.goto("/messages");
  }

  async selectRecipient(username: string, input: "click" | "keyboard" = "click") {
    await this.page.getByRole("searchbox", { name: "Search message recipients" }).fill(username);
    const search = this.page.getByRole("button", { name: /^search$/i });
    const recipient = this.page.getByRole("button", { name: new RegExp(`@${username}`, "i") });
    if (input === "keyboard") {
      await search.press("Enter");
      await recipient.press("Enter");
    } else {
      await search.click();
      await recipient.click();
    }
  }

  async startDirectMessage(username: string, input: "click" | "keyboard" = "click") {
    await test.step(`Start direct message with @${username}`, async () => {
      await this.openComposer();
      await this.selectRecipient(username, input);
      const start = this.page.getByRole("button", { name: "Start conversation" });
      if (input === "keyboard") await start.press("Enter");
      else await start.click();
    });
  }

  async createGroup(name: string, usernames: string[]) {
    await test.step(`Create message group: ${name}`, async () => {
      await this.openComposer();
      for (const username of usernames) await this.selectRecipient(username);
      await this.page.getByLabel("Group name").fill(name);
      await this.page.getByRole("button", { name: "Create conversation" }).click();
    });
  }

  async send(message: string, input: "click" | "keyboard" = "click") {
    await this.page.getByPlaceholder("Type a message...").fill(message);
    const send = this.page.getByRole("button", { name: /^send message$/i });
    if (input === "keyboard") await send.press("Enter");
    else await send.click();
  }

  conversation(name: string | RegExp) {
    return this.page.getByRole("link", { name }).first();
  }
}

export class NotificationsPage {
  constructor(readonly page: Page) {}

  async open(view?: "all" | "unread") {
    await this.page.goto(`/notifications${view ? `?view=${view}` : ""}`);
  }

  followRequest() {
    return this.page.getByText("Follow Request", { exact: true }).locator("..");
  }

  async respondToFollowRequest(response: "Accept" | "Reject") {
    await this.followRequest().getByRole("button", { name: response }).click();
  }
}
