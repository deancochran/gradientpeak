import React from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const setSelectionMock = jest.fn();
const setActiveDateMock = jest.fn();
const fixedNow = new Date("2026-03-23T12:00:00.000Z");
const today = fixedNow.toISOString().split("T")[0]!;
let paramsState: { date?: string } = { date: today };

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
    },
  },
}));

jest.mock("@/components/shared/ActivityPlanSummary", () => ({
  __esModule: true,
  ActivityPlanSummary: createHost("ActivityPlanSummary"),
}));

jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
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
            items: [
              {
                id: "event-1",
                event_type: "planned",
                title: "Tempo Builder",
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
            ],
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
      pathname: "/event-detail",
      params: { mode: "create", date: today },
    });
  });

  it("shows the planned activity summary inside the event card and opens event detail on tap", () => {
    const rendered = renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Tempo Builder")).toBeTruthy();
    expect((rendered as any).UNSAFE_getByType("ActivityPlanSummary").props.testID).toBe(
      "calendar-day-planned-event-1",
    );
    expect((rendered as any).UNSAFE_getByType("ActivityPlanSummary").props.routeName).toBe(
      "River Loop",
    );
    expect((rendered as any).UNSAFE_getByType("ActivityPlanSummary").props.subtitle).toBe(
      "Attached activity plan",
    );
    expect((rendered as any).UNSAFE_getByType("ActivityPlanContentPreview").props.size).toBe(
      "small",
    );

    fireEvent.press(screen.getByTestId("schedule-event-event-1"));

    expect(pushMock).toHaveBeenCalledWith("/event-detail?id=event-1");
  });

  it("shows normal events as plain calendar entries", () => {
    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Mobility session")).toBeTruthy();
    expect(screen.getByText("Gentle evening mobility.")).toBeTruthy();
    expect(screen.getByText("2:00 PM - 3:00 PM")).toBeTruthy();
    expect(screen.getByText("Garage studio")).toBeTruthy();
  });

  it("starts a planned activity from the quick action", () => {
    renderNative(<CalendarDayScreen />);

    fireEvent.press(screen.getByTestId("schedule-event-action-event-1"));

    expect(setSelectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: "outdoor_run", eventId: "event-1" }),
    );
    expect(pushMock).toHaveBeenCalledWith("/record");
  });
});
