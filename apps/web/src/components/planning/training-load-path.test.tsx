// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrainingLoadPath } from "./training-load-path";

describe("TrainingLoadPath", () => {
  it("keeps the selected day as an accessible, URL-ownable control", () => {
    const onSelectedDateChange = vi.fn();
    render(
      <TrainingLoadPath
        onSelectedDateChange={onSelectedDateChange}
        projection={undefined}
        selectedDate="2026-07-25"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(onSelectedDateChange).toHaveBeenLastCalledWith("2026-07-24");
    fireEvent.change(screen.getByLabelText("Selected day"), { target: { value: "2026-07-27" } });
    expect(onSelectedDateChange).toHaveBeenLastCalledWith("2026-07-27");
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(onSelectedDateChange).toHaveBeenLastCalledWith("2026-07-26");
  });

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
          fitnessHistory: {
            status: "current",
            verifiedThrough: "2026-07-25",
            maturity: "mature",
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
    expect(screen.getByText("Session history & details")).toBeTruthy();
    expect(screen.getAllByText("Common Load 100").length).toBeGreaterThan(0);
    expect(screen.getByText(/for 2026-07-20–2026-07-26 in UTC/)).toBeTruthy();
    const chart = screen.getByRole("img", { name: /Training load chart/ });
    expect(within(chart).getByText("Scheduled / planned Common Load")).toBeTruthy();
    expect(within(chart).getByText("Completed Common Load")).toBeTruthy();
    expect(
      within(chart).getByText("Model-derived fitness verified through 2026-07-25"),
    ).toBeTruthy();
    expect(
      within(chart).getByText(
        "Planned model-derived fitness (projected from a baseline verified through 2026-07-25)",
      ),
    ).toBeTruthy();
    expect(chart.getAttribute("aria-label")).toMatch(/latest 42 on 2026-07-25/);
  });

  it("withholds unavailable actual fitness while retaining scheduled projection and labels historical series", () => {
    const projection = {
      contractVersion: "plan-tab-projection-v2" as const,
      asOf: "2026-07-25T12:00:00.000Z",
      planningTimezone: "UTC",
      today: "2026-07-25",
      currentScheduledPlan: null,
      timeline: {
        startDate: "2026-07-24",
        endDate: "2026-07-25",
        today: "2026-07-25",
        days: [
          {
            date: "2026-07-24",
            load: {
              plannedLoad: 20,
              plannedLoadStatus: "complete" as const,
              scheduledLoad: 20,
              scheduledLoadStatus: "complete" as const,
              completedLoad: 0,
              completedLoadStatus: "known_zero" as const,
              remainingLoad: 20,
              remainingLoadStatus: "complete" as const,
              recommendedLoad: null,
              recommendedLoadStatus: "unavailable" as const,
              deltaLoad: null,
            },
            scheduledItems: [],
            completedItems: [],
            annotations: [],
          },
          {
            date: "2026-07-25",
            load: {
              plannedLoad: 30,
              plannedLoadStatus: "complete" as const,
              scheduledLoad: 30,
              scheduledLoadStatus: "complete" as const,
              completedLoad: 0,
              completedLoadStatus: "known_zero" as const,
              remainingLoad: 30,
              remainingLoadStatus: "complete" as const,
              recommendedLoad: null,
              recommendedLoadStatus: "unavailable" as const,
              deltaLoad: null,
            },
            scheduledItems: [],
            completedItems: [],
            annotations: [],
          },
        ],
        weeks: [],
      },
      dayLoads: {},
      fitness: {
        actual: [
          { date: "2026-07-24", longTermLoad: 40, recentLoad: 50, loadBalance: -10 },
          { date: "2026-07-25", longTermLoad: 42, recentLoad: 52, loadBalance: -10 },
        ],
        scheduled: [
          { date: "2026-07-24", longTermLoad: 41, recentLoad: 51, loadBalance: -10 },
          { date: "2026-07-25", longTermLoad: 43, recentLoad: 53, loadBalance: -10 },
        ],
        recommended: [],
      },
      fitnessHistory: {
        status: "unavailable" as const,
        verifiedThrough: null,
        maturity: null,
      },
      recommendationPoints: [],
      ledgerItems: [],
      sourceCoverage: { activities: null, scheduledItems: null },
      goalMarkers: [],
      publishedRevision: null,
      algorithmVersion: null,
    };
    const { container, rerender } = render(
      <TrainingLoadPath projection={projection} selectedDate="2026-07-24" />,
    );

    const chart = within(container).getByRole("img", { name: /training load chart/i });
    const legend = within(chart).getByLabelText("Chart legend");
    expect(legend.textContent).toContain(
      "Planned model-derived fitness (projected from an unverified baseline)",
    );
    expect(within(chart).getAllByText(/unverified baseline/i)).toHaveLength(2);
    expect(within(chart).queryByText(/^Model-derived fitness/)).toBeNull();
    expect(
      within(container)
        .getAllByTestId("training-chart-selected-date-marker")
        .every((marker) => marker.getAttribute("x1") === "0"),
    ).toBe(true);

    rerender(
      <TrainingLoadPath
        projection={{ ...projection, fitnessHistory: undefined }}
        selectedDate="2026-07-24"
      />,
    );

    const absentHistoryChart = within(container).getByRole("img", { name: /training load chart/i });
    expect(within(absentHistoryChart).getAllByText(/unverified baseline/i)).toHaveLength(2);
    expect(within(absentHistoryChart).queryByText(/^Model-derived fitness/)).toBeNull();

    rerender(
      <TrainingLoadPath
        projection={{
          ...projection,
          fitnessHistory: {
            status: "historical",
            verifiedThrough: "2026-07-23",
            maturity: "establishing_baseline",
          },
        }}
        selectedDate="2026-07-25"
      />,
    );

    const historicalChart = within(container).getByRole("img", { name: /training load chart/i });
    expect(
      within(historicalChart).getByText(
        "Historical model-derived fitness verified through 2026-07-23",
      ),
    ).toBeTruthy();
    expect(
      within(historicalChart).getByText(
        "Planned model-derived fitness (projected from a historical baseline verified through 2026-07-23)",
      ),
    ).toBeTruthy();
    expect(
      within(container)
        .getAllByTestId("training-chart-selected-date-marker")
        .every((marker) => marker.getAttribute("x1") === "100"),
    ).toBe(true);
  });

  it("marks the selected date on the visible chart while keeping date controls keyboard accessible", () => {
    const { container } = render(
      <TrainingLoadPath
        onSelectedDateChange={vi.fn()}
        projection={{
          contractVersion: "plan-tab-projection-v2",
          asOf: "2026-07-25T12:00:00.000Z",
          planningTimezone: "UTC",
          today: "2026-07-25",
          currentScheduledPlan: null,
          timeline: {
            startDate: "2026-07-24",
            endDate: "2026-07-25",
            today: "2026-07-25",
            days: [
              {
                date: "2026-07-24",
                load: {
                  plannedLoad: 20,
                  plannedLoadStatus: "complete",
                  scheduledLoad: 20,
                  scheduledLoadStatus: "complete",
                  completedLoad: 0,
                  completedLoadStatus: "known_zero",
                  remainingLoad: 20,
                  remainingLoadStatus: "complete",
                  recommendedLoad: null,
                  recommendedLoadStatus: "unavailable",
                  deltaLoad: null,
                },
                scheduledItems: [],
                completedItems: [],
                annotations: [],
              },
              {
                date: "2026-07-25",
                load: {
                  plannedLoad: 30,
                  plannedLoadStatus: "complete",
                  scheduledLoad: 30,
                  scheduledLoadStatus: "complete",
                  completedLoad: 0,
                  completedLoadStatus: "known_zero",
                  remainingLoad: 30,
                  remainingLoadStatus: "complete",
                  recommendedLoad: null,
                  recommendedLoadStatus: "unavailable",
                  deltaLoad: null,
                },
                scheduledItems: [],
                completedItems: [],
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
        }}
        selectedDate="2026-07-25"
      />,
    );

    expect(within(container).getByRole("img", { name: /Selected day: 2026-07-25/ })).toBeTruthy();
    expect(within(container).getByDisplayValue("2026-07-25")).toBeTruthy();
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
    const scheduledSummary = within(container).getByTestId("training-load-summary-scheduled");
    const scheduledSummaryValue = within(scheduledSummary).getByTestId(
      "training-load-summary-scheduled-value",
    );
    expect(scheduledSummaryValue.textContent).toBe("Common Load ~35");
    expect(scheduledSummaryValue.className).toContain("max-w-full");
    expect(scheduledSummaryValue.className).toContain("whitespace-normal");
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
    expect(within(container).getByTestId("training-load-summary-scheduled-value").textContent).toBe(
      "Common Load unavailable",
    );
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
