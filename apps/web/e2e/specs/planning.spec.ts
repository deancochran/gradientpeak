import { expect, test } from "../fixtures";
import { withPlanningPathFixture } from "../planning/data";
import { openPlanningRoute, planningJourneyIds, planningTestIdentity } from "../planning/journeys";

test("planning.training-path and calendar.navigation expose server-composed firm and tentative paths", async ({
  athletePage,
}, testInfo) => {
  expect(planningJourneyIds).toContain("planning.training-path");
  await withPlanningPathFixture(testInfo, async (fixture) => {
    const effectiveLoadResponse = athletePage.waitForResponse(
      (response) =>
        response.url().includes("/api/trpc/") &&
        response.url().includes("trainingPlans.getEffectiveLoad"),
    );
    await openPlanningRoute(athletePage, "/plan", /^plan$/i);
    const effectiveLoad = await readEffectiveLoadResponse(await effectiveLoadResponse);
    expect(effectiveLoad).toMatchObject({
      status: "available",
      resolvedRange: { startDate: fixture.startDate, endDate: fixture.endDate, timezone: "UTC" },
      sourceCounts: { events: expect.any(Number) },
      sourceCoverage: {
        activities: { status: "complete" },
        scheduledItems: { status: "complete" },
      },
      effective: { status: "available" },
    });
    expect(effectiveLoad.sourceCounts.events).toBeGreaterThanOrEqual(1);
    const dtoFirmItem = effectiveLoad.effective.firmItems.find(
      (item) => item.scheduledItemId === fixture.eventId,
    );
    if (!dtoFirmItem) throw new Error("Effective Load DTO did not contain the expected firm item.");
    expect(dtoFirmItem).toMatchObject({
      date: fixture.date,
      kind: "scheduled",
    });
    expect(effectiveLoad.effective.tentativeItems).toEqual([]);
    expect(dtoFirmItem.commonLoad).toMatchObject({ status: "complete" });
    await expect(
      athletePage.getByRole("heading", { level: 2, name: /training path/i }),
    ).toBeVisible();
    await expect(athletePage.getByRole("tab", { name: /firm/i })).toBeVisible();
    await expect(
      athletePage.getByText(`for ${fixture.startDate}–${fixture.endDate} in UTC`),
    ).toBeVisible();
    await athletePage.getByRole("tab", { name: /^firm$/i }).press("Enter");
    const firmItemRow = athletePage
      .getByRole("tabpanel")
      .filter({ has: athletePage.locator(`[data-scheduled-item-id="${fixture.eventId}"]`) })
      .locator(`[data-scheduled-item-id="${fixture.eventId}"]`);
    await expect(firmItemRow).toBeVisible();
    await expect(firmItemRow.getByText(/^Common Load \d+(?:\.\d+)?$/)).toBeVisible();
    await athletePage.getByRole("tab", { name: /^tentative$/i }).press("Enter");
    await expect(
      athletePage.getByText("No tentative activities are scheduled in this window."),
    ).toBeVisible();
    await expect(athletePage.getByText(/\b(?:TSS|IF|CTL|ATL|TSB)\b/)).toHaveCount(0);
    await expect(
      athletePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).resolves.toBe(true);
  });

  await openPlanningRoute(
    athletePage,
    "/calendar?month=2026-07&date=2026-07-20&view=month",
    /^calendar$/i,
  );
  await expect(athletePage.getByRole("tab", { name: /^month$/i })).toBeVisible();
  await expect(athletePage.getByText("July 2026")).toBeVisible();
  await athletePage.getByRole("button", { name: "Previous calendar period" }).click();
  await expect(athletePage.getByText("June 2026")).toBeVisible();
  await expect(athletePage).toHaveURL(/month=2026-06/);
  await athletePage.getByRole("button", { name: "Next calendar period" }).click();
  await expect(athletePage.getByText("July 2026")).toBeVisible();
  await athletePage.getByRole("tab", { name: /^week$/i }).press("Enter");
  await expect(athletePage.getByRole("heading", { name: /week view/i })).toBeVisible();
  await expect(athletePage).toHaveURL(/date=2026-07-20.*month=2026-07.*view=week/);
  await athletePage.getByRole("button", { name: "Next calendar period" }).click();
  await expect(athletePage).toHaveURL(/date=2026-07-27.*month=2026-07.*view=week/);
  await expect(athletePage.getByText("2026-07-26 – 2026-08-01")).toBeVisible();
  await athletePage.getByRole("tab", { name: /^agenda$/i }).press("Enter");
  await expect(athletePage.getByRole("heading", { name: /month agenda/i })).toBeVisible();
  await expect(athletePage).toHaveURL(/date=2026-07-27.*month=2026-07.*view=agenda/);
  await athletePage.reload();
  await expect(athletePage.getByRole("heading", { name: /month agenda/i })).toBeVisible();
  await athletePage.goto("/calendar?month=2026-07&date=2026-07-27&view=week");
  await expect(athletePage.getByRole("heading", { name: /week view/i })).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByRole("heading", { name: /month agenda/i })).toBeVisible();
  await athletePage.goForward();
  await expect(athletePage.getByRole("heading", { name: /week view/i })).toBeVisible();
  await openPlanningRoute(
    athletePage,
    "/calendar?month=2026-13&date=not-a-date&view=unknown",
    /^calendar$/i,
  );
  await expect(athletePage.getByRole("tab", { name: /^month$/i })).toHaveAttribute(
    "data-state",
    "active",
  );
  await athletePage.goto("/calendar?month=2026-07&date=2026-07-20&view=month");
  await athletePage.getByRole("link", { name: "Open calendar day 2026-07-20" }).click();
  await expect(athletePage).toHaveURL(/\/calendar\/day\/2026-07-20/);
  await expect(athletePage.getByText("Day agenda and goal anchors.")).toBeVisible();
  await athletePage.getByText("Previous day", { exact: true }).click();
  await expect(athletePage).toHaveURL(/\/calendar\/day\/2026-07-19/);
  await athletePage.getByText("Next day", { exact: true }).click();
  await expect(athletePage).toHaveURL(/\/calendar\/day\/2026-07-20/);
  await athletePage.getByText("Back to calendar", { exact: true }).click();
  await expect(athletePage).toHaveURL(/date=2026-07-20.*month=2026-07.*view=month/);
  await athletePage.getByRole("link", { name: "Open calendar day 2026-07-20" }).click();
  await athletePage.getByText("Create event for this day", { exact: true }).click();
  await expect(athletePage).toHaveURL(/\/calendar\/new\?date=2026-07-20&type=custom/);
  await expect(
    athletePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).resolves.toBe(true);
});

