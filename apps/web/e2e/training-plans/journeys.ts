import { createHash } from "node:crypto";
import { expect, type Page, type TestInfo } from "@playwright/test";

import { resetLocalAuthRateLimits } from "../utils/testData";

export function trainingPlanName(testInfo: TestInfo, suffix: string) {
  const digest = createHash("sha256")
    .update(`${testInfo.project.name}|${testInfo.titlePath.join("|")}|${suffix}`)
    .digest("hex")
    .slice(0, 12);
  return `Playwright ${suffix} ${digest}`;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

export async function expectTrainingPlanLibraries(
  page: Page,
  names: { ownedName: string; templateName: string },
) {
  await page.goto("/training-plans");
  await expect(page.getByRole("heading", { name: "Training plans" })).toBeVisible();
  const search = page.getByLabel("Search plans");
  await search.fill(names.ownedName);
  const ownedCard = page.getByTestId(/^training-plan-card-/).filter({ hasText: names.ownedName });
  await expect(ownedCard).toHaveCount(1);
  await expect(ownedCard.getByText("Owned browser-library fixture")).toBeVisible();

  await page.getByRole("tab", { name: "Templates" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "Templates" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await search.fill(names.templateName);
  const templateCard = page
    .getByTestId(/^training-plan-card-/)
    .filter({ hasText: names.templateName });
  await expect(templateCard).toHaveCount(1);
  await expect(templateCard.getByText("Template")).toBeVisible();
  const open = templateCard.getByRole("button", { name: "View plan" });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: names.templateName })).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

async function createPlan(page: Page, testInfo: TestInfo, suffix: string) {
  const name = trainingPlanName(testInfo, suffix);
  await page.goto("/training-plans/create");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Description").fill("Created through the persisted browser journey.");
  await page.getByRole("button", { name: "Add activity" }).click();
  await page.getByRole("button", { name: "Add activity" }).click();
  const activitySelectors = page.getByRole("combobox", { name: "Activity plan" });
  await expect(activitySelectors).toHaveCount(2);
  await activitySelectors.nth(0).selectOption({ label: "Playwright Tempo Builder" });
  await activitySelectors.nth(1).selectOption({ label: "Playwright Tempo Builder" });
  await resetLocalAuthRateLimits();
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page).toHaveURL(/\/training-plans\/[0-9a-f-]+$/i);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const id = page.url().match(/\/training-plans\/([0-9a-f-]+)$/i)?.[1];
  if (!id) throw new Error("Created training plan URL did not contain a plan ID.");
  return { id, name };
}

export async function createEditAndReloadTrainingPlan(page: Page, testInfo: TestInfo) {
  const { name } = await createPlan(page, testInfo, "Training plan");
  await page.reload();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit training plan" })).toBeVisible();
  const description = "Edited persisted browser journey description.";
  await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(description)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  return name;
}

export async function saveAndRestoreTrainingPreferences(page: Page) {
  await page.goto("/training-preferences");
  await expect(page.getByRole("heading", { name: "Training preferences" })).toBeVisible();
  await page.getByRole("button", { name: "Schedule" }).click();
  const min = page.getByTestId("training-preferences-min-sessions-per-week");
  const max = page.getByTestId("training-preferences-max-sessions-per-week");
  const originalMin = await min.inputValue();
  const originalMax = await max.inputValue();
  await max.fill("1");
  await min.fill("2");
  await resetLocalAuthRateLimits();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Minimum sessions per week cannot exceed maximum sessions",
  );
  await expect(min).toHaveValue("2");
  await expect(max).toHaveValue("1");

  await max.fill("3");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Training preferences saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(min).toHaveValue("2");
  await expect(max).toHaveValue("3");

  await min.fill(originalMin);
  await max.fill(originalMax);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Training preferences saved.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
}
