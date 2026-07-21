import type { Page } from "@playwright/test";

export async function openAppPage(page: Page, url: string) {
  await page.goto(url);
  // TanStack Start's development server performs one hydration navigation after the
  // initial document load. Waiting briefly avoids acting on controls from the page
  // that is about to be replaced; `networkidle` never settles while Vite HMR is open.
  await page.waitForTimeout(1_500);
}
