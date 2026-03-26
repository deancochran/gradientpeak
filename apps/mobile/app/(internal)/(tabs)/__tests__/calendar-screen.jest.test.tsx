import { format } from "date-fns";
import React, { act } from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const replaceMock = jest.fn();
const openRouteMock = jest.fn(() => "/event/event-1");
const setSelectionMock = jest.fn();
const appHeaderMock = jest.fn((props: any) =>
  React.createElement("AppHeader", props, props.children),
);
const fixedNow = new Date("2026-03-23T12:00:00.000Z");
const today = fixedNow.toISOString().split("T")[0]!;

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

function createModalHost(type: string) {
  return function MockModal(props: any) {
    if (!props.visible) {
      return null;
    }

    return React.createElement(type, props, props.children);
  };
}

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Modal: createModalHost("Modal"),
  Pressable: createHost("Pressable"),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

jest.mock("@react-navigation/native", () => ({
  __esModule: true,
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: createHost("DateTimePicker"),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: (props: any) => appHeaderMock(props),
}));

jest.mock("@repo/ui/components/loading-skeletons", () => ({
  __esModule: true,
  PlanCalendarSkeleton: createHost("PlanCalendarSkeleton"),
}));

jest.mock("@/components/ScheduleActivityModal", () => ({
  __esModule: true,
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: createHost("Input"),
}));

jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: createHost("Switch"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ArrowUpRight: createHost("ArrowUpRight"),
  CalendarDays: createHost("CalendarDays"),
  CheckCircle2: createHost("CheckCircle2"),
  ChevronLeft: createHost("ChevronLeft"),
  ChevronRight: createHost("ChevronRight"),
  Clock3: createHost("Clock3"),
  Flag: createHost("Flag"),
  Lock: createHost("Lock"),
  MoonStar: createHost("MoonStar"),
  Pencil: createHost("Pencil"),
  Play: createHost("Play"),
  Plus: createHost("Plus"),
  Repeat2: createHost("Repeat2"),
  Search: createHost("Search"),
  Zap: createHost("Zap"),
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: setSelectionMock },
}));

jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: { RECORD: "/record" },
}));

jest.mock("@/lib/utils/plan/colors", () => ({
  __esModule: true,
  getActivityColor: (type?: string) => ({
    name: type === "outdoor_run" ? "Outdoor Run" : "Other",
    bg: "bg-orange-500",
    text: "text-orange-600",
    iconBg: "bg-orange-500",
  }),
}));

jest.mock("@/lib/utils/plan/dateGrouping", () => ({
  __esModule: true,
  isActivityCompleted: (activity: any) => activity?.completed === true,
}));

jest.mock("@/lib/navigation/useNavigationActionGuard", () => ({
  __esModule: true,
  useNavigationActionGuard: () => (navigate: () => void) => navigate(),
}));

jest.mock("@/lib/calendar/eventRouting", () => ({
  __esModule: true,
  buildEditEventRoute: jest.fn(() => "/edit/event-1"),
  buildOpenEventRoute: openRouteMock,
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleViews: jest.fn(async () => undefined),
}));

jest.mock("@/lib/trpc", () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({
      events: { invalidate: jest.fn(async () => undefined) },
    }),
    events: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "event-1",
                event_type: "custom",
                title: "Track workout",
                scheduled_date: today,
                starts_at: `${today}T09:00:00.000Z`,
                all_day: false,
                notes: null,
              },
              {
                id: "event-2",
                event_type: "planned",
                title: "Tempo Builder",
                scheduled_date: today,
                starts_at: `${today}T06:30:00.000Z`,
                all_day: false,
                completed: false,
                activity_plan: {
                  id: "plan-1",
                  name: "Tempo Builder",
                  activity_category: "outdoor_run",
                  estimated_duration: 3600,
                  estimated_tss: 72,
                },
              },
            ],
          },
          isLoading: false,
          refetch: jest.fn(async () => undefined),
        }),
      },
      create: {
        useMutation: () => ({ isPending: false, error: null, mutate: jest.fn() }),
      },
      update: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
      delete: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "plan-1",
                name: "Tempo Builder",
                activity_category: "outdoor_run",
                estimated_duration: 3600,
                estimated_tss: 72,
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

const CalendarScreenWithErrorBoundary = require("../calendar").default;

