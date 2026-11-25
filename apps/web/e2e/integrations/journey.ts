import type { Page } from "@playwright/test";

export async function disconnectWahooIfConnected(page: Page): Promise<void> {
  const disconnect = page.getByRole("button", { name: "Disconnect" });
  if (!(await disconnect.isVisible().catch(() => false))) return;

  page.once("dialog", (dialog) => dialog.accept());
  await disconnect.click();
  await page.getByRole("button", { name: "Connect" }).waitFor();
}
