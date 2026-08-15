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
  "metrics and trends E2E requires a service-role credential for the confirmed athlete fixture.",
);

test("current metrics fixture renders Trends controls", async ({ athletePage }, testInfo) => {
  const useTouch = testInfo.project.name === "Mobile Chrome";
  const fixture = await seedMetricsEffortsTrendsFixture();
  try {
    await athletePage.goto("/trends");
    await expect(athletePage.getByRole("heading", { name: "Trends" })).toBeVisible();
    await expect(athletePage.getByRole("button", { name: "30 days" })).toBeVisible();
    await expect(athletePage.getByRole("button", { name: "Weight", exact: true })).toBeVisible();
    await activateControl(
      athletePage,
      athletePage.getByRole("button", { name: "30 days" }),
      useTouch,
    );
    await expect(athletePage.getByRole("button", { name: "30 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("athlete can manage metric history and inspect trend evidence", async ({
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
    await activateControl(
      athletePage,
      providerMetricRow.getByRole("link", { name: "Details" }),
      useTouch,
    );
    await expect(athletePage.getByRole("heading", { name: "Weight" })).toBeVisible();
    await expect(athletePage.getByText("70 kg", { exact: true })).toBeVisible();
    await expect(athletePage.getByRole("button", { name: "Manual override" })).toBeVisible();
    await athletePage.goBack();
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

test("imperial viewers see canonical metric and trend evidence in preferred units", async ({
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
