import { expect, type Page, test } from "@playwright/test";

type UploadFile = { name: string; mimeType: string; buffer: Buffer };

export class ActivitiesPage {
  constructor(readonly page: Page) {}

  activityCard(activityId: string) {
    return this.page.getByTestId(`activity-card-${activityId}`);
  }

  async openLibrary() {
    await this.page.goto("/activities");
    await expect(this.page.getByRole("heading", { name: "Activities", exact: true })).toBeVisible();
    await this.page.waitForLoadState("networkidle");
  }

  async openDetail(activityId: string) {
    await this.page.goto(`/activities/${activityId}`);
  }

  async openPublicShare(activityId: string) {
    await this.page.goto(`/share/activities/${activityId}`);
  }

  async openImporter() {
    await this.page.goto("/activities/import");
    await expect(this.page.getByTestId("activity-import-file-input")).toBeVisible();
    await this.page.waitForLoadState("networkidle");
  }

  async selectImportFile(file: UploadFile) {
    const input = this.page.getByTestId("activity-import-file-input");
    await input.setInputFiles(file);
    const selectedCount = await input.evaluate(
      (element) => (element as HTMLInputElement).files?.length ?? 0,
    );
    if (selectedCount !== 1) {
      throw new Error(`Expected one selected activity file, received ${selectedCount}.`);
    }
  }

  async submitImport(input: "click" | "keyboard" = "click") {
    const submit = this.page.getByRole("button", { name: "Import activity" });
    if (input === "keyboard") await submit.press("Enter");
    else await submit.click();
  }

  async importFile(file: UploadFile) {
    return test.step("Import activity file", async () => {
      await this.openImporter();
      await this.selectImportFile(file);
      await expect(this.page.getByRole("button", { name: "Import activity" })).toBeEnabled();
      await this.submitImport();
      await this.page.waitForURL(/\/activities\/[0-9a-f-]+\/?$/);
      return this.page.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
    });
  }

  async setVisibility(
    visibility: "Followers" | "Private" | "Public",
    input: "click" | "keyboard" = "click",
  ) {
    const trigger = this.page.getByRole("button", { name: "Change visibility" });
    const choice = this.page.getByRole("button", { name: new RegExp(`^${visibility}`) });
    if (input === "keyboard") {
      await trigger.press("Enter");
      await choice.press("Enter");
    } else {
      await trigger.click();
      await choice.click();
    }
    await expect(this.page.getByText("Visibility updated")).toBeVisible();
  }

  async filter(input: { category?: string; sort?: string; order?: string }) {
    if (input.category) {
      await this.page.getByLabel("Activity category").selectOption(input.category);
      await this.page.waitForURL((url) => url.searchParams.get("category") === input.category);
    }
    if (input.sort) {
      await this.page.getByLabel("Sort by").selectOption(input.sort);
      await this.page.waitForURL((url) => url.searchParams.get("sort") === input.sort);
    }
    if (input.order) {
      await this.page.getByRole("combobox", { name: /^Order/ }).selectOption(input.order);
      await this.page.waitForURL((url) => url.searchParams.get("order") === input.order);
    }
  }

  async openCard(activityId: string) {
    await this.page.getByTestId(`activity-card-${activityId}-open`).click();
  }

  async deleteFromDetail() {
    await this.page.getByRole("button", { name: "Delete", exact: true }).click();
    await this.page.getByRole("button", { name: "Delete activity", exact: true }).click();
  }
}
