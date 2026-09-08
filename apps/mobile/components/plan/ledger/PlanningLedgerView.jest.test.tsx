import type { PlanningLedger } from "@repo/core";
import type { ReactNode } from "react";
import React from "react";
import { createActivityDisplay } from "../../../test/activity-display-fixture";
import { createHost, type HostProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import type { TrainingComposition } from "./planningLedgerPresentation";

const openEntryMock = jest.fn();
const complete = (value: number) => ({ status: "complete" as const, value });
const partial = (value: number) => ({ status: "partial" as const, value });
const unavailable = { status: "unavailable" as const, value: null };
const dailyBreakdown: PlanningLedger["dailyBreakdown"] = Array.from({ length: 7 }, (_, index) => {
  const day = 13 + index;
  return {
    completed: index === 0 ? partial(20) : complete(index * 5),
    contributingDurationSeconds: partial(1800 + index * 300),
    date: `2026-04-${day}`,
    effective: complete(30 + index * 5),
    intensity: partial(0.6 + index * 0.02),
    planned: index === 0 ? partial(20) : complete(20 + index * 5),
    remaining: complete(10),
  };
});
const intensityBands: PlanningLedger["intensityDistribution"]["bands"] = [
  {
    band: "recovery",
    minimumIntensity: 0,
    maximumIntensity: 0.55,
    durationSeconds: 0,
    percentage: 0,
  },
  {
    band: "endurance",
    minimumIntensity: 0.55,
    maximumIntensity: 0.75,
    durationSeconds: 2400,
    percentage: 66.67,
  },
  {
    band: "tempo",
    minimumIntensity: 0.75,
    maximumIntensity: 0.85,
    durationSeconds: 1200,
    percentage: 33.33,
  },
  {
    band: "threshold",
    minimumIntensity: 0.85,
    maximumIntensity: 0.95,
    durationSeconds: 0,
    percentage: 0,
  },
  {
    band: "vo2max",
    minimumIntensity: 0.95,
    maximumIntensity: 1.05,
    durationSeconds: 0,
    percentage: 0,
  },
  {
    band: "anaerobic",
    minimumIntensity: 1.05,
    maximumIntensity: 1.15,
    durationSeconds: 0,
    percentage: 0,
  },
  {
    band: "neuromuscular",
    minimumIntensity: 1.15,
    maximumIntensity: 1.5,
    durationSeconds: 0,
    percentage: 0,
  },
];
const ledgerFixture: PlanningLedger = {
  anchorDate: "2026-04-13",
  asOf: "2026-04-13T12:00:00.000Z",
  contractVersion: "planning-ledger-v3",
  contributingDurationSeconds: partial(3600),
  dailyBreakdown,
  entries: [
    {
      contributingDurationSeconds: unavailable,
      date: "2026-04-13",
      id: "event-1",
      intensity: unavailable,
      kind: "event",
      load: unavailable,
      navigation: { id: "event-1", target: "event" },
      startsAt: "2026-04-13T18:00:00.000Z",
      status: "scheduled",
      title: "Track session",
    },
    {
      contributingDurationSeconds: partial(2700),
      date: "2026-04-14",
      id: "planned-1",
      intensity: partial(0.75),
      kind: "planned",
      load: partial(45),
      navigation: { id: "planned-1", target: "event" },
      startsAt: null,
      status: "Planned",
      title: "Tempo Builder",
    },
    {
      contributingDurationSeconds: partial(1800),
      date: "2026-04-15",
      id: "activity-1",
      intensity: partial(0.7),
      kind: "completed",
      load: partial(30),
      navigation: { id: "activity-1", target: "activity" },
      startsAt: "2026-04-15T08:00:00.000Z",
      status: "Completed",
      title: "Morning run",
    },
  ],
  entriesTruncated: false,
  intensity: partial(0.7),
  intensityDistribution: {
    bands: intensityBands,
    contributingDurationSeconds: 3600,
    status: "partial",
  },
  load: {
    completed: partial(20),
    effective: partial(50),
    planned: partial(40),
    remaining: partial(10),
  },
  milestones: [],
  modelContext: {
    algorithmVersion: "athlete-state-v1",
    commonLoadModel: "gradientpeak_relative_load",
    commonLoadVersion: "1",
    publishedRevision: 7,
  },
  period: "week",
  periodEnd: "2026-04-19",
  periodStart: "2026-04-13",
  planningTimezone: "America/Los_Angeles",
  sourceCoverage: {
    activities: { endDate: "2026-04-19", startDate: "2026-04-13", status: "partial" },
    calendarEvents: { endDate: "2026-04-19", startDate: "2026-04-13", status: "partial" },
    groupEvents: { endDate: "2026-04-19", startDate: "2026-04-13", status: "complete" },
    scheduledItems: { endDate: "2026-04-19", startDate: "2026-04-13", status: "partial" },
  },
  trainingState: {
    actual: {
      fatigue: { observedOn: "2026-04-13", source: "actual", status: "available", value: 30 },
      fitness: { observedOn: "2026-04-13", source: "actual", status: "available", value: 42 },
    },
    planned: {
      fatigue: {
        observedOn: "2026-04-19",
        source: "scheduled_projection",
        status: "available",
        value: 32,
      },
      fitness: {
        observedOn: "2026-04-19",
        source: "scheduled_projection",
        status: "available",
        value: 44,
      },
    },
    series: Array.from({ length: 7 }, (_, index) => ({
      actual: { fatigue: 30 + index, fitness: 42 + index, form: 12 },
      date: `2026-04-${13 + index}`,
      planned: null,
    })),
  },
};

const trainingCompositionFixture: TrainingComposition = {
  comparison: {
    actual: {
      activeDays: complete(1),
      categories: [],
      coverage: "complete",
      sessions: complete(1),
    },
    planned: {
      activeDays: complete(0),
      categories: [],
      coverage: "complete",
      sessions: complete(0),
    },
  },
  selected: {
    actual: {
      activeDays: partial(2),
      categories: [
        {
          activeDays: partial(2),
          activityCategory: "run",
          distanceMeters: partial(15_200),
          durationSeconds: partial(5400),
          elevationGainMeters: partial(320),
          load: partial(72),
          longestSessionDurationSeconds: partial(3600),
          sessions: partial(2),
        },
      ],
      coverage: "partial",
      sessions: partial(2),
    },
    planned: {
      activeDays: partial(1),
      categories: [
        {
          activeDays: partial(1),
          activityCategory: "run",
          distanceMeters: unavailable,
          durationSeconds: partial(2700),
          elevationGainMeters: unavailable,
          load: partial(40),
          longestSessionDurationSeconds: partial(2700),
          sessions: partial(1),
        },
      ],
      coverage: "partial",
      sessions: partial(1),
    },
  },
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/shared/ActivityCard", () => ({ ActivityCard: createHost("ActivityCard") }));
jest.mock("@/components/shared/GoalCard", () => ({ GoalCard: createHost("GoalCard") }));
jest.mock("@/components/shared/PlannedActivityCard", () => ({
  PlannedActivityCard: createHost("PlannedActivityCard"),
}));
jest.mock("@/components/shared/ResourceCardPrimitives", () => ({
  ResourceCardHeader: createHost("ResourceCardHeader"),
  ResourceCardShell: createHost("ResourceCardShell"),
  ResourceMetricsRow: createHost("ResourceMetricsRow"),
}));
jest.mock("@/components/shared/PointInTimeDetailsSheet", () => ({
  PointInTimeDetailsSheet: ({
    children,
    visible,
    ...props
  }: HostProps & { children: ReactNode; visible: boolean }) =>
    visible ? React.createElement("PointInTimeDetailsSheet", props, children) : null,
}));
jest.mock("@/lib/stores/theme-store", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
jest.mock("victory-native", () => {
  const BarGroup = ({ children, ...props }: HostProps) =>
    React.createElement("BarGroup", props, children);
  BarGroup.Bar = (props: HostProps) => React.createElement("BarGroupBar", props);
  return {
    BarGroup,
    CartesianChart: ({
      children,
      data,
      ...props
    }: HostProps & { children: (context: HostProps) => ReactNode; data: unknown[] }) =>
      React.createElement(
        "CartesianChart",
        { ...props, data },
        children({
          chartBounds: { bottom: 100, left: 0, right: 100, top: 0 },
          points: {
            actualFatigue: data,
            actualFitness: data,
            actualForm: data,
            completed: data,
            planned: data,
            projectedFatigue: data,
            projectedFitness: data,
            projectedForm: data,
          },
        }),
      ),
    Line: (props: HostProps) => React.createElement("Line", props),
    Pie: { Chart: createHost("PieChart") },
    PolarChart: createHost("PolarChart"),
  };
});
jest.mock("lucide-react-native", () => ({
  CalendarDays: createHost("CalendarDays"),
  Dumbbell: createHost("Dumbbell"),
  Info: createHost("Info"),
  Minus: createHost("Minus"),
  TrendingDown: createHost("TrendingDown"),
  TrendingUp: createHost("TrendingUp"),
  UsersRound: createHost("UsersRound"),
}));

const PlanningLedgerView = require("./PlanningLedgerView").PlanningLedgerView;

beforeEach(() => openEntryMock.mockClear());

it("renders a visual-first weekly breakdown and normal numeric partial values", async () => {
  await renderNative(
    <PlanningLedgerView
      completedActivities={[]}
      ledger={ledgerFixture}
      onOpenEntry={openEntryMock}
      trainingComposition={trainingCompositionFixture}
    />,
  );

  expect(screen.getByTestId("planning-ledger-load-hero")).toBeTruthy();
  expect(screen.getByTestId("planning-ledger-weekly-chart")).toBeTruthy();
  expect(screen.getByTestId("planning-ledger-consistency-strip")).toBeTruthy();
  expect(screen.getByTestId("planning-ledger-state-chart")).toBeTruthy();
  expect(screen.getByTestId("training-composition-duration-donut")).toBeTruthy();
  expect(screen.getByTestId("planning-ledger-intensity-distribution")).toBeTruthy();
  expect(screen.getAllByText("20").length).toBeGreaterThan(0);
  expect(screen.queryByText(/~/)).toBeNull();
  expect(screen.queryByText(/partial|incomplete/i)).toBeNull();
  expect(screen.queryByTestId("planning-ledger-data-details")).toBeNull();
  await fireEvent.press(screen.getByTestId("planning-ledger-data-details-trigger"));
  expect(screen.getByTestId("planning-ledger-data-details")).toBeTruthy();
  expect(screen.getByText("Source windows")).toBeTruthy();
});

it("uses the selected day for the value tray and entry filtering", async () => {
  await renderNative(
    <PlanningLedgerView
      completedActivities={[createActivityDisplay({ id: "activity-1", title: "Morning run" })]}
      ledger={ledgerFixture}
      onOpenEntry={openEntryMock}
      trainingComposition={trainingCompositionFixture}
    />,
  );

  expect(screen.getByTestId("planning-ledger-entry-event-event-1")).toBeTruthy();
  expect(screen.queryByTestId("planning-ledger-entry-planned-planned-1")).toBeNull();
  await fireEvent.press(screen.getByTestId("planning-ledger-day-2026-04-14"));
  expect(screen.getByTestId("planning-ledger-day-2026-04-14").props.accessibilityState).toEqual({
    selected: true,
  });
  expect(
    screen.getByTestId("planning-ledger-selected-day-values").props.accessibilityLabel,
  ).toContain("Day: Apr 14, 2026");
  const plannedCard = screen.getByTestId("planning-ledger-entry-planned-planned-1");
  expect(plannedCard.props.plannedActivity.metrics).toEqual(
    expect.arrayContaining([expect.objectContaining({ status: "available", value: 45 })]),
  );
  await fireEvent.press(plannedCard);
  expect(openEntryMock).toHaveBeenCalledWith({ id: "planned-1", target: "event" });
});

it("keeps an unhydrated completed ledger entry visible and tappable", async () => {
  await renderNative(
    <PlanningLedgerView
      completedActivities={[]}
      ledger={ledgerFixture}
      onOpenEntry={openEntryMock}
      trainingComposition={trainingCompositionFixture}
    />,
  );

  await fireEvent.press(screen.getByTestId("planning-ledger-day-2026-04-15"));
  const completedFallback = screen.getByTestId("planning-ledger-entry-completed-activity-1");
  expect(completedFallback).toBeTruthy();
  await fireEvent.press(completedFallback);
  expect(openEntryMock).toHaveBeenCalledWith({ id: "activity-1", target: "activity" });
});

it("renders the daily load, state, duration, intensity, and activity flow without weekly controls", async () => {
  await renderNative(
    <PlanningLedgerView
      completedActivities={[]}
      ledger={{
        ...ledgerFixture,
        dailyBreakdown: [],
        period: "day",
        periodEnd: "2026-04-13",
        periodStart: "2026-04-13",
      }}
      onOpenEntry={openEntryMock}
      trainingComposition={trainingCompositionFixture}
    />,
  );

  expect(screen.getByText("Daily training breakdown")).toBeTruthy();
  expect(screen.getByTestId("planning-ledger-load-hero")).toBeTruthy();
  expect(screen.getByTestId("planning-ledger-training-state")).toBeTruthy();
  expect(screen.getByTestId("planning-ledger-training-composition")).toBeTruthy();
  expect(screen.getByTestId("planning-ledger-intensity-distribution")).toBeTruthy();
  expect(screen.getByTestId("planning-ledger-entries")).toBeTruthy();
  expect(screen.queryByTestId("planning-ledger-weekly-chart")).toBeNull();
});
