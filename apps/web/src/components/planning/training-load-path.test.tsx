// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrainingLoadPath } from "./training-load-path";

describe("TrainingLoadPath", () => {
  it("renders scheduled firm work from the single Plan-tab projection DTO", () => {
    render(
      <TrainingLoadPath
        projection={{
          contractVersion: "plan-tab-projection-v2",
          asOf: "2026-07-25T12:00:00.000Z",
          planningTimezone: "UTC",
          today: "2026-07-25",
          currentScheduledPlan: null,
          timeline: {
            startDate: "2026-07-20",
            endDate: "2026-07-26",
            today: "2026-07-25",
            days: [
              {
                date: "2026-07-25",
                load: {
                  plannedLoad: 100,
                  plannedLoadStatus: "complete",
                  scheduledLoad: 100,
                  scheduledLoadStatus: "complete",
                  completedLoad: 0,
                  completedLoadStatus: "known_zero",
                  remainingLoad: 100,
                  remainingLoadStatus: "complete",
                  recommendedLoad: 100,
                  recommendedLoadStatus: "complete",
                  deltaLoad: null,
                },
                scheduledItems: [
                  {
                    id: "00000000-0000-4000-8000-000000000001",
                    source: "training_plan",
                    date: "2026-07-25",
                    title: "Aerobic ride",
                    activityCategory: "bike",
                    plannedLoad: 100,
                    plannedLoadStatus: "complete",
                    status: "planned",
                  },
                ],
                completedItems: [],
                annotations: [],
              },
            ],
            weeks: [
              {
                weekStart: "2026-07-20",
                weekEnd: "2026-07-26",
                load: {
                  plannedLoad: 100,
                  plannedLoadStatus: "complete",
                  scheduledLoad: 100,
                  scheduledLoadStatus: "complete",
                  completedLoad: 0,
                  completedLoadStatus: "known_zero",
                  remainingLoad: 100,
                  remainingLoadStatus: "complete",
                  recommendedLoad: 100,
                  recommendedLoadStatus: "complete",
                  deltaLoad: null,
                },
                dayCount: 7,
                trainingDayCount: 1,
              },
            ],
          },
          dayLoads: {},
          fitness: {
            actual: [{ date: "2026-07-25", longTermLoad: 42, recentLoad: 50, loadBalance: -8 }],
            scheduled: [{ date: "2026-07-25", longTermLoad: 44, recentLoad: 54, loadBalance: -10 }],
            recommended: [],
          },
          recommendationPoints: [],
          ledgerItems: [],
          sourceCoverage: {
            activities: {
              startDate: "2026-07-20",
              endDate: "2026-07-26",
              status: "complete",
            },
            scheduledItems: {
              startDate: "2026-07-20",
              endDate: "2026-07-26",
              status: "complete",
            },
          },
          goalMarkers: [],
          publishedRevision: 4,
          algorithmVersion: "athlete-state-projection-v1",
        }}
      />,
    );

    expect(
      document.querySelector('[data-scheduled-item-id="00000000-0000-4000-8000-000000000001"]'),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Firm" })).toBeTruthy();
    expect(screen.getAllByText("Common Load 100").length).toBeGreaterThan(0);
    expect(screen.getByText(/for 2026-07-20–2026-07-26 in UTC/)).toBeTruthy();
    const chart = screen.getByRole("img", { name: /Training load chart/ });
    expect(within(chart).getByText("Scheduled / planned Common Load")).toBeTruthy();
    expect(within(chart).getByText("Completed Common Load")).toBeTruthy();
    expect(within(chart).getByText("Actual fitness")).toBeTruthy();
    expect(within(chart).getByText("Scheduled fitness")).toBeTruthy();
    expect(chart.getAttribute("aria-label")).toMatch(/latest 42 on 2026-07-25/);
  });

  it("withholds partial scheduled work and unavailable completed activity Load without zeroing it", () => {
    const projection = {
      contractVersion: "plan-tab-projection-v2" as const,
      asOf: "2026-07-25T12:00:00.000Z",
      planningTimezone: "UTC",
      today: "2026-07-25",
      currentScheduledPlan: null,
      timeline: {
        startDate: "2026-07-25",
        endDate: "2026-07-25",
        today: "2026-07-25",
        days: [
          {
            date: "2026-07-25",
            load: {
              plannedLoad: null,
              plannedLoadStatus: "unavailable" as const,
              scheduledLoad: 35,
              scheduledLoadStatus: "partial" as const,
              completedLoad: null,
              completedLoadStatus: "unavailable" as const,
              remainingLoad: 35,
              remainingLoadStatus: "partial" as const,
              recommendedLoad: null,
              recommendedLoadStatus: "unavailable" as const,
              deltaLoad: -35,
            },
            scheduledItems: [
              {
                id: "planned-partial",
                source: "training_plan" as const,
                date: "2026-07-25",
                title: "Open session",
                activityCategory: "run",
                plannedLoad: 35,
                plannedLoadStatus: "partial" as const,
                status: "planned" as const,
              },
            ],
            completedItems: [
              {
                id: "completed-unavailable",
                source: "completed_activity" as const,
                date: "2026-07-25",
                title: "Ride without Load",
                activityCategory: "bike",
                completedLoad: null,
                completedLoadStatus: "unavailable" as const,
              },
            ],
            annotations: [],
          },
        ],
        weeks: [],
      },
      dayLoads: {},
      fitness: { actual: [], scheduled: [], recommended: [] },
      recommendationPoints: [],
      ledgerItems: [],
      sourceCoverage: { activities: null, scheduledItems: null },
      goalMarkers: [],
      publishedRevision: null,
      algorithmVersion: null,
    };

    const { container, rerender } = render(<TrainingLoadPath projection={projection} />);
    expect(screen.getAllByText("Common Load ~35").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Partial Common Load 35")).toBeNull();
    const completedItem = screen.getByText("Ride without Load").parentElement?.parentElement;
    if (!completedItem) throw new Error("Expected the completed activity row");
    expect(within(completedItem).getByText("Common Load unavailable")).toBeTruthy();
    expect(within(completedItem).queryByText("Common Load 0")).toBeNull();
    expect(
      screen.getByRole("img", {
        name: /unavailable Common Load values.*omitted, not shown as zero/i,
      }),
    ).toBeTruthy();
    expect(container.querySelectorAll("circle").length).toBeGreaterThan(0);

    rerender(
      <TrainingLoadPath
        projection={{
          ...projection,
          timeline: {
            ...projection.timeline,
            endDate: "2026-07-26",
            days: [
              ...projection.timeline.days,
              {
                date: "2026-07-26",
                load: {
                  plannedLoad: null,
                  plannedLoadStatus: "unavailable",
                  scheduledLoad: null,
                  scheduledLoadStatus: "unavailable",
                  completedLoad: 20,
                  completedLoadStatus: "complete",
                  remainingLoad: null,
                  remainingLoadStatus: "unavailable",
                  recommendedLoad: null,
                  recommendedLoadStatus: "unavailable",
                  deltaLoad: null,
                },
                scheduledItems: [],
                completedItems: [
                  {
                    id: "completed-known",
                    source: "completed_activity",
                    date: "2026-07-26",
                    title: "Ride with Load",
                    activityCategory: "bike",
                    completedLoad: 20,
                    completedLoadStatus: "complete",
                  },
                ],
                annotations: [],
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getAllByText("Common Load unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("Partial Common Load 20")).toBeNull();

    rerender(
      <TrainingLoadPath
        projection={{
          ...projection,
          timeline: {
            ...projection.timeline,
            days: [
              {
                ...projection.timeline.days[0],
                date: projection.timeline.days[0]?.date ?? "2026-07-25",
                load: {
                  plannedLoad: null,
                  plannedLoadStatus: "unavailable",
                  scheduledLoad: null,
                  scheduledLoadStatus: "unavailable",
                  completedLoad: null,
                  completedLoadStatus: "unavailable",
                  remainingLoad: null,
                  remainingLoadStatus: "unavailable",
                  recommendedLoad: null,
                  recommendedLoadStatus: "unavailable",
                  deltaLoad: null,
                },
                scheduledItems: [],
                completedItems: [],
                annotations: [],
              },
            ],
          },
        }}
      />,
    );
    expect(within(container).queryByRole("img", { name: /Training load chart/ })).toBeNull();
    expect(within(container).getByText(/No chart data is available/)).toBeTruthy();
  });
});
