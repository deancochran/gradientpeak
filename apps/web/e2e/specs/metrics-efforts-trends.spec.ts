import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { seedMetricsEffortsTrendsFixture } from "../metrics-efforts-trends-data";

async function activateControl(page: Page, target: Locator, useTouch: boolean) {
  if (!useTouch) {
    await target.click();
    return;
  }

  await target.evaluate((element) =>
    element.scrollIntoView({ behavior: "auto", block: "center", inline: "center" }),
  );
  const box = await target.boundingBox();
  if (!box) throw new Error("The touch target is not visible.");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const receivesPointerInput = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return hitTarget === element || (hitTarget ? element.contains(hitTarget) : false);
  });
  if (!receivesPointerInput) throw new Error("Another element obscures the touch target.");
  await page.touchscreen.tap(point.x, point.y);
}

test.skip(
  !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY,
  "metrics, efforts, and trends E2E requires a service-role credential for the confirmed athlete fixture.",
);

test("athlete can manage metric history and inspect read-only effort and trend evidence", async ({
  athletePage,
}, testInfo) => {
  test.setTimeout(90_000);
  const useTouch = testInfo.project.name === "Mobile Chrome";
  const fixture = await seedMetricsEffortsTrendsFixture();
  try {
    await athletePage.goto("/profile-metrics");
    await expect(athletePage.getByRole("heading", { name: "Profile metrics" })).toBeVisible();
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: /Weight/ }),
      useTouch,
    );

    const providerMetricRow = athletePage.getByRole("row").filter({ hasText: "70 kg" });
    await expect(providerMetricRow.getByText("Provider", { exact: true })).toBeVisible();
    const overrideButton = providerMetricRow.getByRole("button", { name: "Manual override" });
    await activateControl(athletePage, overrideButton, useTouch);
    await expect(athletePage.getByRole("heading", { name: "Override Weight" })).toBeVisible();
    await athletePage.getByLabel("Value (kg)").fill("72.5");
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: "Save", exact: true }),
      useTouch,
    );

    const manualMetricRow = athletePage.getByRole("row").filter({ hasText: "72.5 kg" });
    await expect(manualMetricRow.getByText("Manual", { exact: true })).toBeVisible();
    await activateControl(athletePage, manualMetricRow, useTouch);
    await expect(athletePage.getByRole("heading", { name: "Edit Weight" })).toBeVisible();
    await athletePage.getByLabel("Value (kg)").fill("72.6");
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: "Save", exact: true }),
      useTouch,
    );

    const updatedMetricRow = athletePage.getByRole("row").filter({ hasText: "72.6 kg" });
    await expect(updatedMetricRow).toBeVisible();
    await activateControl(
      athletePage,
      updatedMetricRow.getByRole("button", { name: "Delete" }),
      useTouch,
    );
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: "Delete measurement" }),
      useTouch,
    );
    await expect(updatedMetricRow).toHaveCount(0);
    await expect(providerMetricRow).toBeVisible();

    await athletePage.goto("/activity-efforts");
    await expect(athletePage.getByRole("heading", { name: "Activity efforts" })).toBeVisible();
    await expect(athletePage.getByText(/modeled and review data are excluded/i)).toBeVisible();

    const observedRow = athletePage.getByRole("row").filter({ hasText: "310 W" });
    await expect(observedRow.getByText("provider", { exact: true })).toBeVisible();
    await expect(observedRow.getByText("observed", { exact: true })).toBeVisible();
    const modeledRow = athletePage.getByRole("row").filter({ hasText: "300 W" });
    await expect(modeledRow.getByText("derived", { exact: true })).toBeVisible();
    await expect(modeledRow.getByText("modeled", { exact: true })).toBeVisible();
    const reviewRow = athletePage.getByRole("row").filter({ hasText: "290 W" });
    await expect(reviewRow.getByText("manual", { exact: true })).toBeVisible();
    await expect(reviewRow.getByText("review", { exact: true })).toBeVisible();
    await expect(athletePage.getByText("Calculated", { exact: true })).toHaveCount(3);
    await expect(athletePage.getByRole("button", { name: /add effort/i })).toHaveCount(0);

    await athletePage.goto("/activity-efforts/new");
    await expect(
      athletePage.getByText("Activity efforts are read-only", { exact: true }),
    ).toBeVisible();
    await expect(
      athletePage.getByText(/manual effort creation is no longer available/i),
    ).toBeVisible();

    await athletePage.goto("/trends");
    await expect(athletePage.getByRole("heading", { name: "Trends" })).toBeVisible();
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: "30 days" }),
      useTouch,
    );
    await expect(athletePage.getByRole("button", { name: "30 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: "Weight", exact: true }),
      useTouch,
    );
    await expect(athletePage.getByText("Weight trend", { exact: true }).first()).toBeVisible();
    await expect(athletePage.getByText(/^Long-term Load(?: unavailable)?$/)).toBeVisible();
    await expect(athletePage.getByText("Training volume", { exact: true }).first()).toBeVisible();
    await expect(athletePage.getByText(/^Activity (?:power|speed)$/).first()).toBeVisible();
    await expect(athletePage.getByText("Consistency", { exact: true })).toBeVisible();
    await expect(athletePage.getByText("Intensity mix", { exact: true })).toBeVisible();
    await expect(athletePage.getByText("Peak power evidence", { exact: true })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("imperial viewers see canonical metric, effort, and trend evidence in preferred units", async ({
  athletePage,
}, testInfo) => {
  test.setTimeout(90_000);
  const useTouch = testInfo.project.name === "Mobile Chrome";
  const fixture = await seedMetricsEffortsTrendsFixture({ preferredUnits: "imperial" });
  try {
    await athletePage.goto("/profile-metrics");
    await expect(athletePage.getByRole("heading", { name: "Profile metrics" })).toBeVisible();
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: /Weight/ }),
      useTouch,
    );

    const providerMetricRow = athletePage.getByRole("row").filter({ hasText: "154.3 lb" });
    await expect(providerMetricRow.getByText("Provider", { exact: true })).toBeVisible();
    await expect(athletePage.getByRole("img", { name: /Weight trend.*154\.3 lb/i })).toBeVisible();
    await activateControl(
      athletePage,
      providerMetricRow.getByRole("button", { name: "Manual override" }),
      useTouch,
    );
    const weightInput = athletePage.getByLabel("Value (lb)");
    await expect(weightInput).toHaveValue("154.3");
    await weightInput.fill("165.3");
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: "Save", exact: true }),
      useTouch,
    );
    await expect(athletePage.getByRole("row").filter({ hasText: "165.3 lb" })).toBeVisible();
    await expect.poll(() => fixture.getLatestManualWeightValue()).toBe(75);

    await athletePage.goto("/activity-efforts");
    await expect(athletePage.getByRole("heading", { name: "Activity efforts" })).toBeVisible();
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: /Run speed/ }),
      useTouch,
    );
    const runEffortRow = athletePage.getByRole("row").filter({ hasText: "6:42 /mi" });
    await expect(runEffortRow.getByText("provider", { exact: true })).toBeVisible();
    await expect(runEffortRow.getByText("observed", { exact: true })).toBeVisible();
    await expect(
      athletePage.getByRole("img", { name: /Run pace observed duration curve.*6:42 \/mi/i }),
    ).toBeVisible();

    await athletePage.goto("/trends");
    await expect(athletePage.getByRole("heading", { name: "Trends" })).toBeVisible();
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: "Weight", exact: true }),
      useTouch,
    );
    await expect(athletePage.getByRole("img", { name: /Weight trend.*154\.3 lb/i })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("activity effort transport failures render a retryable error instead of an empty state", async ({
  athletePage,
}) => {
  const trpcPattern = "**/api/trpc/**";
  await athletePage.route(trpcPattern, async (route) => {
    if (route.request().url().includes("activityEfforts.getForProfile")) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await athletePage.goto("/activity-efforts");
  await expect(athletePage.getByRole("alert")).toContainText(
    "Activity efforts could not be loaded",
    { timeout: 15_000 },
  );
  await expect(athletePage.getByText("No efforts recorded at this duration.")).toHaveCount(0);

  await athletePage.unroute(trpcPattern);
  await athletePage.getByRole("button", { name: "Retry activity efforts" }).click();
  await expect(athletePage.getByRole("button", { name: /Bike power/ })).toBeVisible();
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
});
