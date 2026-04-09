import { expect, test } from "../fixtures";

const uiPreviewRootTestId = "ui-preview-surface";
const uiPreviewScenarioSelectors = [
  ["ui-preview-scenario-account-controls", ["profile-card", "auth-email", "settings-save"]],
  [
    "ui-preview-scenario-plan-tabs",
    [
      "settings-tabs",
      "settings-tabs-trigger-overview",
      "settings-tabs-trigger-sessions",
      "settings-tabs-content-overview",
    ],
  ],
  ["ui-preview-scenario-feedback-states", []],
  [
    "ui-preview-scenario-form-fields",
    [
      "ui-preview-form-username",
      "ui-preview-form-bio",
      "ui-preview-form-is-public",
      "ui-preview-form-sport",
      "ui-preview-form-submit",
    ],
  ],
  [
    "ui-preview-scenario-selection-controls",
    [
      "accept-terms-checkbox",
      "email-notifications-switch",
      "workout-type-select",
      "preferred-sport-radio-group",
    ],
  ],
] as const;

test("renders the shared UI preview route with fixture-driven selectors", async ({ page }) => {
  await page.goto("/dev/ui-preview");

  await expect(page.getByTestId(uiPreviewRootTestId)).toBeVisible();
  for (const [scenarioTestId, selectors] of uiPreviewScenarioSelectors) {
    await expect(page.getByTestId(scenarioTestId)).toBeVisible();
    for (const selector of selectors) {
      await expect(page.getByTestId(selector)).toBeVisible();
    }
  }

  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByTestId("settings-tabs-content-overview")).not.toBeEmpty();

  await page.getByRole("tab", { name: "Sessions" }).click();
  await expect(page.getByTestId("settings-tabs-content-sessions")).not.toBeEmpty();

  await page.getByTestId("ui-preview-form-username").fill("");
  await page.getByTestId("ui-preview-form-submit").click();
  await expect(page.getByTestId("ui-preview-form-username-error")).toContainText(
    "Username is required.",
  );
});
