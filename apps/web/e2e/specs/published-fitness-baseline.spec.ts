import { isValidDateOnlyUtc } from "@repo/core/calendar";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { withPlanningPathFixture } from "../planning/data";

type Projection = {
  fitness: {
    actual: Array<{ date: string; loadBalance: number; longTermLoad: number; recentLoad: number }>;
    scheduled: Array<{
      date: string;
      loadBalance: number;
      longTermLoad: number;
      recentLoad: number;
    }>;
  };
  fitnessHistory?: { maturity: null; status: "unavailable"; verifiedThrough: null };
  today: unknown;
};

function findProjection(value: unknown): Projection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.contractVersion === "plan-tab-projection-v2" && "fitness" in record) {
    return record as unknown as Projection;
  }
  for (const child of Object.values(record)) {
    const projection = findProjection(child);
    if (projection) return projection;
  }
  return undefined;
}

async function publishedSummary(chart: import("@playwright/test").Locator) {
  return chart.evaluate((element) => {
    const document = element.ownerDocument;
    const descriptionIds = (element.getAttribute("aria-describedby") ?? "").split(" ");
    return descriptionIds
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .flatMap(
        (description) =>
          description.match(/Published current model-derived fitness: [^.]+\./g) ?? [],
      )
      .at(0);
  });
}

async function expectCoincidentFitnessMarkers(chart: import("@playwright/test").Locator) {
  const publishedMarker = chart.locator(
    '[data-chart-series="published-current-fitness"][data-chart-marker="observed"]',
  );
  const projectedMarker = chart.locator(
    '[data-chart-series="planned-fitness"][data-chart-marker="scheduled"]',
  );
  await expect(publishedMarker).toHaveCount(1);
  await expect(projectedMarker).toHaveCount(1);
  await expect(publishedMarker).toHaveClass(/rounded-full/);
  await expect(projectedMarker).toHaveClass(/rotate-45/);
  await expect(publishedMarker).toHaveClass(/size-2/);
  await expect(projectedMarker).toHaveClass(/size-3/);
  expect(await publishedMarker.evaluate((marker) => marker.getAttribute("style"))).toBe(
    await projectedMarker.evaluate((marker) => marker.getAttribute("style")),
  );
}

