import { test as base, type Page } from "@playwright/test";

import { login } from "./acceptance/helpers";

type WebStartFixtures = {
  athletePage: Page;
  coachPage: Page;
};

export const test = base.extend<WebStartFixtures>({
  athletePage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
  coachPage: async ({ page }, use) => {
    // Coaching is a route, not a distinct auth role; the old fixture only changed email.
    await login(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
