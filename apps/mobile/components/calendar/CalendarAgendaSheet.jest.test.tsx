import { fireEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";

const dayQueryMock = jest.fn();
const ledgerQueryMock = jest.fn();
const refetchMock = jest.fn(async () => undefined);

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/ActivityCard", () => ({
  __esModule: true,
  ActivityCard: (props: Record<string, unknown>) => createHost("ActivityCard")(props),
}));
jest.mock("@/components/shared/PlannedActivityCard", () => ({
  __esModule: true,
  PlannedActivityCard: (props: Record<string, unknown>) => createHost("PlannedActivityCard")(props),
}));
jest.mock("@/components/shared/GoalCard", () => ({
  __esModule: true,
  GoalCard: (props: Record<string, unknown>) => createHost("GoalCard")(props),
}));
jest.mock("@/components/shared/PointInTimeDetailsSheet", () => ({
  __esModule: true,
  PointInTimeDetailsSheet: ({
    children,
    visible,
    ...props
  }: {
    children: ReactNode;
    visible: boolean;
  }) => (visible ? createHost("PointInTimeDetailsSheet")({ ...props, children }) : null),
}));
jest.mock("@/components/plan/ledger/PlanningLedgerView", () => ({
  __esModule: true,
  PlanningLedgerPerformanceInsights: () =>
    createHost("PlanningLedgerPerformanceInsights")({
      testID: "planning-ledger-performance-insights",
    }),
}));
jest.mock("./CalendarTimelineRows", () => ({
  __esModule: true,
  CalendarScheduleObjectCard: ({ object }: { object: { id: string; title: string } }) =>
    createHost("CalendarScheduleObjectCard")({
      testID: `calendar-agenda-event-row-${object.id}`,
      children: object.title,
    }),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    calendar: {
      day: { useQuery: (input: unknown, options: unknown) => dayQueryMock(input, options) },
    },
    trainingPlans: {
      getPlanningLedger: {
        useQuery: (input: unknown, options: unknown) => ledgerQueryMock(input, options),
      },
    },
  },
}));

const CalendarAgendaSheet = require("./CalendarAgendaSheet").CalendarAgendaSheet;
const scheduledItem = {
  id: "event-1",
  kind: "event",
  title: "Track session",
};

function renderSheet(onOpenItem = jest.fn()) {
  return renderNative(
    <CalendarAgendaSheet
      dateKey="2026-04-15"
      onClose={jest.fn()}
      onCreateEvent={jest.fn()}
      onOpenItem={onOpenItem}
      visible
    />,
  );
}

describe("CalendarAgendaSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dayQueryMock.mockReturnValue({
      data: { projection: { items: [scheduledItem] } },
      isError: false,
      isLoading: false,
      refetch: refetchMock,
    });
    ledgerQueryMock.mockReturnValue({
      data: { entries: [{ id: "duplicate", title: "Track session" }] },
      isError: false,
      isLoading: false,
      refetch: refetchMock,
    });
  });

  it("combines performance insights and the canonical day schedule", () => {
    renderSheet();

    expect(dayQueryMock).toHaveBeenCalledWith(
      { date: "2026-04-15" },
      expect.objectContaining({ enabled: true }),
    );
    expect(ledgerQueryMock).toHaveBeenCalledWith(
      { anchorDate: "2026-04-15", period: "day" },
      { enabled: true },
    );
    expect(screen.getByTestId("planning-ledger-performance-insights")).toBeTruthy();
    expect(screen.getByTestId("calendar-agenda-event-row-event-1").props.children).toBe(
      "Track session",
    );
  });

  it("keeps the schedule visible when performance insights fail", () => {
    ledgerQueryMock.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch: refetchMock,
    });
    renderSheet();

    expect(screen.getByTestId("calendar-day-insights-error")).toBeTruthy();
    expect(screen.getByTestId("calendar-agenda-event-row-event-1")).toBeTruthy();
  });

  it("keeps performance insights visible when the schedule fails", () => {
    dayQueryMock.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch: refetchMock,
    });
    renderSheet();

    expect(screen.getByTestId("planning-ledger-performance-insights")).toBeTruthy();
    expect(screen.getByTestId("calendar-agenda-error")).toBeTruthy();
  });

  it("uses canonical cards for completed activities, planned activities, and goals", () => {
    const onOpenItem = jest.fn();
    const completedActivity = {
      id: "activity-1",
      kind: "completed_activity",
      title: "Completed run",
      activity: {
        id: "activity-1",
        metrics: [
          {
            key: "common_load",
            label: "Load",
            status: "available",
            value: 52,
            unit: "score",
            reason: null,
          },
        ],
      },
    };
    const plannedActivity = {
      id: "planned-1",
      kind: "planned_activity",
      title: "Planned run",
      metrics: [
        {
          key: "normalized_intensity",
          label: "Intensity",
          status: "unavailable",
          value: null,
          unit: "ratio",
          reason: "quantification_unavailable",
        },
      ],
      plan: null,
    };
    const goal = {
      id: "goal-1",
      kind: "goal",
      title: "Race day",
      calendarDate: "2026-04-15",
      goal: { objectiveSummary: "Finish", typeLabel: "Race" },
    };
    dayQueryMock.mockReturnValue({
      data: {
        projection: {
          items: [completedActivity, plannedActivity, goal, scheduledItem],
        },
      },
      isError: false,
      isLoading: false,
      refetch: refetchMock,
    });

    renderSheet(onOpenItem);

    const activityCard = screen.getByTestId("calendar-agenda-activity-card-activity-1");
    const plannedActivityCard = screen.getByTestId(
      "calendar-agenda-planned-activity-card-planned-1",
    );
    const goalCard = screen.getByTestId("calendar-agenda-goal-card-goal-1");
    expect(activityCard.props.activity).toBe(completedActivity.activity);
    expect(activityCard.props.activity.metrics[0]).toMatchObject({
      key: "common_load",
      value: 52,
    });
    expect(activityCard.props.dateMode).toBeUndefined();
    expect(plannedActivityCard.props.plannedActivity).toBe(plannedActivity);
    expect(plannedActivityCard.props.plannedActivity.metrics[0]).toMatchObject({
      key: "normalized_intensity",
      status: "unavailable",
      value: null,
    });
    expect(plannedActivityCard.props.variant).toBeUndefined();
    expect(goalCard.props.goal).toEqual({
      id: "goal-1",
      objectiveSummary: "Finish",
      targetDate: "2026-04-15",
      title: "Race day",
      typeLabel: "Race",
    });
    expect(goalCard.props.variant).toBeUndefined();
    expect(screen.getByTestId("calendar-agenda-event-row-event-1")).toBeTruthy();
    fireEvent.press(activityCard);
    fireEvent.press(plannedActivityCard);
    fireEvent.press(goalCard);
    expect(onOpenItem).toHaveBeenNthCalledWith(1, completedActivity);
    expect(onOpenItem).toHaveBeenNthCalledWith(2, plannedActivity);
    expect(onOpenItem).toHaveBeenNthCalledWith(3, goal);
  });
});
