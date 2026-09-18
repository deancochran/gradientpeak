import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { withPlanningPathFixture } from "../planning/data";
import { withDayAgendaFixture } from "../planning/day-agenda";
import { openPlanningRoute, planningJourneyIds, planningTestIdentity } from "../planning/journeys";

test("planning.training-path and calendar.navigation expose the server-composed scheduled path", async ({
  athletePage,
}, testInfo) => {
  expect(planningJourneyIds).toContain("planning.training-path");
  await withPlanningPathFixture(testInfo, async (fixture) => {
    const planTabResponse = athletePage.waitForResponse(
      (response) =>
        response.url().includes("/api/trpc/") &&
        response.url().includes("trainingPlans.getPlanTabProjection"),
    );
    await openPlanningRoute(athletePage, "/plan", /^plan$/i);
    const planTab = await readPlanTabResponse(await planTabResponse);
    expect(planTab).toMatchObject({
      contractVersion: "plan-tab-projection-v2",
      planningTimezone: "UTC",
      timeline: { startDate: fixture.startDate, endDate: fixture.endDate },
      sourceCoverage: {
        activities: { status: "complete" },
        scheduledItems: { status: "complete" },
      },
    });
    const dtoFirmItem = planTab.timeline.days
      .flatMap((day) => day.scheduledItems)
      .find((item) => item.id === fixture.eventId);
    if (!dtoFirmItem) throw new Error("Plan-tab DTO did not contain the expected firm item.");
    expect(dtoFirmItem).toMatchObject({
      id: fixture.eventId,
      status: "planned",
    });
    expect(dtoFirmItem.plannedLoad).toEqual(expect.any(Number));
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
    await expect(athletePage.getByText(/\b(?:TSS|IF|CTL|ATL|TSB)\b/)).toHaveCount(0);
    await expectNoHorizontalOverflow(athletePage);
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
  await athletePage.getByRole("link", { name: /^2026-07-20\./ }).click();
  await expect(athletePage).toHaveURL(/\/calendar\/day\/2026-07-20/);
  await expect(athletePage.getByText("Day agenda and goal anchors.")).toBeVisible();
  await athletePage.getByText("Previous day", { exact: true }).click();
  await expect(athletePage).toHaveURL(/\/calendar\/day\/2026-07-19/);
  await athletePage.getByText("Next day", { exact: true }).click();
  await expect(athletePage).toHaveURL(/\/calendar\/day\/2026-07-20/);
  await athletePage.getByText("Back to calendar", { exact: true }).click();
  await expect(athletePage).toHaveURL(/date=2026-07-20.*month=2026-07.*view=month/);
  await athletePage.getByRole("link", { name: /^2026-07-20\./ }).click();
  await athletePage.getByText("Create event for this day", { exact: true }).click();
  await expect(athletePage).toHaveURL(/\/calendar\/new\?date=2026-07-20$/);
  await expectNoHorizontalOverflow(athletePage);
});

type PlanTabResponse = {
  contractVersion: "plan-tab-projection-v2";
  planningTimezone: string | null;
  sourceCoverage: {
    activities: { status: string };
    scheduledItems: { status: string };
  };
  timeline: {
    endDate: string;
    startDate: string;
    days: Array<{
      scheduledItems: Array<{
        id: string;
        plannedLoad?: number | null;
        status: string;
      }>;
    }>;
  };
};

async function readPlanTabResponse(response: import("@playwright/test").Response) {
  const payload: unknown = await response.json();
  const data = findPlanTabDto(payload);
  if (!data) {
    throw new Error(`Plan-tab response was HTTP ${response.status()} without a parsed DTO.`);
  }
  return data as PlanTabResponse;
}

function findPlanTabDto(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.contractVersion === "plan-tab-projection-v2" && "timeline" in record) {
    return record;
  }
  for (const child of Object.values(record)) {
    const found = findPlanTabDto(child);
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

test("[P0] selected-day agenda shows planned and completed information for an arbitrary date", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  await withDayAgendaFixture(testInfo, athleteActor, async (fixture) => {
    await athletePage.goto(`/calendar/day/${fixture.date}?month=2026-11&view=agenda`);
    await expect(athletePage.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible();
    await expect(
      athletePage.getByRole("link", {
        name: `Open planned activity ${fixture.plannedPlanName}`,
      }),
    ).toBeVisible();
    await expect(athletePage.getByText(fixture.completedName, { exact: true })).toBeVisible();
    await expect(athletePage.getByTestId(`activity-card-${fixture.activityId}`)).toBeVisible();

    await athletePage.getByText("Previous day", { exact: true }).click();
    await expect(athletePage.getByText(fixture.completedName, { exact: true })).toHaveCount(0);
    await expect(
      athletePage.getByRole("link", {
        name: `Open planned activity ${fixture.plannedPlanName}`,
      }),
    ).toHaveCount(0);

    await athletePage.getByText("Next day", { exact: true }).click();
    await expect(athletePage).toHaveURL(new RegExp(`/calendar/day/${fixture.date}`));
    await expect(athletePage.getByText(fixture.completedName, { exact: true })).toBeVisible();
    await athletePage.reload();
    await expect(
      athletePage.getByRole("link", {
        name: `Open planned activity ${fixture.plannedPlanName}`,
      }),
    ).toBeVisible();
    await expect(athletePage.getByText(fixture.completedName, { exact: true })).toBeVisible();
  });
});
