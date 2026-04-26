import React from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const setSelectionMock = jest.fn();
const setActiveDateMock = jest.fn();
const fixedNow = new Date("2026-03-23T12:00:00.000Z");
const today = fixedNow.toISOString().split("T")[0]!;
const tomorrow = "2026-03-24";
let paramsState: { date?: string } = { date: today };
let eventItems: any[] = [];

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: any) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => paramsState,
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ArrowUpRight: createHost("ArrowUpRight"),
  Lock: createHost("Lock"),
  Play: createHost("Play"),
  Target: createHost("Target"),
  Zap: createHost("Zap"),
}));

jest.mock("@/lib/stores/calendar-store", () => ({
  __esModule: true,
  useCalendarStore: (selector: any) => selector({ setActiveDate: setActiveDateMock }),
}));

jest.mock("@/lib/hooks/useProfileGoals", () => ({
  __esModule: true,
  useProfileGoals: () => ({
    goals: [
      {
        id: "goal-1",
        title: "Spring A Race",
        target_date: today,
      },
    ],
  }),
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: setSelectionMock },
}));

jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: {
    RECORD: "/record",
    PLAN: {
      EVENT_CREATE: (date: string) => ({
        pathname: "/event-detail",
        params: { mode: "create", date },
      }),
      PLAN_DETAIL: (id: string) => `/activity-plan-detail?id=${id}`,
      EVENT_DETAIL: (id: string) => `/event-detail?id=${id}`,
      GOAL_DETAIL: (id: string) => `/goal-detail?id=${id}`,
    },
  },
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

jest.mock("@/lib/utils/plan/colors", () => ({
  __esModule: true,
  getActivityColor: () => ({
    name: "Outdoor Run",
    bg: "bg-orange-500",
    text: "text-orange-600",
    iconBg: "bg-orange-500",
  }),
}));

jest.mock("@/lib/utils/plan/dateGrouping", () => ({
  __esModule: true,
  isActivityCompleted: (activity: any) => activity?.completed === true,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    routes: {
      get: {
        useQuery: () => ({ data: { id: "route-1", name: "River Loop" } }),
      },
    },
    events: {
      list: {
        useQuery: () => ({
          data: {
            items: eventItems,
          },
          isLoading: false,
          error: null,
          refetch: jest.fn(async () => undefined),
        }),
      },
    },
  },
}));

jest.mock("@/lib/api/scheduleQueryOptions", () => ({
  __esModule: true,
  scheduleAwareReadQueryOptions: {},
}));

jest.mock("@/lib/calendar/eventRouting", () => ({
  __esModule: true,
  buildOpenEventRoute: ({ id }: { id: string }) => `/event-detail?id=${id}`,
}));

const CalendarDayScreen = require("../calendar-day").default;

