import React from "react";
import { createActivityDisplay } from "../../../test/activity-display-fixture";
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
jest.mock("@/components/shared/ActivityCard", () => ({
  ActivityCard: createHost("ActivityCard"),
}));
jest.mock("@/components/shared/GoalCard", () => ({
  GoalCard: ({ goal }: { goal: { id: string; title: string } }) =>
    React.createElement(
      "View",
      { testID: `day-goal-${goal.id}` },
      React.createElement("Text", null, goal.title),
    ),
}));
jest.mock("@/components/shared/PlannedActivityCard", () => ({
  PlannedActivityCard: ({
    plannedActivity,
    testID,
  }: {
    plannedActivity: { title: string };
    testID: string;
  }) =>
    React.createElement(
      "View",
      { testID },
      React.createElement("Text", null, plannedActivity.title),
    ),
}));

const { PlanSelectedDay } = require("./PlanSelectedDay");

const day = {
  completedItems: [
    {
      activityCategory: "run",
      completedLoad: 70,
      completedLoadStatus: "partial",
      date: "2026-04-15",
      id: "activity-1",
      source: "completed_activity",
      title: "Morning run",
    },
  ],
  date: "2026-04-15",
  scheduledItems: [
    {
      activityCategory: "run",
      date: "2026-04-15",
      id: "plan-1",
      plannedLoad: 60,
      plannedLoadStatus: "complete",
      source: "training_plan",
      status: "planned",
      title: "Tempo run",
    },
  ],
};

const baseProps = {
  completedActivities: [createActivityDisplay({ id: "activity-1", title: "Morning run" })],
  completedActivitiesState: "ready" as const,
  goals: [],
  onOpenCompletedActivity: jest.fn(),
  onOpenDayDetails: jest.fn(),
  onOpenGoal: jest.fn(),
  onRetryCompletedActivities: jest.fn(),
  point: {
    date: "2026-04-15",
    effectiveCompletedLoad: 70,
    effectiveCompletedLoadStatus: "partial",
    plannedLoad: 60,
  },
  selectedDate: "2026-04-15",
  todayKey: "2026-04-15",
};

it("shows today’s planned and completed work without treating a partial subtotal as completion", async () => {
  await renderNative(<PlanSelectedDay {...baseProps} day={day} />);

  expect(screen.getByText("Next action: complete today’s planned Load.")).toBeTruthy();
  expect(screen.queryByText(/planned Load is complete/)).toBeNull();
  expect(screen.getByTestId("plan-selected-day-activity-card-activity-1")).toBeTruthy();
  expect(screen.getByTestId("plan-selected-day-planned-activity-card-plan-1")).toBeTruthy();
});

it("opens completed work through the canonical activity card", async () => {
  await renderNative(<PlanSelectedDay {...baseProps} day={day} />);

  await fireEvent.press(screen.getByTestId("plan-selected-day-activity-card-activity-1"));
  expect(baseProps.onOpenCompletedActivity).toHaveBeenCalledWith("activity-1");
});

it("keeps completed work visible as an explicit retry state when card data fails", async () => {
  await renderNative(
    <PlanSelectedDay
      {...baseProps}
      completedActivities={[]}
      completedActivitiesState="error"
      day={day}
    />,
  );

  await fireEvent.press(screen.getByTestId("plan-selected-day-activities-retry"));
  expect(baseProps.onRetryCompletedActivities).toHaveBeenCalledTimes(1);
});

it("keeps compact selected-day previews free of duplicate load metrics", async () => {
  await renderNative(<PlanSelectedDay {...baseProps} day={day} />);

  expect(screen.queryByText("70")).toBeNull();
});

it("does not duplicate fallback load values in the compact preview", async () => {
  await renderNative(
    <PlanSelectedDay
      {...baseProps}
      day={day}
      point={{
        date: "2026-04-15",
        effectiveCompletedLoad: 70,
        effectiveLoadStatus: "partial",
        plannedLoad: 60,
        recommendedLoad: 75,
        recommendedLoadStatus: "partial",
      }}
    />,
  );

  expect(screen.queryByText("75")).toBeNull();
});

it.each([
  ["2026-04-14", true, false],
  ["2026-04-16", false, true],
] as const)("filters selected-day work for %s", async (selectedDate, completed, scheduled) => {
  await renderNative(<PlanSelectedDay {...baseProps} day={day} selectedDate={selectedDate} />);

  expect(Boolean(screen.queryByTestId("plan-selected-day-activity-card-activity-1"))).toBe(
    completed,
  );
  expect(Boolean(screen.queryByTestId("plan-selected-day-planned-activity-card-plan-1"))).toBe(
    scheduled,
  );
});

it("keeps one day-details action beside the selected date without a bottom action row", async () => {
  await renderNative(<PlanSelectedDay {...baseProps} day={null} point={null} />);

  expect(screen.getByText(/Nothing is scheduled or completed/)).toBeTruthy();
  await fireEvent.press(screen.getByTestId("plan-selected-date-training-breakdown"));
  expect(baseProps.onOpenDayDetails).toHaveBeenCalledWith("2026-04-15");
  expect(screen.queryByTestId("plan-selected-date-add")).toBeNull();
  expect(screen.queryByTestId("plan-selected-date-calendar")).toBeNull();
  expect(screen.queryByTestId("plan-selected-day-previous")).toBeNull();
  expect(screen.queryByTestId("plan-selected-day-next")).toBeNull();
  expect(screen.queryByTestId("plan-selected-day-today")).toBeNull();
});
