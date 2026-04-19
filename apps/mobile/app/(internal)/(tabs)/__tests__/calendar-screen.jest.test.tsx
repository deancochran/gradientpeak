import { keepPreviousData } from "@tanstack/react-query";
import { act } from "@testing-library/react-native/pure";
import React from "react";
import { create } from "zustand";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const replaceMock = jest.fn();
const eventCreateMutateMock = jest.fn();
const eventDeleteMutateMock = jest.fn();
const eventsListUseQueryMock = jest.fn();
const refreshScheduleWithCallbacksMock = jest.fn(async (_input: any) => undefined);
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

type CalendarStoreState = {
  hydrated: boolean;
  activeDate: string | null;
  visibleAnchor: string | null;
  selectedEventId: string | null;
  sheetState: "closed" | "calendar-actions" | "event-preview";
  setHydrated: (hydrated: boolean) => void;
  setActiveDate: (activeDate: string | null) => void;
  setVisibleAnchor: (visibleAnchor: string | null) => void;
  setSelectedEventId: (selectedEventId: string | null) => void;
  setSheetState: (sheetState: "closed" | "calendar-actions" | "event-preview") => void;
};

const createCalendarStore = () =>
  create<CalendarStoreState>((set) => ({
    hydrated: true,
    activeDate: today,
    visibleAnchor: today,
    selectedEventId: null,
    sheetState: "closed",
    setHydrated: (hydrated) => set({ hydrated }),
    setActiveDate: (activeDate) => set({ activeDate }),
    setVisibleAnchor: (visibleAnchor) => set({ visibleAnchor }),
    setSelectedEventId: (selectedEventId) => set({ selectedEventId }),
    setSheetState: (sheetState) => set({ sheetState }),
  }));

let useCalendarStore = createCalendarStore();

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: createHost("FlatList"),
  Modal: createModalHost("Modal"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@react-navigation/native", () => ({
  __esModule: true,
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.spyOn(global, "setTimeout").mockImplementation(((fn: any) => {
  fn();
  return 0 as any;
}) as any);

jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children, ...props }: any) => React.createElement("BottomSheet", props, children),
    BottomSheetBackdrop: (props: any) => React.createElement("BottomSheetBackdrop", props),
    BottomSheetView: ({ children, ...props }: any) =>
      React.createElement("BottomSheetView", props, children),
  };
});

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
  AppHeader: createHost("AppHeader"),
}));

jest.mock("@repo/ui/components/loading-skeletons", () => ({
  __esModule: true,
  PlanCalendarSkeleton: createHost("PlanCalendarSkeleton"),
}));

