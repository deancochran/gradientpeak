import type { Page } from "@playwright/test";

const hydrationReadySelector = 'body > div[aria-busy="false"]';
const decoratedPages = new WeakSet<Page>();

export async function waitForAppHydration(page: Page) {
  await page.locator(hydrationReadySelector).waitFor();
}

export function installHydrationAwareNavigation(page: Page) {
  if (decoratedPages.has(page)) return page;
  decoratedPages.add(page);

  const goto = page.goto.bind(page);
  page.goto = async (...args) => {
    try {
      const response = await goto(...args);
      await waitForAppHydration(page);
      return response;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("net::ERR_ABORTED")) throw error;
      await waitForAppHydration(page);
      return null;
    }
  };

  return page;
}
