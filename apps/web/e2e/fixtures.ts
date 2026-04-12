import { test as base, type Page } from "@playwright/test";

import { loginAs } from "./utils/loginHelper";

type WebStartFixtures = {
  athletePage: Page;
  coachPage: Page;
};

export const test = base.extend<WebStartFixtures>({
  athletePage: async ({ page }, use) => {
    await loginAs(page, "athlete");
    await use(page);
  },
  coachPage: async ({ page }, use) => {
    await loginAs(page, "coach");
    await use(page);
  },
});

export { expect } from "@playwright/test";
