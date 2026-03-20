import { type Page, type Locator } from "@playwright/test";

export class LoginPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    // Locators will be defined here
  }
}
