import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));

const { PlanSelectedPeriodReview } = require("./PlanSelectedPeriodReview");

const complete = (value: number) => ({ status: "complete", value, knownSubtotal: null });
const summary = (load: number, sessions: number) => ({
  durationSeconds: complete(3600),
  intensity: complete(0.75),
  load: complete(load),
  sessions: {
    categoryCounts: [{ category: "run", count: sessions }],
    status: "complete",
    value: sessions,
  },
});
const unavailableState = {
  endpoint: null,
  source: "unavailable",
  status: "unavailable",
};

function review(overrides: Record<string, unknown> = {}) {
  return {
    actual: summary(80, 3),
    algorithmVersion: "projection-v1",
    asOf: "2026-03-08T12:00:00.000Z",
    comparison: {
      actual: summary(60, 2),
      projected: { ...summary(0, 0), targetLoad: complete(0) },
    },
    comparisonPeriod: {
      endDate: "2026-03-01",
      inclusiveDayCount: 7,
      startDate: "2026-02-23",
    },
    contractVersion: "plan-period-review-v1",
    coverage: { activities: "complete", scheduledItems: "complete" },
    findings: [
      {
        priority: 1,
        targetLoad: 100,
        type: "historical_completed_load_below_target",
        workload: 80,
      },
    ],
    periodState: "historical",
    planningTimezone: "UTC",
    projected: { ...summary(0, 0), targetLoad: complete(100) },
    publishedRevision: 7,
    recoveryContext: { reason: "not_composed", status: "unavailable" },
    request: { anchorDate: "2026-03-04", period: "week" },
    selectedPeriod: {
      endDate: "2026-03-08",
      inclusiveDayCount: 7,
      startDate: "2026-03-02",
    },
    thresholdEvidence: { reason: "not_composed", status: "unavailable" },
    trainingState: {
      comparison: {
        actual: { ...unavailableState, delta: null, end: null, start: null },
        scheduled: unavailableState,
      },
      fitnessHistory: { maturity: "mature", status: "current" },
      selected: {
        actual: {
          delta: { fatigue: -1, fitness: 2.4, form: 3.4 },
          end: { fatigue: 38, fitness: 45, form: 7 },
          source: "modeled_from_completed_load",
          start: { fatigue: 39, fitness: 42.6, form: 3.6 },
          status: "available",
        },
        scheduled: unavailableState,
      },
    },
    ...overrides,
  };
}

it("shows a concise historical weekly review and opens the period ledger", async () => {
  const onOpenDetails = jest.fn();
  await renderNative(
    <PlanSelectedPeriodReview
      fallbackPoint={null}
      loading={false}
      onOpenDetails={onOpenDetails}
      onRetry={jest.fn()}
      review={review()}
    />,
  );

  expect(screen.getByText("Week of March 2")).toBeTruthy();
  expect(screen.getByText("Completed Load is 20 below the recommended target.")).toBeTruthy();
  expect(screen.queryByText(/Calculated Fitness changed/)).toBeNull();
  expect(screen.queryByText("Completed Load was 20 higher than the previous week.")).toBeNull();
  expect(screen.queryByText(/3 completed/)).toBeNull();
  await fireEvent.press(screen.getByTestId("plan-selected-period-training-breakdown"));
  expect(onOpenDetails).toHaveBeenCalledTimes(1);
});

it("keeps projected weekly state explicit for a future period", async () => {
  await renderNative(
    <PlanSelectedPeriodReview
      fallbackPoint={null}
      loading={false}
      onOpenDetails={jest.fn()}
      onRetry={jest.fn()}
      review={review({
        periodState: "future",
        request: { anchorDate: "2026-05-13", period: "week" },
        selectedPeriod: {
          endDate: "2026-05-17",
          inclusiveDayCount: 7,
          startDate: "2026-05-11",
        },
        trainingState: {
          ...review().trainingState,
          selected: {
            actual: { ...unavailableState, delta: null, end: null, start: null },
            scheduled: {
              endpoint: { fatigue: 41, fitness: 48, form: 7 },
              source: "modeled_from_scheduled_load",
              status: "available",
            },
          },
        },
      })}
    />,
  );

  expect(screen.getByText("Week of May 11")).toBeTruthy();
  expect(screen.getByText(/schedule projects Fitness 48 and Form \+7 at week end/)).toBeTruthy();
});
