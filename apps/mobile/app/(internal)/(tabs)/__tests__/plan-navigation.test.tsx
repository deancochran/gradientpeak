import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import PlanScreenWithErrorBoundary from "../plan";

const {
  pushMock,
  replaceMock,
  localSearchParamsMock,
  alertMock,
  deleteMutateMock,
  updateMutateMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  localSearchParamsMock: {} as Record<string, string | string[] | undefined>,
  alertMock: vi.fn(),
  deleteMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
}));

const trainingPlanState = vi.hoisted(() => ({
  plan: {
    id: "plan-1",
    name: "Plan Alpha",
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    structure: {},
  } as any,
}));

const eventsState = vi.hoisted(() => ({
  items: [] as any[],
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => ({
  Alert: { alert: alertMock },
  ActivityIndicator: createHost("ActivityIndicator"),
  Modal: createHost("Modal"),
  PanResponder: {
    create: (config: any) => ({
      panHandlers: {
        onMoveShouldSetResponder: config.onMoveShouldSetPanResponder,
        onStartShouldSetResponder: config.onStartShouldSetPanResponder,
        onResponderGrant: config.onPanResponderGrant,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
        onResponderTerminate: config.onPanResponderTerminate,
        onResponderTerminationRequest: config.onPanResponderTerminationRequest,
      },
    }),
  },
  Pressable: createHost("Pressable"),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("react-native-calendars", () => ({
  Calendar: createHost("Calendar"),
}));

vi.mock("@react-native-community/datetimepicker", () => ({
  default: createHost("DateTimePicker"),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: vi.fn(),
}));

vi.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light" }),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useLocalSearchParams: () => localSearchParamsMock,
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

vi.mock("@/components/plan/GhostCard", () => ({
  GhostCard: createHost("GhostCard"),
}));

vi.mock("@/components/ScheduleActivityModal", () => ({
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

vi.mock("@/components/shared", () => ({
  AppHeader: createHost("AppHeader"),
  PlanCalendarSkeleton: createHost("PlanCalendarSkeleton"),
}));

vi.mock("@/components/shared/ActivityPlanCard", () => ({
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

vi.mock("@/components/home/FitnessProgressCard", () => ({
  FitnessProgressCard: createHost("FitnessProgressCard"),
}));

vi.mock("@/components/shared/DetailChartModal", () => ({
  DetailChartModal: ({ children }: any) =>
    React.createElement(
      "DetailChartModal",
      {},
      typeof children === "function" ? children("30d") : children,
    ),
}));

vi.mock("@/components/charts/PlanVsActualChart", () => ({
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));

vi.mock("@/components/charts/TrainingLoadChart", () => ({
  TrainingLoadChart: createHost("TrainingLoadChart"),
}));

vi.mock("@/components/plan/PlanAdherenceMiniChart", () => ({
  PlanAdherenceMiniChart: createHost("PlanAdherenceMiniChart"),
}));

vi.mock("@/components/plan/PlanCapabilityMiniChart", () => ({
  PlanCapabilityMiniChart: createHost("PlanCapabilityMiniChart"),
}));

vi.mock("@/components/plan/PlanStatusSummaryCard", () => ({
  PlanStatusSummaryCard: createHost("PlanStatusSummaryCard"),
}));

vi.mock("@/components/training-plan/QuickAdjustSheet", () => ({
  QuickAdjustSheet: (props: any) =>
    React.createElement("QuickAdjustSheet", props),
}));

vi.mock("@/components/ui/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@/components/ui/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@/components/ui/input", () => ({
  Input: createHost("Input"),
}));

vi.mock("@/components/ui/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: createHost("Textarea"),
}));

vi.mock("@/lib/stores/activitySelectionStore", () => ({
  activitySelectionStore: { setSelection: vi.fn() },
}));

vi.mock("@/lib/utils/plan/dateGrouping", () => ({
  isActivityCompleted: () => false,
}));

vi.mock("@/lib/hooks/useSmartSuggestions", () => ({
  useSmartSuggestions: () => null,
}));

vi.mock("lucide-react-native", () => {
  const Icon = createHost("LucideIcon");
  return {
    CalendarDays: Icon,
    Clock3: Icon,
    Plus: Icon,
    Pencil: Icon,
    Play: Icon,
    Settings: Icon,
  };
});

vi.mock("@/lib/trpc", () => {
  const queryResult = (data: any, extras: Record<string, any> = {}) => ({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extras,
  });

  return {
    trpc: {
      useUtils: () => ({
        events: { invalidate: vi.fn() },
        trainingPlans: { invalidate: vi.fn() },
      }),
      trainingPlans: {
        get: {
          useQuery: () => queryResult(trainingPlanState.plan),
        },
        getActivePlan: {
          useQuery: () => ({ data: trainingPlanState.plan }),
        },
        activate: {
          useMutation: () => ({ mutateAsync: vi.fn() }),
        },
        getCurrentStatus: {
          useQuery: () =>
            queryResult({
              ctl: 42,
              weekProgress: {
                totalPlannedActivities: 4,
                completedActivities: 2,
              },
            }),
        },
        getInsightTimeline: {
          useQuery: () =>
            queryResult({
              timeline: [],
              projection: { at_goal_date: { confidence: null } },
              capability: null,
            }),
        },
        getWeeklySummary: {
          useQuery: () => queryResult([]),
        },
        getActualCurve: {
          useQuery: () => queryResult({ dataPoints: [] }),
        },
        getIdealCurve: {
          useQuery: () => queryResult({ dataPoints: [] }),
        },
      },
      events: {
        list: {
          useQuery: () => queryResult({ items: eventsState.items }),
        },
        delete: {
          useMutation: () => ({
            mutate: deleteMutateMock,
            isPending: false,
          }),
        },
        create: {
          useMutation: () => ({
            mutate: vi.fn(),
            isPending: false,
            error: null,
          }),
        },
        update: {
          useMutation: () => ({
            mutate: updateMutateMock,
            isPending: false,
          }),
        },
      },
      activities: {
        list: {
          useQuery: () => queryResult([]),
        },
      },
    },
  };
});

const getNodeText = (children: any): string => {
  if (typeof children === "string") {
    return children;
  }

  if (typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map((child) => getNodeText(child)).join("");
  }

  if (children?.props?.children !== undefined) {
    return getNodeText(children.props.children);
  }

  return "";
};

const findTouchableByText = (
  renderer: TestRenderer.ReactTestRenderer,
  text: string,
) =>
  renderer.root.find((node: any) => {
    if (
      node.type !== "TouchableOpacity" ||
      typeof node.props.onPress !== "function"
    ) {
      return false;
    }

    return (
      node.findAll((child: any) => getNodeText(child.props?.children) === text)
        .length > 0
    );
  });

const hasTextContaining = (
  renderer: TestRenderer.ReactTestRenderer,
  text: string,
) =>
  renderer.root.findAll((node: any) => {
    if (node.type !== "Text") {
      return false;
    }

    return getNodeText(node.props?.children).includes(text);
  }).length > 0;

const countNodesByType = (
  renderer: TestRenderer.ReactTestRenderer,
  type: string,
) => renderer.root.findAll((node: any) => node.type === type).length;

const findNodeByTestId = (
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
) => renderer.root.find((node: any) => node.props?.testID === testID);

const getAlertButtons = (callIndex: number) =>
  (alertMock.mock.calls[callIndex]?.[2] as any[]) ?? [];

const pressAlertButton = (callIndex: number, text: string) => {
  const buttons = getAlertButtons(callIndex);
  const button = buttons.find((item: any) => item.text === text);
  button?.onPress?.();
};

const dragAndDropWithResponder = (
  node: any,
  gesture: { dx: number; dy: number },
) => {
  const shouldSet = node.props.onMoveShouldSetResponder?.({}, gesture);
  expect(shouldSet).toBe(true);

  node.props.onResponderGrant?.({}, { dx: 0, dy: 0 });
  node.props.onResponderMove?.({}, gesture);
  node.props.onResponderRelease?.({}, gesture);
};

describe("Plan tab CTA routing", () => {
  it("prompts recurring scope on planned edit and passes selected scope", () => {
    alertMock.mockReset();
    eventsState.items = [
      {
        id: "event-planned-recurring-1",
        event_type: "planned",
        title: "Long Run",
        status: "scheduled",
        scheduled_date: new Date().toISOString().split("T")[0],
        activity_plan: {
          id: "activity-plan-1",
          name: "Long Run Plan",
          activity_category: "outdoor_run",
        },
        series_id: "series-1",
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const plannedCard = renderer.root.find((node: any) => {
      return (
        node.type === "ActivityPlanCard" &&
        node.props?.plannedActivity?.id === "event-planned-recurring-1"
      );
    });

    act(() => {
      plannedCard.props.onPress();
    });

    const editButton = findNodeByTestId(renderer, "event-action-edit");
    act(() => {
      editButton.props.onPress();
    });

    expect(alertMock).toHaveBeenCalledWith(
      "Edit Recurring Event",
      "Choose how much of this series to edit.",
      expect.any(Array),
    );

    act(() => {
      pressAlertButton(0, "This and future events");
    });

    const editModal = renderer.root.find((node: any) => {
      return (
        node.type === "ScheduleActivityModal" &&
        node.props?.eventId === "event-planned-recurring-1"
      );
    });

    expect(editModal.props.editScope).toBe("future");
  });

  it("prompts recurring scope before delete confirmation and deletes scoped", () => {
    alertMock.mockReset();
    deleteMutateMock.mockReset();
    const today = new Date().toISOString().split("T")[0]!;
    eventsState.items = [
      {
        id: "event-custom-recurring-1",
        event_type: "custom",
        title: "Mobility Session",
        status: "scheduled",
        notes: "Foam roll and stretch",
        scheduled_date: today,
        starts_at: `${today}T07:00:00.000Z`,
        all_day: false,
        recurrence_rule: "FREQ=WEEKLY",
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const eventCard = findNodeByTestId(
      renderer,
      "event-card-event-custom-recurring-1",
    );
    act(() => {
      eventCard.props.onPress();
    });

    const deleteButton = findNodeByTestId(renderer, "event-action-delete");
    act(() => {
      deleteButton.props.onPress();
    });

    expect(alertMock).toHaveBeenNthCalledWith(
      1,
      "Delete Recurring Event",
      "Choose how much of this series to delete.",
      expect.any(Array),
    );

    act(() => {
      pressAlertButton(0, "This and future events");
    });

    expect(alertMock).toHaveBeenNthCalledWith(
      2,
      "Delete Event",
      "Are you sure you want to delete this event?",
      expect.any(Array),
    );

    act(() => {
      pressAlertButton(1, "Delete");
    });

    expect(deleteMutateMock).toHaveBeenCalledWith({
      id: "event-custom-recurring-1",
      scope: "future",
    });
  });

  it("keeps non-recurring delete confirmation behavior unchanged", () => {
    alertMock.mockReset();
    deleteMutateMock.mockReset();
    const today = new Date().toISOString().split("T")[0]!;
    eventsState.items = [
      {
        id: "event-custom-plain-1",
        event_type: "custom",
        title: "Strength Session",
        status: "scheduled",
        scheduled_date: today,
        starts_at: `${today}T18:00:00.000Z`,
        all_day: false,
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const eventCard = findNodeByTestId(
      renderer,
      "event-card-event-custom-plain-1",
    );
    act(() => {
      eventCard.props.onPress();
    });

    const deleteButton = findNodeByTestId(renderer, "event-action-delete");
    act(() => {
      deleteButton.props.onPress();
    });

    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock).toHaveBeenCalledWith(
      "Delete Event",
      "Are you sure you want to delete this event?",
      expect.any(Array),
    );

    act(() => {
      pressAlertButton(0, "Delete");
    });

    expect(deleteMutateMock).toHaveBeenCalledWith({
      id: "event-custom-plain-1",
    });
  });

  it("routes full-plan intent and keeps execution-only controls", () => {
    pushMock.mockReset();
    eventsState.items = [];
    trainingPlanState.plan = {
      id: "plan-1",
      name: "Plan Alpha",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    };
    Object.keys(localSearchParamsMock).forEach((key) => {
      delete localSearchParamsMock[key];
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    expect(hasTextContaining(renderer, "Quick Adjust")).toBe(false);

    const openFullPlanButton = findTouchableByText(renderer, "Open Full Plan");
    act(() => {
      openFullPlanButton.props.onPress();
    });
    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.ACTIVE_PLAN as any);

    expect(hasTextContaining(renderer, "Manage Plan")).toBe(false);
    expect(hasTextContaining(renderer, "Edit Structure")).toBe(false);
    expect(hasTextContaining(renderer, "Open Calendar")).toBe(true);

    expect(hasTextContaining(renderer, "sessions completed this week")).toBe(
      true,
    );
    expect(hasTextContaining(renderer, "Plan Insights")).toBe(false);
  });

  it("routes create/select intent from no-plan state to library training plans", () => {
    pushMock.mockReset();
    replaceMock.mockReset();
    eventsState.items = [];
    trainingPlanState.plan = null;
    Object.keys(localSearchParamsMock).forEach((key) => {
      delete localSearchParamsMock[key];
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const viewPlansButton = findTouchableByText(renderer, "Tap to view plans");
    act(() => {
      viewPlansButton.props.onPress();
    });

    expect(replaceMock).toHaveBeenCalledWith(
      ROUTES.LIBRARY_WITH_RESOURCE("training_plans"),
    );
  });

  it("switches between month, week, and day calendar views", () => {
    eventsState.items = [];
    trainingPlanState.plan = {
      id: "plan-1",
      name: "Plan Alpha",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    expect(countNodesByType(renderer, "Calendar")).toBe(1);

    const weekToggle = findTouchableByText(renderer, "Week");
    act(() => {
      weekToggle.props.onPress();
    });

    expect(hasTextContaining(renderer, "Week of")).toBe(true);
    expect(countNodesByType(renderer, "Calendar")).toBe(0);

    const dayToggle = findTouchableByText(renderer, "Day");
    act(() => {
      dayToggle.props.onPress();
    });

    expect(hasTextContaining(renderer, "Day timeline")).toBe(true);
    expect(countNodesByType(renderer, "Calendar")).toBe(0);

    const monthToggle = findTouchableByText(renderer, "Month");
    act(() => {
      monthToggle.props.onPress();
    });

    expect(countNodesByType(renderer, "Calendar")).toBe(1);
  });

  it("opens and closes event detail modal from selected day card", () => {
    const today = new Date().toISOString().split("T")[0]!;
    eventsState.items = [
      {
        id: "event-custom-1",
        event_type: "custom",
        title: "Mobility Session",
        status: "scheduled",
        notes: "Foam roll and stretch",
        scheduled_date: today,
        starts_at: `${today}T07:00:00.000Z`,
        all_day: false,
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const eventCard = findNodeByTestId(renderer, "event-card-event-custom-1");
    act(() => {
      eventCard.props.onPress();
    });

    expect(findNodeByTestId(renderer, "event-detail-modal")).toBeTruthy();
    expect(hasTextContaining(renderer, "Mobility Session")).toBe(true);

    const closeButton = findNodeByTestId(renderer, "close-event-detail");
    act(() => {
      closeButton.props.onPress();
    });

    const modalNode = renderer.root.findAll(
      (node: any) => node.type === "Modal",
    )[0];
    expect(modalNode.props.visible).toBe(false);
  });

  it("opens move action and submits update with new date", () => {
    updateMutateMock.mockReset();
    const today = new Date().toISOString().split("T")[0]!;
    eventsState.items = [
      {
        id: "event-custom-move-1",
        event_type: "custom",
        title: "Mobility Session",
        status: "scheduled",
        scheduled_date: today,
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const eventCard = findNodeByTestId(
      renderer,
      "event-card-event-custom-move-1",
    );
    act(() => {
      eventCard.props.onPress();
    });

    const moveButton = findNodeByTestId(renderer, "event-action-move");
    act(() => {
      moveButton.props.onPress();
    });

    const movePicker = findNodeByTestId(renderer, "move-date-picker");
    act(() => {
      movePicker.props.onChange({}, new Date(2026, 2, 15, 12, 0, 0));
    });

    expect(updateMutateMock).toHaveBeenCalledWith({
      id: "event-custom-move-1",
      scheduled_date: "2026-03-15",
    });
  });

  it("prompts recurring scope for move and sends selected scope", () => {
    alertMock.mockReset();
    updateMutateMock.mockReset();
    const today = new Date().toISOString().split("T")[0]!;
    eventsState.items = [
      {
        id: "event-custom-recurring-move-1",
        event_type: "custom",
        title: "Tempo Session",
        status: "scheduled",
        scheduled_date: today,
        series_id: "series-44",
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const eventCard = findNodeByTestId(
      renderer,
      "event-card-event-custom-recurring-move-1",
    );
    act(() => {
      eventCard.props.onPress();
    });

    const moveButton = findNodeByTestId(renderer, "event-action-move");
    act(() => {
      moveButton.props.onPress();
    });

    expect(alertMock).toHaveBeenCalledWith(
      "Move Recurring Event",
      "Choose how much of this series to move.",
      expect.any(Array),
    );

    act(() => {
      pressAlertButton(0, "This and future events");
    });

    const movePicker = findNodeByTestId(renderer, "move-date-picker");
    act(() => {
      movePicker.props.onChange({}, new Date(2026, 3, 2, 12, 0, 0));
    });

    expect(updateMutateMock).toHaveBeenCalledWith({
      id: "event-custom-recurring-move-1",
      scheduled_date: "2026-04-02",
      scope: "future",
    });
  });

  it("long-pressing a week chip starts quick move flow", () => {
    updateMutateMock.mockReset();
    const today = new Date().toISOString().split("T")[0]!;
    eventsState.items = [
      {
        id: "event-week-move-1",
        event_type: "custom",
        title: "Easy Run",
        status: "scheduled",
        scheduled_date: today,
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const weekToggle = findTouchableByText(renderer, "Week");
    act(() => {
      weekToggle.props.onPress();
    });

    const weekChip = findNodeByTestId(
      renderer,
      "week-event-chip-event-week-move-1",
    );
    act(() => {
      weekChip.props.onLongPress();
    });

    expect(findNodeByTestId(renderer, "move-date-picker")).toBeTruthy();
  });

  it("drags a week chip onto another day and submits move", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T12:00:00.000Z"));
    updateMutateMock.mockReset();

    eventsState.items = [
      {
        id: "event-week-drag-1",
        event_type: "custom",
        title: "Aerobic Ride",
        status: "scheduled",
        scheduled_date: "2026-03-04",
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const weekToggle = findTouchableByText(renderer, "Week");
    act(() => {
      weekToggle.props.onPress();
    });

    const weekChip = findNodeByTestId(
      renderer,
      "week-event-chip-event-week-drag-1",
    );
    act(() => {
      dragAndDropWithResponder(weekChip, { dx: 0, dy: 160 });
    });

    expect(updateMutateMock).toHaveBeenCalledWith({
      id: "event-week-drag-1",
      scheduled_date: "2026-03-06",
    });
    vi.useRealTimers();
  });

  it("prompts recurring scope when dropping a dragged day chip", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T12:00:00.000Z"));
    alertMock.mockReset();
    updateMutateMock.mockReset();

    eventsState.items = [
      {
        id: "event-day-drag-recurring-1",
        event_type: "custom",
        title: "Tempo Run",
        status: "scheduled",
        scheduled_date: "2026-03-04",
        series_id: "series-day-drag-1",
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const dayToggle = findTouchableByText(renderer, "Day");
    act(() => {
      dayToggle.props.onPress();
    });

    const dayChip = findNodeByTestId(
      renderer,
      "day-event-chip-event-day-drag-recurring-1",
    );
    act(() => {
      dragAndDropWithResponder(dayChip, { dx: 160, dy: 30 });
    });

    expect(alertMock).toHaveBeenCalledWith(
      "Move Recurring Event",
      "Choose how much of this series to move.",
      expect.any(Array),
    );

    act(() => {
      pressAlertButton(0, "Entire series");
    });

    expect(updateMutateMock).toHaveBeenCalledWith({
      id: "event-day-drag-recurring-1",
      scheduled_date: "2026-03-05",
      scope: "series",
    });
    vi.useRealTimers();
  });

  it("shows imported events as read-only and hides edit/delete actions", () => {
    const today = new Date().toISOString().split("T")[0]!;
    eventsState.items = [
      {
        id: "event-imported-1",
        event_type: "imported",
        title: "Imported Ride",
        status: "scheduled",
        source_provider: "google_calendar",
        scheduled_date: today,
        starts_at: `${today}T09:00:00.000Z`,
        all_day: false,
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const importedCard = findNodeByTestId(
      renderer,
      "event-card-event-imported-1",
    );
    act(() => {
      importedCard.props.onPress();
    });

    expect(findNodeByTestId(renderer, "imported-read-only")).toBeTruthy();
    expect(hasTextContaining(renderer, "Read-only imported event")).toBe(true);
    expect(
      renderer.root.findAll(
        (node: any) => node.props?.testID === "event-action-edit",
      ).length,
    ).toBe(0);
    expect(
      renderer.root.findAll(
        (node: any) => node.props?.testID === "event-action-delete",
      ).length,
    ).toBe(0);
  });

  it("opens type-first create selector from the plan screen", () => {
    eventsState.items = [];
    trainingPlanState.plan = {
      id: "plan-1",
      name: "Plan Alpha",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const createEventEntry = findNodeByTestId(renderer, "create-event-entry");
    act(() => {
      createEventEntry.props.onPress();
    });

    expect(
      findNodeByTestId(renderer, "create-event-type-selector"),
    ).toBeTruthy();
    expect(findNodeByTestId(renderer, "create-type-planned")).toBeTruthy();
    expect(findNodeByTestId(renderer, "create-type-rest-day")).toBeTruthy();
    expect(findNodeByTestId(renderer, "create-type-race-target")).toBeTruthy();
    expect(findNodeByTestId(renderer, "create-type-custom")).toBeTruthy();
  });

  it("opens manual create form for rest day, race target, and custom", () => {
    eventsState.items = [];
    trainingPlanState.plan = {
      id: "plan-1",
      name: "Plan Alpha",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    };

    const cases = [
      "create-type-rest-day",
      "create-type-race-target",
      "create-type-custom",
    ];

    for (const testID of cases) {
      let renderer!: TestRenderer.ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
      });

      const createEventEntry = findNodeByTestId(renderer, "create-event-entry");
      act(() => {
        createEventEntry.props.onPress();
      });

      const typeOption = findNodeByTestId(renderer, testID);
      act(() => {
        typeOption.props.onPress();
      });

      expect(findNodeByTestId(renderer, "manual-create-modal")).toBeTruthy();
    }
  });

  it("keeps planned create path routed to library", () => {
    vi.useFakeTimers();
    replaceMock.mockReset();
    eventsState.items = [];
    trainingPlanState.plan = {
      id: "plan-1",
      name: "Plan Alpha",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      structure: {},
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const createEventEntry = findNodeByTestId(renderer, "create-event-entry");
    act(() => {
      createEventEntry.props.onPress();
    });

    const plannedOption = findNodeByTestId(renderer, "create-type-planned");
    act(() => {
      plannedOption.props.onPress();
    });

    expect(
      renderer.root.findAll(
        (node: any) => node.props?.testID === "create-event-type-selector",
      ).length,
    ).toBe(0);
    expect(replaceMock).not.toHaveBeenCalled();

    act(() => {
      vi.runAllTimers();
    });

    expect(replaceMock).toHaveBeenCalledWith(ROUTES.LIBRARY);
    vi.useRealTimers();
  });

  it("dismisses event overlay before navigating to planned event detail", () => {
    vi.useFakeTimers();
    pushMock.mockReset();
    const today = new Date().toISOString().split("T")[0]!;
    eventsState.items = [
      {
        id: "event-planned-open-1",
        event_type: "planned",
        title: "Threshold Run",
        status: "scheduled",
        scheduled_date: today,
        activity_plan: {
          id: "activity-plan-open-1",
          name: "Threshold Session",
          activity_category: "outdoor_run",
        },
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const plannedCard = renderer.root.find((node: any) => {
      return (
        node.type === "ActivityPlanCard" &&
        node.props?.plannedActivity?.id === "event-planned-open-1"
      );
    });

    act(() => {
      plannedCard.props.onPress();
    });

    expect(findNodeByTestId(renderer, "event-detail-modal")).toBeTruthy();

    const openButton = findNodeByTestId(renderer, "event-action-open");
    act(() => {
      openButton.props.onPress();
    });

    const modalNode = renderer.root.findAll(
      (node: any) => node.type === "Modal",
    )[0];
    expect(modalNode?.props?.visible).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();

    act(() => {
      vi.runAllTimers();
    });

    expect(pushMock).toHaveBeenCalledWith(
      ROUTES.PLAN.ACTIVITY_DETAIL("event-planned-open-1"),
    );
    vi.useRealTimers();
  });
});
