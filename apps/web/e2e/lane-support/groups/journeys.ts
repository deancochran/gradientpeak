import { expect, type Page } from "@playwright/test";

export function uniqueGroupName(prefix = "Parity group") {
  return `${prefix} ${Date.now().toString(36)}`;
}

export async function createOpenGroup(page: Page, name: string) {
  await page.goto("/groups/new");
  await page.getByLabel("Name").fill(name);
  await page
    .getByLabel("Description")
    .fill("Browser-created group for group-event parity coverage.");
  await page.getByLabel("Access").selectOption("public");
  await page.getByLabel("Join policy").selectOption("open");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function createOneOffEvent(page: Page, title: string) {
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByLabel("Title").fill(title);
  const starts = new Date(Date.now() + 7 * 86_400_000);
  const ends = new Date(starts.getTime() + 3_600_000);
  const localValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  await page.getByLabel("Starts").fill(localValue(starts));
  await page.getByLabel("Ends").fill(localValue(ends));
  await page.getByLabel("Location").fill("Browser clubhouse");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/groups\/events\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}
