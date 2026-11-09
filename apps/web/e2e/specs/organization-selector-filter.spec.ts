import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const offenders = Array.from(document.querySelectorAll("*")).flatMap((element) => {
      const { right } = element.getBoundingClientRect();
      if (right <= viewportWidth + 1) return [];

      return [
        {
          className: element.getAttribute("class"),
          right: Math.round(right),
          tagName: element.tagName.toLowerCase(),
          text: element.textContent?.trim().slice(0, 120),
        },
      ];
    });

    return { offenders, scrollWidth: document.documentElement.scrollWidth, viewportWidth };
  });

  expect(
    overflow.scrollWidth,
    `Horizontal overflow at ${overflow.viewportWidth}px: ${JSON.stringify(overflow.offenders)}`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

test("filters the current organization page locally and preserves each organization destination", async ({
  athletePage: page,
  e2eIdentity,
}, testInfo) => {
  const summitName = "Summit filter acceptance";
  const peakName = "Peak filter acceptance";

  for (const [name, slug] of [
    [summitName, "summit-filter"],
    [peakName, "peak-filter"],
  ] as const) {
    await page.goto("/organizations/new");
    await page.getByLabel("Organization name", { exact: true }).fill(name);
    await page
      .getByLabel("Organization URL name", { exact: true })
      .fill(`${slug}-${e2eIdentity.uuid("organization")}`);
    await page.getByRole("button", { name: "Create organization", exact: true }).click();
    await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  }

  await page.goto("/organizations");
  const filter = page.getByRole("searchbox", { name: "Filter organizations on this page" });
  await expect(filter).toBeVisible();
  await expect(page.getByText("Filters organizations shown on this page only.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Open ${summitName} coaching dashboard` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Open ${peakName} coaching dashboard` }),
  ).toBeVisible();

  for (const viewport of [
    { label: "desktop", width: 1440, height: 1000 },
    { label: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`O13--ready--${viewport.label}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await expectNoHorizontalOverflow(page);
  }

  await filter.fill("  PEAK  ");
  await expect(
    page.getByRole("link", { name: `Open ${peakName} coaching dashboard` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Open ${summitName} coaching dashboard` }),
  ).toHaveCount(0);

  await filter.fill("no matching organization");
  await expect(page.getByText("No organizations on this page match this filter.")).toBeVisible();
  await page.getByRole("button", { name: "Clear Filter organizations on this page" }).click();
  await expect(
    page.getByRole("link", { name: `Open ${summitName} coaching dashboard` }),
  ).toBeVisible();

  await page.getByRole("link", { name: `Open ${peakName} coaching dashboard` }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
});
