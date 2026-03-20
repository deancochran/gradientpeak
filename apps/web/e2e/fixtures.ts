import { test as base, type Page } from "@playwright/test";
import { loginAs } from "./utils/loginHelper";

type MyFixtures = {
  adminPage: Page;
  coachPage: Page;
  athletePage: Page;
};

export const test = base.extend<MyFixtures>({
  /**
   * Provides a page with admin user already logged in
   */
  adminPage: async ({ page }, use) => {
    await loginAs(page, "admin");
    await use(page);
  },

  /**
   * Provides a page with coach user already logged in
   */
  coachPage: async ({ page }, use) => {
    await loginAs(page, "coach");
    await use(page);
  },

  /**
   * Provides a page with athlete user already logged in
   */
  athletePage: async ({ page }, use) => {
    await loginAs(page, "athlete");
    await use(page);
  },
});

export { expect } from "@playwright/test";
