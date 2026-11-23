import { expect, type Page, test } from "@playwright/test";

type UploadFile = { name: string; mimeType: string; buffer: Buffer };

export class RoutesPage {
  constructor(readonly page: Page) {}

  card(name: string) {
    return this.page
      .getByTestId(/^route-card-/)
      .filter({ hasText: name })
      .first();
  }

  async openLibrary(
    input: { name?: string; ownerScope?: string; sort?: string; page?: number } = {},
  ) {
    const query = new URLSearchParams();
    if (input.name) query.set("search", input.name);
    if (input.ownerScope) query.set("ownerScope", input.ownerScope);
    if (input.sort) query.set("sort", input.sort);
    if (input.page) query.set("page", String(input.page));
    await this.page.goto(`/routes${query.size ? `?${query}` : ""}`);
    await expect(this.page.getByText("Loading routes...", { exact: true })).toHaveCount(0);
  }

  async upload(file: UploadFile, name: string, input: "click" | "keyboard" = "click") {
    return test.step(`Upload route: ${name}`, async () => {
      await this.page.goto("/routes/upload");
      await this.page.getByTestId("route-upload-file-input").setInputFiles(file);
      await this.page.getByLabel("Route name").fill(name);
      const submit = this.page.getByTestId("route-upload-submit");
      if (input === "keyboard") await submit.press("Enter");
      else await submit.click();
      await expect(this.page).toHaveURL(/\/routes\/[0-9a-f-]+\/?$/);
      const id = this.page.url().match(/\/routes\/([0-9a-f-]+)/)?.[1];
      if (!id) throw new Error("Uploaded route did not expose an id.");
      return id;
    });
  }

  async openCard(name: string) {
    await this.card(name)
      .getByTestId(/-open$/)
      .click();
  }

  async openDetail(routeId: string) {
    await this.page.goto(`/routes/${routeId}`);
  }

  async attachToEvent(eventId: string, input: "click" | "keyboard" = "click") {
    await this.page.getByLabel("Event", { exact: true }).selectOption(eventId);
    const submit = this.page.getByRole("button", { name: "Attach route" });
    if (input === "keyboard") await submit.press("Enter");
    else await submit.click();
  }

  async deleteFromDetail() {
    await this.page.getByRole("button", { name: "Delete", exact: true }).click();
    await this.page.getByRole("button", { name: "Delete route", exact: true }).click();
    await expect(this.page).toHaveURL(/\/routes(?:\?.*)?$/);
  }

  async deleteByNameIfPresent(name: string) {
    await this.openLibrary({ name, ownerScope: "own", page: 1 });
    const card = this.card(name);
    if ((await card.count()) === 0) return false;
    await this.openCard(name);
    await this.deleteFromDetail();
    return true;
  }
}
