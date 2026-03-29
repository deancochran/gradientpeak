import { readFileSync } from "node:fs";
import path from "node:path";

import { buttonFixtures } from "@repo/ui/components/button/fixtures";
import { cardFixtures } from "@repo/ui/components/card/fixtures";
import { inputFixtures } from "@repo/ui/components/input/fixtures";
import { tabsFixtures } from "@repo/ui/components/tabs/fixtures";
import { uiPreviewFormFields } from "@repo/ui/testing/ui-preview/contract";

import { expect, test } from "../fixtures";

const uiPreviewManifest = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "../../packages/ui/src/testing/ui-preview/manifest.generated.json"),
    "utf8",
  ),
) as {
  rootTestId: string;
  scenarios: Array<{ key: string; selectors: string[]; testId: string }>;
};

test("renders the shared UI preview route with fixture-driven selectors", async ({ page }) => {
  const tabsFixture = tabsFixtures.settings;

  await page.goto("/dev/ui-preview");

  await expect(page.getByTestId(uiPreviewManifest.rootTestId)).toBeVisible();
  for (const scenario of uiPreviewManifest.scenarios) {
    await expect(page.getByTestId(scenario.testId)).toBeVisible();
    for (const selector of scenario.selectors) {
      await expect(page.getByTestId(selector)).toBeVisible();
    }
  }
  await expect(page.getByTestId(cardFixtures.profile.testId)).toBeVisible();
  await expect(page.getByTestId(inputFixtures.email.testId)).toBeVisible();
  await expect(page.getByTestId(buttonFixtures.save.testId)).toBeVisible();
  await expect(page.getByTestId(tabsFixture.rootTestId)).toBeVisible();
  await expect(page.getByRole("tab", { name: tabsFixture.triggers.overview.label })).toBeVisible();
  await expect(page.getByTestId(tabsFixture.contentTestIds.overview)).toContainText(
    tabsFixture.content.overview,
  );

  await page.getByRole("tab", { name: tabsFixture.triggers.sessions.label }).click();
  await expect(page.getByTestId(tabsFixture.contentTestIds.sessions)).toContainText(
    tabsFixture.content.sessions,
  );

  await page.getByTestId(uiPreviewFormFields.usernameTestId).fill("");
  await page.getByTestId(uiPreviewFormFields.submitButtonTestId).click();
  await expect(page.getByTestId(uiPreviewFormFields.usernameErrorTestId)).toContainText(
    "Username is required.",
  );
});