describe("calendar day scroller", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders full-screen day sections without legacy plan cards", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("create-event-entry")).toBeTruthy();
    expect(screen.getByTestId(`schedule-event-event-1`)).toBeTruthy();

    const textValues = (screen as any).UNSAFE_getAllByType("Text").map((node: any) => {
      const value = node.props.children;
      if (Array.isArray(value)) {
        return value.join("");
      }
      return typeof value === "string" ? value : "";
    });
    const combinedText = textValues.join(" ");

    expect(textValues).toContain(format(new Date(`${today}T00:00:00.000Z`), "MMMM yyyy"));
    expect(screen.getByTestId("day-header-2026-03-23")).toBeTruthy();
    expect(
      (screen as any).queryAllByProps?.({ testID: `calendar-gap-${today}` }) ?? [],
    ).toHaveLength(0);
    expect(
      (screen as any)
        .UNSAFE_getAllByType("View")
        .filter((node: any) => String(node.props?.testID || "").startsWith("calendar-gap-")).length,
    ).toBeGreaterThan(0);
    expect(combinedText).toContain("From Plan");
    expect(combinedText).toContain("72 TSS");
    expect(combinedText).toContain("Start");
    expect(combinedText).toContain("Next event");
    expect(textValues).not.toContain("Open Full Plan");
    expect(textValues).not.toContain("No Training Plan");
    expect(textValues).not.toContain("Up Next");
  });

  it("updates focused day when another day is selected from the week strip", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    const nextWeekDayKey = "2026-03-31";

    fireEvent.press(screen.getByTestId("calendar-week-next"));
    fireEvent.press(screen.getByTestId(`calendar-week-day-${nextWeekDayKey}`));

    const expectedLabel = format(new Date(`${nextWeekDayKey}T12:00:00.000Z`), "EEEE, MMM d");

    const textValues = (screen as any)
      .UNSAFE_getAllByType("Text")
      .map((node: any) => node.props.children)
      .flat()
      .filter((value: unknown): value is string => typeof value === "string");

    expect(textValues).toContain(expectedLabel);
  });

  it("shows a guided empty-day state when selecting an unscheduled day", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    const nextWeekDayKey = "2026-03-31";

    fireEvent.press(screen.getByTestId("calendar-week-next"));
    fireEvent.press(screen.getByTestId(`calendar-week-day-${nextWeekDayKey}`));

    expect(screen.getByTestId(`calendar-empty-day-${nextWeekDayKey}`)).toBeTruthy();
    expect(screen.getByTestId(`calendar-empty-create-${nextWeekDayKey}`)).toBeTruthy();
  });

  it("snaps the scrolling agenda to the visible week start", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    const sectionList = (screen as any).UNSAFE_getAllByType("SectionList")[0];

    act(() => {
      sectionList.props.onViewableItemsChanged({
        viewableItems: [{ section: { dateKey: "2026-03-31" } }],
      });
      sectionList.props.onMomentumScrollEnd();
    });

    const textValues = (screen as any)
      .UNSAFE_getAllByType("Text")
      .map((node: any) => node.props.children)
      .flat()
      .filter((value: unknown): value is string => typeof value === "string");

    expect(textValues.join(" ")).toContain("Week Of  Mar 30");
    expect(textValues.join(" ")).toContain("Monday, Mar 23");
  });

  it("keeps week-strip visible state stable until scroll settles", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("calendar-week-next"));
    fireEvent.press(screen.getByTestId("calendar-week-day-2026-03-31"));

    const renderCountBeforePassiveScroll = appHeaderMock.mock.calls.length;

    const sectionList = (screen as any).UNSAFE_getAllByType("SectionList")[0];

    act(() => {
      sectionList.props.onViewableItemsChanged({
        viewableItems: [{ section: { dateKey: "2026-04-02" } }],
      });
    });

    const visibleDay = screen.getByTestId("calendar-week-day-2026-04-02").props.children[1];

    expect(String(visibleDay.props.className)).not.toContain("border-primary");
    expect(screen.getByText("Tuesday, Mar 31")).toBeTruthy();
    expect(appHeaderMock.mock.calls.length).toBe(renderCountBeforePassiveScroll);
  });

  it("navigates directly to routed event detail on tap", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("schedule-event-event-1"));

    expect(openRouteMock).toHaveBeenCalled();
  });

  it("starts a planned activity from the row quick action", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("schedule-event-action-event-2"));

    expect(setSelectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "outdoor_run",
        eventId: "event-2",
      }),
    );
  });

  it("opens a direct planned-activity scheduling flow from calendar", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("create-event-entry"));
    fireEvent.press(screen.getByTestId("create-type-planned"));

    expect(replaceMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("calendar-planned-activity-option-plan-1"));

    const scheduleModal = (screen as any).UNSAFE_getAllByType("ScheduleActivityModal")[0];
    expect(scheduleModal.props.activityPlanId).toBe("plan-1");
    expect(scheduleModal.props.preselectedDate).toBe(today);
  });
});