describe("calendar day screen", () => {
  beforeEach(() => {
    eventItems = [
      {
        id: "event-1",
        event_type: "planned",
        title: "Tempo Builder",
        training_plan_id: "training-plan-1",
        scheduled_date: today,
        starts_at: `${today}T06:30:00.000Z`,
        all_day: false,
        completed: false,
        activity_plan: {
          id: "plan-1",
          name: "Tempo Builder",
          description: "Progressive tempo with a strong finish.",
          activity_category: "outdoor_run",
          estimated_duration: 3600,
          estimated_tss: 72,
          intensity_factor: 0.88,
          route_id: "route-1",
          structure: {
            intervals: [{ repetitions: 2, steps: [{}, {}] }],
          },
        },
      },
      {
        id: "event-2",
        event_type: "custom",
        title: "Mobility session",
        description: "Gentle evening mobility.",
        location: "Garage studio",
        scheduled_date: today,
        starts_at: `${today}T18:00:00.000Z`,
        ends_at: `${today}T19:00:00.000Z`,
        all_day: false,
      },
    ];
    pushMock.mockReset();
  });

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    paramsState = { date: today };
  });

  it("sets the full-date header and persists the selected day", () => {
    const rendered = renderNative(<CalendarDayScreen />);

    expect(setActiveDateMock).toHaveBeenCalledWith(today);
    const stackScreen = (rendered as any).UNSAFE_getByType("StackScreen");
    expect(stackScreen.props.options.title).toBe("Today, March 23");
  });

  it("opens create event with the selected day prefilled", () => {
    renderNative(<CalendarDayScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-create-event-button"));

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(internal)/(standard)/event-detail",
      params: { mode: "create", date: today },
    });
  });

  it("shows the linked activity plan card under the event details and opens event detail on tap", () => {
    const rendered = renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Goal")).toBeTruthy();
    expect(screen.getByText("Spring A Race")).toBeTruthy();
    expect(screen.getByText("Tempo Builder")).toBeTruthy();
    expect(screen.getByText("From training plan")).toBeTruthy();
    expect(screen.getByText("Linked activity plan")).toBeTruthy();
    expect((rendered as any).UNSAFE_getByType("ActivityPlanCard").props.activityPlan).toEqual(
      expect.objectContaining({
        id: "plan-1",
        name: "Tempo Builder",
      }),
    );

    fireEvent.press(screen.getByTestId("schedule-event-event-1"));

    expect(pushMock).toHaveBeenCalledWith("/event-detail?id=event-1");
  });

  it("opens goal detail from the goal anchor card", () => {
    renderNative(<CalendarDayScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-goal-anchor"));

    expect(pushMock).toHaveBeenCalledWith("/goal-detail?id=goal-1");
  });

  it("shows normal events as plain calendar entries", () => {
    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Mobility session")).toBeTruthy();
    expect(screen.getByText("Gentle evening mobility.")).toBeTruthy();
    expect(screen.getByText("2:00 PM - 3:00 PM")).toBeTruthy();
    expect(screen.getByText("Garage studio")).toBeTruthy();
  });

  it("keeps planned agenda items scan-first without a quick action button", () => {
    renderNative(<CalendarDayScreen />);

    expect(screen.queryByTestId("schedule-event-action-event-1")).toBeNull();
  });

  it("shows human-readable recurrence text in agenda items", () => {
    eventItems = [
      {
        id: "event-recurring",
        event_type: "custom",
        title: "Team sync",
        scheduled_date: today,
        starts_at: `${today}T16:00:00.000Z`,
        all_day: false,
        recurrence_rule: "FREQ=WEEKLY;UNTIL=20260530T235959Z",
      },
    ];

    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Every week until May 30, 2026")).toBeTruthy();
  });

  it("shows goal anchors even when the day has no events", () => {
    eventItems = [];

    renderNative(<CalendarDayScreen />);

    expect(screen.getByTestId("calendar-day-goal-anchor")).toBeTruthy();
    expect(screen.getByText("No events scheduled")).toBeTruthy();
    expect(screen.queryByText("Rest day")).toBeNull();
  });

  it("keeps custom events visible while still classifying the day as a rest day", () => {
    paramsState = { date: tomorrow };
    eventItems = [
      {
        id: "event-custom-only",
        event_type: "custom",
        title: "Dinner reservation",
        description: "Family night out.",
        location: "Downtown",
        scheduled_date: tomorrow,
        starts_at: `${tomorrow}T19:00:00.000Z`,
        ends_at: `${tomorrow}T20:30:00.000Z`,
        all_day: false,
      },
    ];

    renderNative(<CalendarDayScreen />);

    expect(screen.getByTestId(`calendar-rest-day-state-${tomorrow}`)).toBeTruthy();
    expect(screen.getByText("Rest day")).toBeTruthy();
    expect(screen.getByText("Dinner reservation")).toBeTruthy();
  });

  it("keeps events on their scheduled date even when starts_at crosses a local timezone boundary", () => {
    eventItems = [
      {
        id: "event-timezone-shift",
        event_type: "custom",
        title: "Early travel day",
        scheduled_date: today,
        starts_at: `${today}T00:30:00.000Z`,
        all_day: false,
      },
    ];

    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Early travel day")).toBeTruthy();
    expect(screen.queryByTestId(`calendar-rest-day-state-${today}`)).toBeNull();
  });
});
