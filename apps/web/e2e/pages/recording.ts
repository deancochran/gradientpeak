import { expect, type Page, test } from "@playwright/test";

export class RecordingPage {
  constructor(readonly page: Page) {}

  async openLauncher() {
    await this.page.goto("/record");
  }

  async openRoutePreview(routeId: string) {
    await this.page.goto(`/record/route-preview/${routeId}`);
  }

  async startFromLauncher(input: "click" | "keyboard" = "click") {
    const open = this.page.getByRole("button", { name: /^open recorder$/i });
    if (input === "keyboard") {
      await open.press("Enter");
    } else {
      await open.click();
    }
    await this.startSession(input);
  }

  async startSession(input: "click" | "keyboard" = "click") {
    const start = this.page.getByRole("button", { name: /^start$/i });
    if (input === "keyboard") await start.press("Enter");
    else await start.click();
  }

  async configureBikeTimer(input: "click" | "keyboard" = "click") {
    await test.step("Configure bike timer recording", async () => {
      await this.openLauncher();
      const bike = this.page.getByRole("button", { name: /^bike$/i });
      const configure = this.page.getByRole("button", {
        name: /^open recorder$|configure timer session/i,
      });
      if (input === "keyboard") {
        await bike.press("Enter");
        await configure.press("Enter");
      } else {
        await bike.click();
        await configure.click();
      }
      await expect(this.page).toHaveURL(/\/record\/session$/);
    });
  }

  async chooseActivityPlan(name: string, input: "click" | "keyboard" = "click") {
    await test.step(`Choose recording plan: ${name}`, async () => {
      await this.openLauncher();
      const choose = this.page.getByRole("link", { name: "Choose plan" });
      if (input === "keyboard") await choose.press("Enter");
      else await choose.click();
      await expect(
        this.page.getByRole("heading", { name: "Choose an activity plan" }),
      ).toBeVisible();
      const search = this.page.getByRole("searchbox", { name: "Search all activity plans" });
      await search.fill(name);
      if (input === "keyboard") await search.press("Enter");
      const result = this.page.getByRole("button").filter({ hasText: name }).first();
      await result.scrollIntoViewIfNeeded();
      if (input === "keyboard") await result.press("Enter");
      else await result.click();
      const usePlan = this.page.getByRole("button", { name: "Use this plan" });
      if (input === "keyboard") await usePlan.press("Enter");
      else await usePlan.click();
      const selectedPlanName = this.page
        .getByRole("link", { name: "Change plan" })
        .locator("..")
        .getByText(name, { exact: true });
      await expect(selectedPlanName).toBeVisible();
    });
  }

  async pause(input: "click" | "keyboard" = "click") {
    const button = this.page.getByRole("button", { name: /^pause$/i });
    if (input === "keyboard") await button.press("Enter");
    else await button.click();
  }

  async resume(input: "click" | "keyboard" = "click") {
    const button = this.page.getByRole("button", { name: /^resume$/i });
    if (input === "keyboard") await button.press("Enter");
    else await button.click();
  }

  async takeOver() {
    await this.page.getByRole("button", { name: /take over recording/i }).click();
  }

  async finish(input: "click" | "keyboard" = "click") {
    const finish = this.page.getByRole("button", { name: /^finish$/i });
    if (input === "keyboard") await finish.press("Enter");
    else await finish.click();
  }

  async save() {
    await this.page.getByRole("button", { name: /^save activity$/i }).click();
  }

  async discard(input: "click" | "keyboard" = "click") {
    const discard = this.page.getByRole("button", { name: /^discard$/i });
    if (input === "keyboard") await discard.press("Enter");
    else await discard.click();
  }

  async finishAndDiscard(input: "click" | "keyboard" = "click") {
    await this.finish(input);
    await expect(this.page.getByRole("heading", { name: /review recording/i })).toBeVisible();
    await this.discard(input);
    await expect(this.page.getByText(/no recording session/i)).toBeVisible();
  }
}
