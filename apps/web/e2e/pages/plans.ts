import { expect, type Page, test } from "@playwright/test";

export class TrainingPlansPage {
  constructor(readonly page: Page) {}

  searchInput() {
    return this.page.getByLabel("Search plans");
  }

  card(name: string) {
    return this.page.getByTestId(/^training-plan-card-/).filter({ hasText: name });
  }

  async openLibrary() {
    await this.page.goto("/training-plans");
    await expect(this.page.getByRole("heading", { name: "Training plans" })).toBeVisible();
  }

  async startCreate() {
    await this.page.getByTestId("training-plan-create").click();
    await expect(this.page.getByRole("heading", { name: "Create training plan" })).toBeVisible();
  }

  async search(name: string) {
    await this.searchInput().fill(name);
    const card = this.card(name);
    await expect(card).toBeVisible();
    return card;
  }

  async openPlan(name: string, input: "click" | "keyboard" = "click") {
    await test.step(`Open training plan: ${name}`, async () => {
      const card = await this.search(name);
      const button = card.getByRole("button", { name: "View plan" });
      if (input === "keyboard") await button.press("Enter");
      else await button.click();
      await expect(this.page.getByRole("heading", { name })).toBeVisible();
    });
  }

  async openTemplates() {
    await this.page.getByRole("tab", { name: "Templates" }).click();
  }

  async reviewSchedule(startDate: string) {
    await this.page.getByLabel("Start date").fill(startDate);
    await this.page.getByRole("button", { name: "Review schedule" }).click();
    await expect(this.page.getByRole("button", { name: "Confirm schedule" })).toBeVisible();
  }

  async confirmSchedule() {
    await this.page.getByRole("button", { name: "Confirm schedule" }).click();
  }

  async selectScheduleApplication(applicationId: string) {
    await this.page.getByLabel("Scheduled application").selectOption(applicationId);
  }

  async reviewScheduleRemoval() {
    await this.page.getByRole("button", { name: "Review schedule removal" }).click();
    await expect(this.page.getByRole("button", { name: "Confirm remove schedule" })).toBeVisible();
  }

  async confirmScheduleRemoval() {
    await this.page.getByRole("button", { name: "Confirm remove schedule" }).click();
  }
}

export class ActivityPlansPage {
  constructor(readonly page: Page) {}

  step(interval = 1, step = 1) {
    return this.page.getByRole("group", {
      name: `Interval ${interval}, step ${step}`,
      exact: true,
    });
  }

  async openDuration(interval = 1, step = 1) {
    const row = this.step(interval, step);
    await row.getByRole("button", { name: /, duration:/ }).click();
    return row;
  }

  async openTarget(target = 1, interval = 1, step = 1) {
    const row = this.step(interval, step);
    await row.getByRole("button", { name: new RegExp(`, target ${target} value:`) }).click();
    return row;
  }

  async openTargetType(target = 1, interval = 1, step = 1) {
    const row = this.step(interval, step);
    await row.getByRole("button", { name: new RegExp(`, target ${target} type:`) }).click();
    return row;
  }

  async openTargetUnit(target = 1, interval = 1, step = 1) {
    const row = this.step(interval, step);
    await row.getByRole("button", { name: new RegExp(`, target ${target} unit:`) }).click();
    return row;
  }

  searchInput() {
    return this.page.getByRole("searchbox", { name: /search activity plans/i });
  }

  card(name: string | RegExp) {
    return this.page.getByRole("button", { name });
  }

  async openLibrary() {
    await this.page.goto("/activity-plans");
    await expect(this.page.getByRole("heading", { name: /^activity plans$/i })).toBeVisible();
  }

  async search(name: string) {
    await this.searchInput().fill(name);
  }

  async openPlan(name: string | RegExp, input: "click" | "keyboard" = "click") {
    const card = this.card(name);
    if (input === "keyboard") await card.press("Enter");
    else await card.click();
  }

  async startCreate(input: "click" | "keyboard" = "click") {
    const button = this.page.getByRole("button", { name: /create activity plan/i });
    if (input === "keyboard") await button.press("Enter");
    else await button.click();
  }

  async create(input: {
    name: string;
    category?: string;
    description?: string;
    firstStep?: string;
    submit?: "click" | "keyboard";
  }) {
    await test.step(`Create activity plan: ${input.name}`, async () => {
      await this.openLibrary();
      await this.startCreate(input.submit);
      await this.page.getByLabel("Plan name").fill(input.name);
      if (input.description) {
        await this.page
          .getByRole("button", { name: "Add description", exact: true })
          .first()
          .click();
        await this.page.locator("#activity-plan-description").fill(input.description);
      }
      if (input.category)
        await this.page
          .getByLabel("Activity category", { exact: true })
          .selectOption(input.category);
      if (input.firstStep) {
        await this.page.getByRole("button", { name: "Add step", exact: true }).click();
        await this.page.getByRole("button", { name: "Add name", exact: true }).click();
        await this.page.getByLabel("Name (optional)").fill(input.firstStep);
        await this.page.getByLabel("Completion").selectOption("time");
        await this.page.getByLabel("Quantity").fill("600");
      }
      const submit = this.page.getByRole("button", { name: /create plan/i });
      if (input.submit === "keyboard") await submit.press("Enter");
      else await submit.click();
      await expect(this.page.getByRole("heading", { name: input.name })).toBeVisible();
    });
  }

  async duplicate() {
    await this.page.getByRole("button", { name: /^duplicate$/i }).click();
  }

  async schedule(date: string) {
    await this.page.getByLabel("Schedule date").fill(date);
    await this.page.getByRole("button", { name: /^schedule$/i }).click();
  }
}
