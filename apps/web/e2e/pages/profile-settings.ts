import { expect, type Page } from "@playwright/test";
import { ShellPage } from "./shell";

export class ProfilePage {
  readonly shell: ShellPage;

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page);
  }

  async openOwnedProfile(input: "click" | "keyboard" = "click") {
    await this.shell.openAccountDestination(/^profile$/i, input);
  }

  async openFollowers() {
    await this.page.getByRole("link", { name: /followers$/i }).click();
  }

  async openFollowing(input: "click" | "keyboard" = "click") {
    const link = this.page.getByRole("link", { name: /following$/i });
    if (input === "keyboard") await link.press("Enter");
    else await link.click();
  }

  async openSettings() {
    await this.page.getByRole("link", { name: /edit profile/i }).click();
  }
}

export class SettingsPage {
  constructor(readonly page: Page) {}

  async open() {
    await this.page.goto("/settings");
  }

  /** Persist an athlete-visible planning preference through Settings, not tRPC setup. */
  async setPlanningTimezone(timezone: string) {
    await this.open();
    await this.page.getByLabel("Planning Timezone").click();
    await this.page.getByLabel("Search timezones").fill(timezone);
    await this.page.getByRole("option", { name: timezone, exact: true }).click();
    await this.page.getByRole("button", { name: "Update Profile" }).click();
    await expect(
      this.page.getByText("Profile updated successfully", { exact: true }).last(),
    ).toBeVisible();
  }

  async signOut(input: "click" | "keyboard" = "click") {
    const button = this.page.getByRole("button", { name: "Sign Out", exact: true });
    if (input === "keyboard") await button.press("Enter");
    else await button.click();
    await expect(this.page).toHaveURL(/\/auth\/login/);
  }
}
