import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { AuthenticatedE2EActor } from "../support/actors";
import { expectNoHorizontalOverflow } from "./assertions";

/** Authoring proof is deliberately limited to the guarded loopback E2E lane. */
async function guardLocalAuthoringNetwork(page: Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

export async function createLocalAuthoringPage(actor: AuthenticatedE2EActor) {
  const context = await actor.createContext();
  const page = await context.newPage();
  // Install before the first navigation, including the authenticated shell load.
  await guardLocalAuthoringNetwork(page);
  return page;
}

export async function chooseAuthoringOption(page: Page, field: string | RegExp, option: string) {
  await page.getByRole("combobox", { name: field, exact: typeof field === "string" }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Begin the real drag before scrolling: dragTo can otherwise scroll its source away before dragstart. */
export async function dragAuthoringStep(page: Page, handle: Locator, target: Locator) {
  await handle.hover();
  const source = await handle.boundingBox();
  if (!source) throw new Error("A visible drag handle is required.");
  await page.mouse.down();
  try {
    await page.mouse.move(source.x + source.width / 2 + 8, source.y + source.height / 2 + 8, {
      steps: 4,
    });
    await target.scrollIntoViewIfNeeded();
    const destination = await target.boundingBox();
    if (!destination) throw new Error("A visible drop target is required.");
    const x = destination.x + destination.width / 2;
    const y = destination.y + destination.height / 2;
    await page.mouse.move(x, y, { steps: 10 });
    await page.mouse.move(x + 1, y + 1);
  } finally {
    await page.mouse.up();
  }
}

export async function captureAuthoring(
  page: Page,
  testInfo: TestInfo,
  name: string,
  controls: Locator[] = [],
) {
  await expectNoHorizontalOverflow(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Authoring proof requires a fixed browser viewport.");
  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    if (!box) throw new Error("Visible authoring control has no layout box.");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, scale: "css" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
