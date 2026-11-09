import { expect, type Locator, type Page } from "@playwright/test";

export class ShellPage {
  readonly mobileNavigation: Locator;
  readonly openMobileNavigationButton: Locator;
  readonly primaryNavigation: Locator;
  readonly userMenuButton: Locator;

  constructor(readonly page: Page) {
    this.primaryNavigation = page.getByRole("navigation", {
      name: "Primary navigation",
      exact: true,
    });
    this.mobileNavigation = page.getByRole("navigation", {
      name: "Mobile primary navigation",
      exact: true,
    });
    this.openMobileNavigationButton = page.getByRole("button", { name: /open navigation/i });
    this.userMenuButton = page.getByRole("button", { name: /open user menu/i });
  }

  async open(path: string) {
    try {
      await this.page.goto(path, { waitUntil: "domcontentloaded" });
    } catch (error) {
      // Client-side redirects can abort the original browser navigation after
      // the destination has already begun rendering.
      if (
        !(error instanceof Error) ||
        !/NS_BINDING_ABORTED|NS_ERROR_FAILURE|ERR_ABORTED/.test(error.message)
      ) {
        throw error;
      }
    }
  }

  async openAccountMenu(input: "click" | "keyboard" = "click") {
    // The protected shell is server-rendered before Radix attaches its menu
    // behavior. Wait for the trigger's hydrated closed state so this remains a
    // user-menu journey rather than losing a click to hydration.
    await expect(this.userMenuButton).toHaveAttribute("data-state", "closed");
    if (input === "keyboard") await this.userMenuButton.press("Enter");
    else await this.userMenuButton.click();
  }

  accountDestination(name: string | RegExp) {
    return this.page.getByRole("menuitem", { name });
  }

  async openAccountDestination(name: string | RegExp, input: "click" | "keyboard" = "click") {
    await this.openAccountMenu(input);
    const destination = this.accountDestination(name);
    if (input === "keyboard") await destination.press("Enter");
    else await destination.click();
  }

  primaryDestination(name: string | RegExp) {
    return this.primaryNavigation.getByRole("link", { name });
  }

  async openPrimaryDestination(name: string | RegExp) {
    await this.primaryDestination(name).click();
  }

  async openMobileNavigation() {
    await this.openMobileNavigationButton.click();
    await expect(this.mobileNavigation).toBeVisible();
  }

  async openMobileDestination(name: string | RegExp) {
    await this.openMobileNavigation();
    await this.mobileNavigation.getByRole("link", { name }).click();
    await expect(this.mobileNavigation).toBeHidden();
  }
}
