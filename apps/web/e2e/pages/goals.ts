import { expect, type Page } from "@playwright/test";

/** Goal authoring starts from the visible library action, not a deep link. */
export class GoalsPage {
  constructor(readonly page: Page) {}

  async openLibrary() {
    await this.page.goto("/goals");
    await expect(this.page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
  }

  async startCreate(date: string) {
    const libraryHeading = this.page.getByRole("heading", { name: "Goals", exact: true });
    if (!(await libraryHeading.isVisible().catch(() => false))) await this.openLibrary();
    await this.page.getByTestId("goal-create").click();
    const form = this.page.getByTestId("goal-form");
    await expect(form).toBeVisible();
    await form.getByLabel("Target date", { exact: true }).fill(date);
    await expect(form.getByLabel("Target date", { exact: true })).toHaveValue(date);
  }
}
