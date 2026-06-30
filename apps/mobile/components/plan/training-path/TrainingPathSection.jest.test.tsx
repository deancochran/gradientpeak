import React, { useMemo, useState } from "react";

import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { TrainingPathSection } from "./TrainingPathSection";
import type { TrainingPathViewModel } from "./trainingPathTypes";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: mockCreateHost("ActivityIndicator"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CalendarDays: mockCreateHost("CalendarDays"),
  HelpCircle: mockCreateHost("HelpCircle"),
  RotateCcw: mockCreateHost("RotateCcw"),
  Settings: mockCreateHost("Settings"),
  Users: mockCreateHost("Users"),
}));

jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: mockCreateHost("AppFormModal"),
}));

jest.mock("./TrainingPathLegend", () => ({
  __esModule: true,
  TrainingPathLegend: mockCreateHost("TrainingPathLegend"),
}));

jest.mock("./TrainingPathChart", () => ({
  __esModule: true,
  TrainingPathChart: ({
    model,
    onDisplayedWeekChange,
    onScrollInteractionSettled,
    onScrollInteractionStart,
    onSelectedWeekChange,
  }: any) =>
    React.createElement("View", { testID: "training-path-chart" }, [
      React.createElement(
        "TouchableOpacity",
        {
          key: "scroll-start",
          onPress: onScrollInteractionStart,
          testID: "training-path-chart-scroll-start",
        },
        React.createElement("Text", null, "Start scroll"),
      ),
      React.createElement(
        "TouchableOpacity",
        {
          key: "scroll-settled",
          onPress: onScrollInteractionSettled,
          testID: "training-path-chart-scroll-settled",
        },
        React.createElement("Text", null, "Settle scroll"),
      ),
      ...model.weeks.map((week: any) =>
        React.createElement(
          "TouchableOpacity",
          {
            key: week.weekStart,
            onPress: () => onSelectedWeekChange(week.weekStart),
            testID: `training-path-week-${week.weekStart}`,
          },
          React.createElement("Text", null, week.label),
        ),
      ),
      ...model.weeks.map((week: any) =>
        React.createElement(
          "TouchableOpacity",
          {
            key: `display-${week.weekStart}`,
            onPress: () => onDisplayedWeekChange(week.weekStart),
            testID: `training-path-display-week-${week.weekStart}`,
          },
          React.createElement("Text", null, `Display ${week.label}`),
        ),
      ),
    ]),
}));

jest.mock("@/components/plan/GoalListItem", () => ({
  __esModule: true,
  GoalListItem: ({ goal, onPress, testID }: any) =>
    React.createElement(
      "TouchableOpacity",
      { onPress, testID },
      React.createElement("Text", null, goal.title),
    ),
}));

jest.mock("@/components/calendar/CalendarEventCard", () => ({
  __esModule: true,
  CalendarEventCard: ({ event, onPress }: any) =>
    React.createElement(
      "TouchableOpacity",
      { onPress, testID: `calendar-event-card-${event.id}` },
      React.createElement(
        "Text",
        { testID: `calendar-event-card-icon-${event.id}` },
        event.event_type === "planned" && event.activity_plan?.id ? "Zap" : "CalendarDays",
      ),
      React.createElement("Text", null, event.title ?? "Calendar event"),
    ),
}));

jest.mock("@/components/groups/GroupEventCards", () => ({
  __esModule: true,
  GroupEventCard: ({ event, onPress, testID }: any) =>
    React.createElement(
      "TouchableOpacity",
      { onPress, testID },
      React.createElement("Text", null, event.title ?? "Group event"),
    ),
}));

jest.mock("@/components/shared/ActivityCard", () => ({
  __esModule: true,
  ActivityCard: ({ activity, onPress, testID }: any) =>
    React.createElement(
      "TouchableOpacity",
      { onPress, testID },
      React.createElement("Text", null, activity.name ?? "Activity"),
    ),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: ({ activity, activityPlan, onPress, testID }: any) =>
    React.createElement(
      "TouchableOpacity",
      { onPress, testID },
      React.createElement("Text", null, activity?.name ?? activityPlan?.name ?? "Activity plan"),
    ),
}));

