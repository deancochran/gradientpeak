import type { Page } from "@playwright/test";

export async function openRecordingPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
}
