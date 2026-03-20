import { buttonFixtures } from "@repo/ui/components/button/fixtures";
import { cardFixtures } from "@repo/ui/components/card/fixtures";
import { inputFixtures } from "@repo/ui/components/input/fixtures";
import { tabsFixtures } from "@repo/ui/components/tabs/fixtures";

import { expect, test } from "../fixtures";

test("renders the shared UI preview route with fixture-driven selectors", async ({
  page,
}) => {
  const tabsFixture = tabsFixtures.settings;

  await page.goto("/dev/ui-preview");

  await expect(page.getByTestId(cardFixtures.profile.testId)).toBeVisible();
  await expect(page.getByTestId(inputFixtures.email.testId)).toBeVisible();
  await expect(page.getByTestId(buttonFixtures.save.testId)).toBeVisible();
  await expect(page.getByTestId(tabsFixture.rootTestId)).toBeVisible();
  await expect(
    page.getByRole("tab", { name: tabsFixture.triggers.overview.label }),
  ).toBeVisible();
  await expect(
    page.getByTestId(tabsFixture.contentTestIds.overview),
  ).toContainText(tabsFixture.content.overview);
});
