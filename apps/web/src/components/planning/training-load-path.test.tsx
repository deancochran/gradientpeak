// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrainingLoadPath } from "./training-load-path";

describe("TrainingLoadPath", () => {
  it("renders scheduled firm work from the single Plan-tab projection DTO", () => {
    render(
      <TrainingLoadPath
        projection={{
          contractVersion: "plan-tab-projection-v1",
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
                  scheduledLoad: 100,
                  completedLoad: 0,
                  remainingLoad: 100,
                  recommendedLoad: null,
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
                  scheduledLoad: 100,
                  completedLoad: 0,
                  remainingLoad: 100,
                  recommendedLoad: null,
                  deltaLoad: null,
                },
                dayCount: 7,
                trainingDayCount: 1,
              },
            ],
          },
          dayLoads: {},
          fitness: { actual: [], scheduled: [], recommended: [] },
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
  });
});
