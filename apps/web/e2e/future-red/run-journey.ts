import { expect, type Page, type TestInfo, test } from "@playwright/test";
import type {
  FutureJourneyBlueprint,
  FutureJourneyCheckpoint,
  FutureJourneyExecutor,
} from "./types";

type FutureJourneyRunOptions = {
  baseURL?: string;
  browser?: Parameters<FutureJourneyExecutor>[0]["browser"];
  executor?: FutureJourneyExecutor;
};

export async function runFutureJourney(
  page: Page,
  testInfo: TestInfo,
  blueprint: FutureJourneyBlueprint,
  options: FutureJourneyRunOptions = {},
) {
  testInfo.annotations.push({
    type: "journey-id",
    description: blueprint.id,
  });
  testInfo.annotations.push({
    type: "future-red-prerequisites",
    description: blueprint.prerequisites.join(" | "),
  });
  testInfo.annotations.push({
    type: "future-red-acceptance",
    description: blueprint.acceptance.join(" | "),
  });
  testInfo.annotations.push({
    type: "future-red-execution",
    description: options.executor ? "behavioral executor" : "checkpoint boundary",
  });

  const viewport = blueprint.viewport;
  if (viewport) {
    await test.step(`set viewport to ${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport);
    });
  }

  await test.step(`navigate to ${blueprint.path}`, async () => {
    await page.goto(blueprint.path);
  });

  const executor = options.executor;
  if (executor) {
    await test.step("execute observable journey behavior", async () => {
      await executor({
        ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
        blueprint,
        ...(options.browser === undefined ? {} : { browser: options.browser }),
        page,
        testInfo,
      });
    });
    return;
  }

  for (const checkpoint of blueprint.checkpoints) {
    await test.step(checkpoint.purpose, async () => {
      await assertCheckpoint(page, checkpoint);
    });
  }
}

async function assertCheckpoint(page: Page, checkpoint: FutureJourneyCheckpoint) {
  if (checkpoint.kind === "url") {
    await expect.soft(page, checkpoint.purpose).toHaveURL(new RegExp(checkpoint.value, "i"));
    return;
  }

  const locator =
    checkpoint.kind === "label"
      ? page.getByLabel(checkpoint.value)
      : checkpoint.kind === "role"
        ? page.getByRole(checkpoint.role, { name: new RegExp(checkpoint.name, "i") })
        : checkpoint.kind === "testId"
          ? page.getByTestId(checkpoint.value)
          : checkpoint.kind === "testIdPrefix"
            ? page.locator(`[data-testid^="${checkpoint.value}"]`).first()
            : page.getByText(checkpoint.value, { exact: false }).first();

  await expect.soft(locator, checkpoint.purpose).toBeVisible();
}
