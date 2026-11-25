import { expect, type Page, test } from "@playwright/test";

export class RecordingPage {
  constructor(readonly page: Page) {}

  async openLauncher() {
    // biome-ignore lint/security/noSecrets: Local route search parameters, not a credential.
    await this.page.goto("/record/session?activity_category=run&gps=off");
  }

  async openRoutePreview(routeId: string) {
    await this.page.goto(`/record/route-preview/${routeId}`);
  }

  async startFromLauncher(input: "click" | "keyboard" = "click") {
    if (new URL(this.page.url()).pathname !== "/record/session") await this.openLauncher();
    await this.startSession(input);
  }

  async startSession(input: "click" | "keyboard" = "click") {
    const start = this.page.getByRole("button", { name: /^start$/i });
    await expect(start).toBeEnabled();
    if (input === "keyboard") await start.press("Enter");
    else await start.click();
    await expect(this.page.getByRole("button", { name: /^pause$/i })).toBeEnabled();
  }

  async configureBikeTimer(input: "click" | "keyboard" = "click") {
    await test.step("Configure bike timer recording", async () => {
      await this.openLauncher();
      await this.openGuidance();
      const bike = this.page.getByRole("button", { name: /^bike$/i });
      if (input === "keyboard") await bike.press("Enter");
      else await bike.click();
      await expect(this.page.getByRole("heading", { name: /bike session/i })).toBeVisible();
    });
  }

  async chooseActivityPlan(name: string, input: "click" | "keyboard" = "click") {
    await test.step(`Choose recording plan: ${name}`, async () => {
      await this.openLauncher();
      await this.openGuidance();
      await this.page.getByRole("searchbox", { name: "Search activity plans" }).fill(name);
      const result = this.page.getByRole("button", { name, exact: true });
      await result.scrollIntoViewIfNeeded();
      if (input === "keyboard") await result.press("Enter");
      else await result.click();
      const usePlan = this.page.getByRole("button", { name: "Attach / replace" });
      await expect(usePlan).toBeEnabled();
      if (input === "keyboard") await usePlan.press("Enter");
      else await usePlan.click();
      const selectedPlanName = this.page.getByText(`Current plan: ${name}`, { exact: true });
      await expect(selectedPlanName).toBeVisible();
    });
  }

  async openGuidance() {
    const setup = this.page.getByRole("navigation", { name: "Recording setup" });
    await setup.getByRole("button", { name: "Plan", exact: true }).click();
    await expect(
      this.page.locator("details").filter({ hasText: "Plan & route setup" }),
    ).toHaveAttribute("open", "");
  }

  async openDevices() {
    const setup = this.page.getByRole("navigation", { name: "Recording setup" });
    await setup.getByRole("button", { name: "Devices", exact: true }).click();
    await expect(
      this.page.locator("details").filter({ hasText: "Devices & trainer" }),
    ).toHaveAttribute("open", "");
  }

  async pause(input: "click" | "keyboard" = "click") {
    const button = this.page.getByRole("button", { name: /^pause$/i });
    await expect(button).toBeEnabled();
    if (input === "keyboard") await button.press("Enter");
    else await button.click();
  }

  async resume(input: "click" | "keyboard" = "click") {
    const button = this.page.getByRole("button", { name: /^resume$/i });
    await expect(button).toBeEnabled();
    if (input === "keyboard") await button.press("Enter");
    else await button.click();
  }

  async takeOver() {
    await this.page.getByRole("button", { name: /take over recording/i }).click();
  }

  async finish(input: "click" | "keyboard" = "click") {
    const finish = this.page.getByRole("button", { name: /^finish$/i });
    await expect(finish).toBeEnabled();
    if (input === "keyboard") await finish.press("Enter");
    else await finish.click();
    await expect(this.page.getByRole("heading", { name: /review recording/i })).toBeVisible();
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
    await expect(this.page.getByRole("button", { name: /^start$/i })).toBeVisible();
  }
}
