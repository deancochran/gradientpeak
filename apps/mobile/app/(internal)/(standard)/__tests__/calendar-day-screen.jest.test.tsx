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
  Stack: { Screen: createHost("StackScreen") },
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
  ROUTES: { RECORD: "/record", PLAN: { EVENT_DETAIL: (id: string) => `/event-detail?id=${id}` } },
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
                scheduled_date: today,
                starts_at: `${today}T18:00:00.000Z`,
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

  it("shows richer cards and opens event detail on tap", () => {
    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Tempo Builder")).toBeTruthy();
    expect(screen.getByText("Progressive tempo with a strong finish.")).toBeTruthy();
    expect(screen.getByText("Outdoor Run")).toBeTruthy();
    expect(screen.getByText("4 steps")).toBeTruthy();
    expect(screen.getByText("Route")).toBeTruthy();

    fireEvent.press(screen.getByTestId("schedule-event-event-2"));

    expect(pushMock).toHaveBeenCalledWith("/event-detail?id=event-2");
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