type EffectiveLoadResponse = {
  effective: {
    firmItems: Array<{
      commonLoad: unknown;
      date: string;
      kind: string;
      scheduledItemId?: string;
    }>;
    status: string;
    tentativeItems: unknown[];
  };
  resolvedRange: { endDate: string; startDate: string; timezone: string };
  sourceCounts: { events: number };
  sourceCoverage: {
    activities: { status: string };
    scheduledItems: { status: string };
  };
  status: string;
};

async function readEffectiveLoadResponse(response: import("@playwright/test").Response) {
  const payload: unknown = await response.json();
  const data = findEffectiveLoadDto(payload);
  if (!data) {
    throw new Error(`Effective Load response was HTTP ${response.status()} without a parsed DTO.`);
  }
  return data as EffectiveLoadResponse;
}

function findEffectiveLoadDto(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if ("sourceCounts" in record && "sourceCoverage" in record && "resolvedRange" in record) {
    return record;
  }
  for (const child of Object.values(record)) {
    const found = findEffectiveLoadDto(child);
    if (found) return found;
  }
  return undefined;
}

test("agenda.create and events.recurrence persist a bounded series and honor delete scope", async ({
  athletePage,
}) => {
  const title = planningTestIdentity("Web recurring event");
  await athletePage.goto("/calendar/new?date=2026-08-03&type=custom");
  await athletePage.getByLabel("Title").fill(title);
  await athletePage.getByLabel("Repeat weekly").selectOption("4");
  await athletePage.getByRole("button", { name: /^create$/i }).click();
  await expect(athletePage.getByRole("heading", { name: title })).toBeVisible();

  await athletePage.getByRole("button", { name: /^delete$/i }).click();
  await athletePage.getByLabel("Delete recurrence scope").selectOption("series");
  await athletePage.getByRole("button", { name: /delete event/i }).click();
  await expect(athletePage).toHaveURL(/\/calendar/);
});