test("plan chart shows only the controlled published current baseline when history is unavailable", async ({
  athletePage,
}, testInfo) => {
  let phase: "zero" | "nonzero" | "missing" = "zero";
  let capturedToday: string | undefined;
  const matcher = /\/api\/trpc\/.*trainingPlans\.getPlanTabProjection/;
  const controlledProjection = async (route: import("@playwright/test").Route) => {
    // This is a controlled presentation fixture, not proof of backend durability:
    // retain the real disposable response and alter only its contract-valid chart state.
    const upstream = await route.fetch();
    const chunks = (await upstream.text())
      .trimEnd()
      .split("\n")
      .filter(Boolean)
      .map((chunk) => JSON.parse(chunk) as unknown);
    const projection = chunks.map(findProjection).find((candidate) => candidate !== undefined);
    if (!projection) throw new Error("Plan-tab projection was absent from the forwarded response.");
    if (typeof projection.today !== "string" || !isValidDateOnlyUtc(projection.today)) {
      throw new Error("Forwarded plan-tab projection today was not a canonical UTC date.");
    }
    const today = projection.today;
    capturedToday ??= today;
    if (capturedToday !== today) throw new Error("Forwarded plan-tab projection today changed.");
    projection.fitnessHistory = { status: "unavailable", verifiedThrough: null, maturity: null };
    projection.fitness.actual =
      phase === "missing"
        ? []
        : [
            { date: "2020-01-01", longTermLoad: 89, recentLoad: 89, loadBalance: 0 },
            {
              date: today,
              longTermLoad: phase === "zero" ? 0 : 42,
              recentLoad: phase === "zero" ? 0 : 47,
              loadBalance: phase === "zero" ? 0 : -5,
            },
            { date: "2099-01-01", longTermLoad: 99, recentLoad: 99, loadBalance: 0 },
          ];
    projection.fitness.scheduled =
      phase === "missing"
        ? []
        : [
            {
              date: today,
              longTermLoad: phase === "zero" ? 0 : 42,
              recentLoad: phase === "zero" ? 0 : 47,
              loadBalance: phase === "zero" ? 0 : -5,
            },
          ];
    await route.fulfill({
      response: upstream,
      body: `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`,
    });
  };

  await withPlanningPathFixture(testInfo, async () => {
    await athletePage.route(matcher, controlledProjection);
    try {
      await athletePage.setViewportSize({ width: 1440, height: 1000 });
      await athletePage.goto("/plan");
      const chart = athletePage.getByRole("region", { name: "Daily training chart" });
      await expect(chart).toBeVisible();
      await expect(
        chart.getByLabel("Chart legend").getByText("Published current model-derived fitness", {
          exact: true,
        }),
      ).toBeVisible();
      if (!capturedToday) throw new Error("Expected the forwarded canonical today value.");
      expect(await publishedSummary(chart)).toBe(
        `Published current model-derived fitness: 1 daily value, latest 0 on ${capturedToday}.`,
      );
      await expectCoincidentFitnessMarkers(chart);
      await expect(chart).not.toContainText("2020-01-01");
      await expect(chart).not.toContainText("2099-01-01");
      await expect(chart).not.toContainText(/verified through/i);
      await expectNoHorizontalOverflow(athletePage);
      await athletePage.screenshot({
        fullPage: true,
        path: testInfo.outputPath("published-current-baseline-zero-desktop.png"),
      });
      await testInfo.attach("published-current-baseline-zero-desktop", {
        contentType: "image/png",
        path: testInfo.outputPath("published-current-baseline-zero-desktop.png"),
      });

      await athletePage.setViewportSize({ width: 390, height: 844 });
      await expect(chart).toBeVisible();
      await expectNoHorizontalOverflow(athletePage);
      await athletePage.screenshot({
        fullPage: true,
        path: testInfo.outputPath("published-current-baseline-zero-mobile.png"),
      });
      await testInfo.attach("published-current-baseline-zero-mobile", {
        contentType: "image/png",
        path: testInfo.outputPath("published-current-baseline-zero-mobile.png"),
      });

      const selectedDate = athletePage.getByLabel("Selected day");
      const selectedMarker = chart.getByTestId("training-chart-selected-date-marker").first();
      const originalSelection = await selectedDate.inputValue();
      await athletePage.getByRole("button", { name: "Next day" }).click();
      await expect(selectedDate).not.toHaveValue(originalSelection);
      await expect(athletePage).toHaveURL(/\/plan\?date=\d{4}-\d{2}-\d{2}/);
      await expect(selectedMarker).toHaveAttribute(
        "data-testid",
        "training-chart-selected-date-marker",
      );
      expect(await publishedSummary(chart)).toBe(
        `Published current model-derived fitness: 1 daily value, latest 0 on ${capturedToday}.`,
      );

      phase = "nonzero";
      await athletePage.reload();
      expect(await publishedSummary(chart)).toBe(
        `Published current model-derived fitness: 1 daily value, latest 42 on ${capturedToday}.`,
      );
      await expectCoincidentFitnessMarkers(chart);
      await athletePage.setViewportSize({ width: 1440, height: 1000 });
      await expect(chart).toBeVisible();
      await athletePage.screenshot({
        fullPage: true,
        path: testInfo.outputPath("published-current-baseline-nonzero-desktop.png"),
      });
      await testInfo.attach("published-current-baseline-nonzero-desktop", {
        contentType: "image/png",
        path: testInfo.outputPath("published-current-baseline-nonzero-desktop.png"),
      });
      await athletePage.setViewportSize({ width: 390, height: 844 });
      await expect(chart).toBeVisible();
      await athletePage.screenshot({
        fullPage: true,
        path: testInfo.outputPath("published-current-baseline-nonzero-mobile.png"),
      });
      await testInfo.attach("published-current-baseline-nonzero-mobile", {
        contentType: "image/png",
        path: testInfo.outputPath("published-current-baseline-nonzero-mobile.png"),
      });

      phase = "missing";
      await athletePage.reload();
      await expect(
        chart.getByLabel("Chart legend").getByText("Published current model-derived fitness", {
          exact: true,
        }),
      ).toHaveCount(0);
      expect(await publishedSummary(chart)).toBeUndefined();
      await athletePage.screenshot({
        fullPage: true,
        path: testInfo.outputPath("published-current-baseline-missing-mobile.png"),
      });
    } finally {
      await athletePage.unroute(matcher, controlledProjection).catch(() => undefined);
    }
  });
});
