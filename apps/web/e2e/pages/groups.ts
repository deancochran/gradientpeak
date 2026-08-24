import { expect, type Page, test } from "@playwright/test";

export class GroupsPage {
  constructor(readonly page: Page) {}

  async create(name: string, joinPolicy: "invite_only" | "open" | "request_to_join") {
    await test.step(`Create group: ${name}`, async () => {
      await this.page.goto("/groups/new");
      await this.page.getByLabel("Name").fill(name);
      await this.page
        .getByLabel("Description")
        .fill("Browser-created group for group-event parity coverage.");
      await this.page.getByLabel("Access").selectOption("public");
      await this.page
        .getByLabel("Join policy")
        .selectOption(joinPolicy === "request_to_join" ? "invite_only" : joinPolicy);
      await this.page.getByRole("button", { name: "Create group" }).click();
      await expect(this.page).toHaveURL(/\/groups\/[0-9a-f-]+$/);
      await expect(this.page.getByRole("heading", { name })).toBeVisible();
    });
  }

  async createEvent(title: string, date = "2027-06-14") {
    await test.step(`Create group event: ${title}`, async () => {
      await this.page.getByRole("button", { name: "Create event" }).click();
      await this.page.getByLabel("Title").fill(title);
      await this.page.getByRole("textbox", { name: "Starts", exact: true }).fill(`${date}T09:00`);
      await this.page.getByRole("textbox", { name: "Ends", exact: true }).fill(`${date}T10:00`);
      await this.page
        .getByRole("textbox", { name: "Location", exact: true })
        .fill("Browser clubhouse");
      await this.page.getByRole("button", { name: "Create event" }).click();
      await expect(this.page).toHaveURL(/\/groups\/events\/[0-9a-f-]+$/);
      await expect(this.page.getByRole("heading", { name: title })).toBeVisible();
    });
  }

  async join() {
    await this.page.getByRole("button", { name: "Join group" }).click();
  }

  async requestAccess() {
    await this.page.getByRole("button", { name: "Request access" }).click();
  }

  async openRequests() {
    await this.page.getByRole("button", { name: "Requests and invitations" }).click();
  }

  requestFor(username: string) {
    return this.page.getByRole("region", { name: "Join requests" }).filter({ hasText: username });
  }

  async respondToRequest(username: string, response: "Approve" | "Reject") {
    await this.requestFor(username).getByRole("button", { name: response }).click();
  }

  async setRsvp(response: "Decline" | "Restore Going", input: "click" | "keyboard" = "click") {
    const button = this.page.getByRole("button", { name: response, exact: true });
    if (input === "keyboard") await button.press("Enter");
    else await button.click();
  }
}