jest.mock("@/components/shared/ActivityPlanSummary", () => ({
  __esModule: true,
  ActivityPlanSummary: ({ title }: any) => React.createElement("Text", null, title),
}));

jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: ({ testIDPrefix }: any) =>
    React.createElement(
      "View",
      { testID: testIDPrefix },
      React.createElement("Text", null, "Preview"),
    ),
}));

jest.mock("@/components/shared/ResourceCardPrimitives", () => ({
  __esModule: true,
  ResourceCardShell: ({ children, onPress, testID }: any) =>
    React.createElement("TouchableOpacity", { onPress, testID }, children),
  ResourceOwnerActionRow: ({ actions, categoryLabel, owner, systemName }: any) =>
    React.createElement(
      "View",
      null,
      React.createElement("Text", null, owner?.username ?? systemName),
      React.createElement("Text", null, categoryLabel),
      actions,
    ),
}));

const weekSummaries = {
  "2026-04-06": {
    weekStart: "2026-04-06",
    weekEnd: "2026-04-12",
    dateLabel: "Apr 6 - Apr 12",
    loadDelta: 20,
    headline: "Build week",
    body: "Review the first week.",
    completedLoad: 40,
    plannedLoad: 80,
    tentativePlannedLoad: 0,
    targetLoad: 100,
    fitness: 42,
    targetFitness: 45,
    fitnessGapToIdeal: -3,
    fatigue: 50,
    form: -8,
    freshnessLabel: "Fresh",
  },
  "2026-04-13": {
    weekStart: "2026-04-13",
    weekEnd: "2026-04-19",
    dateLabel: "Apr 13 - Apr 19",
    loadDelta: -10,
    headline: "Group week",
    body: "Review the group event week.",
    completedLoad: 60,
    plannedLoad: 120,
    tentativePlannedLoad: 15,
    targetLoad: 110,
    fitness: 44,
    targetFitness: 46,
    fitnessGapToIdeal: -2,
    fatigue: 54,
    form: -10,
    freshnessLabel: "Moderate",
  },
} satisfies Record<string, TrainingPathViewModel["selectedWeekSummary"]>;

function buildModel(selectedWeekStart: keyof typeof weekSummaries): TrainingPathViewModel {
  return {
    domains: { fitness: [30, 60], load: [0, 180] },
    emptyState: null,
    goalMarkers: [],
    selectedWeekSummary: weekSummaries[selectedWeekStart],
    todayKey: "2026-04-10",
    weeks: Object.values(weekSummaries).map((summary) => ({
      weekStart: summary.weekStart,
      weekEnd: summary.weekEnd,
      label: summary.dateLabel,
      completedLoad: summary.completedLoad,
      plannedLoad: summary.plannedLoad,
      tentativePlannedLoad: summary.tentativePlannedLoad,
      targetLoad: summary.targetLoad,
      fitness: summary.fitness,
      scheduledFitness: summary.fitness,
      targetFitness: summary.targetFitness,
      fatigue: summary.fatigue,
      form: summary.form,
      riskZone: "moderate",
      isCurrent: summary.weekStart === "2026-04-06",
      isSelected: summary.weekStart === selectedWeekStart,
    })),
  };
}

const noop = jest.fn();

function renderSection(overrides: Partial<React.ComponentProps<typeof TrainingPathSection>> = {}) {
  return renderNative(
    <TrainingPathSection
      model={buildModel("2026-04-13")}
      selectedWeekGoals={[]}
      selectedWeekEvents={[]}
      selectedWeekGroupEvents={[]}
      selectedWeekCompletedActivities={[]}
      selectedWeekLoading={false}
      onOpenActivity={noop}
      onOpenGoal={noop}
      onOpenGroupEvent={noop}
      onOpenScheduledEvent={noop}
      onOpenSettings={noop}
      onSelectedWeekChange={noop}
      {...overrides}
    />,
  );
}