jest.mock("@/components/ScheduleActivityModal", () => ({
  __esModule: true,
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/input", () => ({ __esModule: true, Input: createHost("Input") }));
jest.mock("@repo/ui/components/switch", () => ({ __esModule: true, Switch: createHost("Switch") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ArrowUpRight: createHost("ArrowUpRight"),
  CalendarRange: createHost("CalendarRange"),
  Ellipsis: createHost("Ellipsis"),
  GripVertical: createHost("GripVertical"),
  Lock: createHost("Lock"),
  MoonStar: createHost("MoonStar"),
  Pencil: createHost("Pencil"),
  Play: createHost("Play"),
  Plus: createHost("Plus"),
  RotateCcw: createHost("RotateCcw"),
  Target: createHost("Target"),
  Trash2: createHost("Trash2"),
  Zap: createHost("Zap"),
}));

jest.mock("@/lib/stores/calendar-store", () => ({
  __esModule: true,
  useCalendarStore: (selector: any) => selector(useCalendarStore()),
}));

jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: {
    RECORD: "/record",
    PLAN: {
      CALENDAR_DAY: (date: string) => `/calendar-day?date=${date}`,
    },
  },
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

jest.mock("@/lib/navigation/useNavigationActionGuard", () => ({
  __esModule: true,
  useNavigationActionGuard: () => (navigate: () => void) => navigate(),
}));

jest.mock("@/lib/calendar/eventRouting", () => ({
  __esModule: true,
  buildEditEventRoute: jest.fn(() => "/edit/event-1"),
  buildOpenEventRoute: (event: { id: string; event_type?: string }) =>
    `/event/${event.id}-${event.event_type ?? "unknown"}`,
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleWithCallbacks: (input: any) => refreshScheduleWithCallbacksMock(input),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    events: {
      list: {
        useQuery: (...args: any[]) =>
          eventsListUseQueryMock(...args) ?? {
            data: {
              items: [
                {
                  id: "event-1",
                  event_type: "custom",
                  title: "Track workout",
                  description: "Fast reps on the oval.",
                  scheduled_date: today,
                  starts_at: `${today}T09:00:00.000Z`,
                  all_day: false,
                  notes: "Bring spikes",
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
                    description: "Progressive tempo with a strong finish.",
                    activity_category: "outdoor_run",
                    estimated_duration: 3600,
                    estimated_tss: 72,
                  },
                },
                {
                  id: "event-3",
                  event_type: "custom",
                  title: "Mobility session",
                  description: "Gentle evening mobility.",
                  scheduled_date: "2026-03-24",
                  starts_at: "2026-03-24T18:00:00.000Z",
                  all_day: false,
                },
                {
                  id: "event-4",
                  event_type: "rest_day",
                  title: "Legacy rest day",
                  scheduled_date: "2026-03-25",
                  all_day: true,
                },
                {
                  id: "event-5",
                  event_type: "imported",
                  title: "Imported ride",
                  description: "Pulled in from provider sync.",
                  scheduled_date: today,
                  starts_at: `${today}T14:00:00.000Z`,
                  all_day: false,
                },
              ],
            },
            isLoading: false,
            refetch: jest.fn(async () => undefined),
          },
      },
      create: {
        useMutation: () => ({ isPending: false, error: null, mutate: eventCreateMutateMock }),
      },
      delete: {
        useMutation: () => ({ isPending: false, mutate: eventDeleteMutateMock }),
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

describe("calendar redesign screen", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useCalendarStore = createCalendarStore();
    eventsListUseQueryMock.mockReset();
  });

  it("keeps previous calendar data visible while the query window changes", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(eventsListUseQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ placeholderData: keepPreviousData }),
    );
  });

  it("renders the month-first calendar without an inline agenda surface", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("create-event-entry")).toBeTruthy();
    expect(screen.getByTestId("calendar-reset-button")).toBeTruthy();
    expect(screen.queryByTestId("calendar-mode-switcher")).toBeNull();
    expect(screen.getByTestId("calendar-month-page-2026-03-01")).toBeTruthy();
    expect(screen.queryByTestId("calendar-selected-day-agenda")).toBeNull();
    expect(screen.queryByText("Week Of")).toBeNull();
    expect(screen.queryByText("Next event")).toBeNull();
  });

  it("reset selects the current day without changing the visible month model", () => {
    act(() => {
      useCalendarStore.setState({ activeDate: "2026-03-24", visibleAnchor: "2026-03-24" });
    });

    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("calendar-reset-button"));

    expect(useCalendarStore.getState().activeDate).toBe("2026-03-23");
    expect(useCalendarStore.getState().visibleAnchor).toBe("2026-03-01");
  });

  it("uses the selected day for create actions", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("calendar-month-cell-2026-03-24"));

    fireEvent.press(screen.getByTestId("create-event-entry"));
    fireEvent.press(screen.getByTestId("create-type-planned"));
    fireEvent.press(screen.getByTestId("calendar-planned-activity-option-plan-1"));

    const scheduleModal = (screen as any).UNSAFE_getAllByType("ScheduleActivityModal")[0];
    expect(scheduleModal.props.preselectedDate).toBe("2026-03-24");
  });

  it("initializes the query window from the selected day even when the visible month diverges", () => {
    act(() => {
      useCalendarStore.setState({ activeDate: "2026-09-12", visibleAnchor: "2026-03-01" });
    });

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(eventsListUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ date_from: "2026-07-01", date_to: "2027-01-31" }),
      expect.anything(),
    );
  });

  it("opens the dedicated day route from a month cell tap", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("calendar-month-page-2026-03-01")).toBeTruthy();

    fireEvent.press(screen.getByTestId("calendar-month-cell-2026-03-24"));

    expect(useCalendarStore.getState().activeDate).toBe("2026-03-24");
    expect(pushMock).toHaveBeenCalledWith("/calendar-day?date=2026-03-24");
  });

  it("does not open the day route for a selected day without visible events", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("calendar-month-cell-2026-03-25"));

    expect(useCalendarStore.getState().activeDate).toBe(today);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does not keep a persistent selected style after choosing an event day", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("calendar-month-cell-2026-03-24"));

    const selectedCell = screen.getByTestId("calendar-month-cell-2026-03-24");
    expect(selectedCell.props.children[0].props.className).toContain("bg-transparent");
    expect(selectedCell.props.children[0].props.className).not.toContain("bg-primary");
  });

  it("does not render month density markers for rest-day-only dates", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    const restDayCell = screen.getByTestId("calendar-month-cell-2026-03-25");
    expect((restDayCell.props.children[1]?.props?.children ?? []).length ?? 0).toBe(0);
  });

  it("renders out-of-month filler cells as non-interactive blanks", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("calendar-month-filler-2026-03-01-2026-02-23")).toBeTruthy();

    fireEvent.press(screen.getByTestId("calendar-month-filler-2026-03-01-2026-02-23"));

    expect(useCalendarStore.getState().activeDate).toBe(today);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does not render a sixth blank week for five-row months", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.queryByTestId("calendar-month-filler-2026-04-01-2026-05-04")).toBeNull();
  });

  it("opens the actions sheet and schedules a planned activity", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("create-event-entry"));
    expect(screen.getByTestId("calendar-actions-sheet")).toBeTruthy();
    expect(screen.queryByTestId("create-type-rest-day")).toBeNull();
    expect(screen.queryByTestId("calendar-actions-today")).toBeNull();

    fireEvent.press(screen.getByTestId("create-type-planned"));
    fireEvent.press(screen.getByTestId("calendar-planned-activity-option-plan-1"));

    const scheduleModal = (screen as any).UNSAFE_getAllByType("ScheduleActivityModal")[0];
    expect(scheduleModal.props.activityPlanId).toBe("plan-1");
    expect(scheduleModal.props.preselectedDate).toBe(today);
  });

  it("opens custom event creation from the actions sheet", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("create-event-entry"));
    fireEvent.press(screen.getByTestId("create-type-custom"));

    expect(screen.getByTestId("manual-create-modal")).toBeTruthy();
  });

  it("keeps month scrolling continuous while extending the query range", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);

    const flatList = (rendered as any).UNSAFE_getByType("FlatList");
    act(() => {
      flatList.props.onEndReached();
    });

    expect(eventsListUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ date_from: "2026-01-01", date_to: "2026-09-30" }),
      expect.anything(),
    );
  });
});
