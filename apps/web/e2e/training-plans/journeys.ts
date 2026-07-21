import { expect, type Page } from "@playwright/test";

export async function expectTrainingPlanLibraries(page: Page) {
  await expect(page.getByRole("heading", { name: "Training plans" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "My plans" })).toBeVisible();
  await page.getByRole("tab", { name: "Templates" }).click();
  await expect(page.getByRole("tab", { name: "Templates" })).toHaveAttribute(
    "data-state",
    "active",
  );
}

export async function saveAndRestoreMaxSessionsPreference(page: Page) {
  await page.goto("/training-preferences");
  await expect(page.getByRole("heading", { name: "Training preferences" })).toBeVisible();
  await page.getByRole("button", { name: "Schedule" }).click();
  const input = page.getByTestId("training-preferences-max-sessions-per-week");
  const original = Number(await input.inputValue());
  const changed = original === 6 ? 5 : 6;
  await input.fill(String(changed));
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Training preferences saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(input).toHaveValue(String(changed));
  await input.fill(String(original));
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Training preferences saved.")).toBeVisible();
}