describe("TrainingPathSection", () => {
  beforeEach(() => {
    noop.mockClear();
  });

  it("shows the group activity when a user selects the outlined week on the chart", () => {
    function Harness() {
      const [selectedWeekStart, setSelectedWeekStart] =
        useState<keyof typeof weekSummaries>("2026-04-06");
      const model = useMemo(() => buildModel(selectedWeekStart), [selectedWeekStart]);
      const selectedWeekGroupEvents =
        selectedWeekStart === "2026-04-13"
          ? [
              {
                id: "scheduled-group-1",
                title: "Saturday Group Ride",
                date: "2026-04-14",
                groupEvent: { id: "group-event-1", title: "Saturday Group Ride" },
              } as any,
            ]
          : [];

      return (
        <TrainingPathSection
          model={model}
          selectedWeekGoals={[]}
          selectedWeekEvents={[]}
          selectedWeekGroupEvents={selectedWeekGroupEvents}
          selectedWeekCompletedActivities={[]}
          selectedWeekLoading={false}
          onOpenActivity={noop}
          onOpenGoal={noop}
          onOpenGroupEvent={noop}
          onOpenScheduledEvent={noop}
          onOpenSettings={noop}
          onSelectedWeekChange={(weekStart) =>
            setSelectedWeekStart(weekStart as keyof typeof weekSummaries)
          }
        />
      );
    }

    renderNative(<Harness />);

    expect(screen.queryByText("Saturday Group Ride")).toBeNull();
    fireEvent.press(screen.getByTestId("training-path-week-2026-04-13"));

    expect(screen.getByTestId("training-path-week-group-event-scheduled-group-1")).toBeTruthy();
    expect(screen.getByText("Saturday Group Ride")).toBeTruthy();
  });

  it("opens detail screens from week review cards", () => {
    const onOpenActivity = jest.fn();
    const onOpenGoal = jest.fn();
    const onOpenGroupEvent = jest.fn();
    const onOpenScheduledEvent = jest.fn();

    renderSection({
      selectedWeekGoals: [
        {
          id: "goal-1",
          label: "Race goal",
          targetDate: "2026-04-19",
          readinessPercent: 72,
        },
      ],
      selectedWeekEvents: [
        {
          id: "scheduled-event-1",
          title: "Calendar Tempo",
          date: "2026-04-15",
          event: { id: "event-1", title: "Calendar Tempo" } as any,
        },
      ],
      selectedWeekGroupEvents: [
        {
          id: "scheduled-group-1",
          title: "Saturday Group Ride",
          date: "2026-04-14",
          groupEvent: { id: "group-event-1", title: "Saturday Group Ride" } as any,
        },
      ],
      selectedWeekCompletedActivities: [
        {
          id: "activity-1",
          title: "Morning Run",
          date: "2026-04-17",
          activity: { id: "activity-1", name: "Morning Run" } as any,
        },
      ],
      onOpenActivity,
      onOpenGoal,
      onOpenGroupEvent,
      onOpenScheduledEvent,
    });

    fireEvent.press(screen.getByTestId("training-path-week-goal-goal-1"));
    fireEvent.press(screen.getByTestId("training-path-week-group-event-scheduled-group-1"));
    fireEvent.press(screen.getByTestId("calendar-event-card-event-1"));
    fireEvent.press(screen.getByTestId("training-path-week-activity-activity-1"));

    expect(onOpenGoal).toHaveBeenCalledWith("goal-1");
    expect(onOpenGroupEvent).toHaveBeenCalledWith("group-event-1");
    expect(onOpenScheduledEvent).toHaveBeenCalledWith("event-1");
    expect(onOpenActivity).toHaveBeenCalledWith("activity-1");
  });

  it("renders goals, events, group events, and activities in separate sections", () => {
    renderSection({
      selectedWeekGoals: [
        {
          id: "goal-1",
          label: "Race goal",
          targetDate: "2026-04-19",
          readinessPercent: 72,
        },
      ],
      selectedWeekEvents: [
        {
          id: "scheduled-event-1",
          title: "Scheduled event",
          date: "2026-04-15",
          event: { id: "event-1", title: "Scheduled event" } as any,
        },
      ],
      selectedWeekGroupEvents: [
        {
          id: "scheduled-group-1",
          title: "Track Tuesday",
          date: "2026-04-16",
          groupEvent: { id: "group-event-1", title: "Track Tuesday" } as any,
        },
      ],
      selectedWeekCompletedActivities: [
        {
          id: "activity-1",
          title: "Morning Run",
          date: "2026-04-17",
          activity: { id: "activity-1", name: "Morning Run" } as any,
        },
      ],
    });

    expect(screen.getByText("Race goal")).toBeTruthy();
    expect(screen.getByText("Scheduled event")).toBeTruthy();
    expect(screen.getByText("Track Tuesday")).toBeTruthy();
    expect(screen.getByText("Morning Run")).toBeTruthy();
    expect(screen.queryByText("No events this week.")).toBeNull();
    expect(screen.queryByText("No group events this week.")).toBeNull();
    expect(screen.queryByText("No activities this week.")).toBeNull();
  });

  it("renders plan-backed scheduled events as activity plan cards", () => {
    const onOpenScheduledEvent = jest.fn();

    renderSection({
      selectedWeekEvents: [
        {
          id: "scheduled-event-1",
          title: "Marathon Pace Long Run",
          date: "2026-04-15",
          event: {
            id: "event-1",
            title: "Marathon Pace Long Run",
            starts_at: "2026-04-15T14:00:00.000Z",
            owner: { id: "profile-1", username: "Runner", avatar_url: "runner.png" },
            activity_plan: {
              id: "activity-plan-1",
              name: "Marathon Pace Long Run",
              activity_category: "run",
              authoritative_metrics: { estimated_tss: 72 },
            },
          } as any,
        },
      ],
      onOpenScheduledEvent,
    });

    fireEvent.press(screen.getByTestId("training-path-week-event-activity-plan-scheduled-event-1"));

    expect(screen.getByText("Runner")).toBeTruthy();
    expect(screen.getByText("Marathon Pace Long Run")).toBeTruthy();
    expect(screen.queryByTestId("calendar-event-card-event-1")).toBeNull();
    expect(onOpenScheduledEvent).toHaveBeenCalledWith("event-1");
  });

  it("does not show the activity icon for all-day planned rows without an activity plan id", () => {
    renderSection({
      selectedWeekEvents: [
        {
          id: "scheduled-event-1",
          title: "Activity Plan - May 19, 2026 10:53 AM",
          date: "2026-05-19",
          event: {
            id: "event-1",
            event_type: "planned",
            title: "Activity Plan - May 19, 2026 10:53 AM",
            scheduled_date: "2026-05-19",
            all_day: true,
            activity_plan: { activity_category: "run" },
          } as any,
        },
      ],
    });

    expect(screen.getByTestId("calendar-event-card-event-1")).toBeTruthy();
    expect(screen.getByTestId("calendar-event-card-icon-event-1").props.children).toBe(
      "CalendarDays",
    );
    expect(
      screen.queryByTestId("training-path-week-event-activity-plan-scheduled-event-1"),
    ).toBeNull();
  });

  it("renders RSVP-backed group event plans as a single activity plan surface", () => {
    const onOpenGroupEvent = jest.fn();

    renderSection({
      selectedWeekGroupEvents: [
        {
          id: "scheduled-group-1",
          title: "Track Yasso 800s",
          date: "2026-04-16",
          groupEvent: {
            id: "group-event-1",
            title: "Track Yasso 800s",
            group: { id: "group-1", name: "GP Open Long Run Crew", avatar_url: "group.png" },
            starts_at: "2026-04-16T14:00:00.000Z",
            viewerRsvp: { status: "accepted" },
            activityPlanOptions: [],
            selectedActivityPlan: {
              id: "activity-plan-1",
              name: "Track Yasso 800s",
              activity_category: "run",
              authoritative_metrics: { estimated_tss: 81 },
            },
          } as any,
        },
      ],
      onOpenGroupEvent,
    });

    fireEvent.press(
      screen.getByTestId("training-path-week-group-event-activity-plan-scheduled-group-1"),
    );

    expect(
      screen.getByTestId("training-path-week-group-event-activity-plan-scheduled-group-1"),
    ).toBeTruthy();
    expect(screen.queryByTestId("training-path-week-group-event-scheduled-group-1")).toBeNull();
    expect(screen.getByText("GP Open Long Run Crew")).toBeTruthy();
    expect(screen.getAllByText("Track Yasso 800s").length).toBeGreaterThan(0);
    expect(onOpenGroupEvent).toHaveBeenCalledWith("group-event-1");
  });

  it("does not render group event activity plan cards before RSVP", () => {
    renderSection({
      selectedWeekGroupEvents: [
        {
          id: "scheduled-group-1",
          title: "Track Yasso 800s",
          date: "2026-04-16",
          groupEvent: {
            id: "group-event-1",
            title: "Track Yasso 800s",
            starts_at: "2026-04-16T14:00:00.000Z",
            activityPlanOptions: [],
            selectedActivityPlan: {
              id: "activity-plan-1",
              name: "Track Yasso 800s",
              activity_category: "run",
              authoritative_metrics: { estimated_tss: 81 },
            },
          } as any,
        },
      ],
    });

    expect(screen.getByTestId("training-path-week-group-event-scheduled-group-1")).toBeTruthy();
    expect(
      screen.queryByTestId("training-path-week-group-event-activity-plan-scheduled-group-1"),
    ).toBeNull();
  });

  it("shows a stable loading state while a selected week is settling or refetching", () => {
    renderSection({ selectedWeekLoading: true });

    expect(screen.getByTestId("training-path-week-summary-loading")).toBeTruthy();
    expect(screen.getByTestId("training-path-week-summary-loading-indicator")).toBeTruthy();
    expect(screen.getByText("Loading goals.")).toBeTruthy();
    expect(screen.getByText("Loading events.")).toBeTruthy();
    expect(screen.getByText("Loading group events.")).toBeTruthy();
    expect(screen.getByText("Loading activities.")).toBeTruthy();
    expect(screen.queryByText("GOALS THIS WEEK")).toBeNull();
  });

  it("shows loading as soon as scrolling starts without selecting a new week", () => {
    const onSelectedWeekChange = jest.fn();
    const onWeekScrollStart = jest.fn();

    renderSection({ onSelectedWeekChange, onWeekScrollStart });

    expect(screen.queryByTestId("training-path-week-summary-loading")).toBeNull();
    fireEvent.press(screen.getByTestId("training-path-chart-scroll-start"));
    fireEvent.press(screen.getByTestId("training-path-display-week-2026-04-06"));

    expect(screen.getByTestId("training-path-week-summary-loading")).toBeTruthy();
    expect(screen.getAllByText("Apr 6 - Apr 12").length).toBeGreaterThan(0);
    expect(onWeekScrollStart).toHaveBeenCalledTimes(1);
    expect(onSelectedWeekChange).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("training-path-chart-scroll-settled"));

    expect(screen.queryByTestId("training-path-week-summary-loading")).toBeNull();
    expect(onSelectedWeekChange).not.toHaveBeenCalled();
  });

  it("starts progress immediately when tapping a week before loaded data catches up", () => {
    const onSelectedWeekChange = jest.fn();
    const onWeekScrollStart = jest.fn();

    renderSection({
      model: buildModel("2026-04-06"),
      onSelectedWeekChange,
      onWeekScrollStart,
    });

    fireEvent.press(screen.getByTestId("training-path-week-2026-04-13"));

    expect(screen.getByTestId("training-path-week-summary-loading")).toBeTruthy();
    expect(screen.getByTestId("training-path-week-summary-loading-indicator")).toBeTruthy();
    expect(screen.getAllByText("Apr 13 - Apr 19").length).toBeGreaterThan(0);
    expect(onWeekScrollStart).toHaveBeenCalledTimes(1);
    expect(onSelectedWeekChange).toHaveBeenCalledWith("2026-04-13");
  });

  it("lets scrolling dictate the displayed week while loaded data stays uncommitted", () => {
    const onSelectedWeekChange = jest.fn();

    renderSection({ onSelectedWeekChange });

    fireEvent.press(screen.getByTestId("training-path-chart-scroll-start"));
    fireEvent.press(screen.getByTestId("training-path-display-week-2026-04-06"));
    fireEvent.press(screen.getByTestId("training-path-display-week-2026-04-13"));

    expect(screen.getByTestId("training-path-week-summary-loading")).toBeTruthy();
    expect(screen.getAllByText("Apr 13 - Apr 19").length).toBeGreaterThan(0);
    expect(onSelectedWeekChange).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("training-path-week-2026-04-13"));

    expect(onSelectedWeekChange).toHaveBeenCalledWith("2026-04-13");
  });
});
