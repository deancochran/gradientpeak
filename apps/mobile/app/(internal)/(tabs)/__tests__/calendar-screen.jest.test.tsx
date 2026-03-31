import React from "react";
import { create } from "zustand";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const replaceMock = jest.fn();
const openRouteMock = jest.fn(() => "/event/event-1");
const setSelectionMock = jest.fn();
const eventCreateMutateMock = jest.fn();
const eventUpdateMutateMock = jest.fn();
const eventDeleteMutateMock = jest.fn();
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
  mode: "day" | "month";
  activeDate: string | null;
  visibleAnchor: string | null;
  selectedEventId: string | null;
  sheetState: "closed" | "calendar-actions" | "event-preview";
  setHydrated: (hydrated: boolean) => void;
  setMode: (mode: "day" | "month") => void;
  setActiveDate: (activeDate: string | null) => void;
  setVisibleAnchor: (visibleAnchor: string | null) => void;
  setSelectedEventId: (selectedEventId: string | null) => void;
  setSheetState: (sheetState: "closed" | "calendar-actions" | "event-preview") => void;
};

const createCalendarStore = () =>
  create<CalendarStoreState>((set) => ({
    hydrated: true,
    mode: "day",
    activeDate: today,
    visibleAnchor: today,
    selectedEventId: null,
    sheetState: "closed",
    setHydrated: (hydrated) => set({ hydrated }),
    setMode: (mode) => set({ mode }),
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
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
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

jest.mock("@react-navigation/native", () => ({
  __esModule: true,
  useFocusEffect: (callback: () => void) => callback(),
}));

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
  Target: createHost("Target"),
  Trash2: createHost("Trash2"),
  Zap: createHost("Zap"),
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: setSelectionMock },
}));

jest.mock("@/lib/stores/calendar-store", () => ({
  __esModule: true,
  useCalendarStore: (selector: any) => selector(useCalendarStore()),
}));

jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: { RECORD: "/record" },
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
  buildOpenEventRoute: openRouteMock,
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
        useQuery: () => ({
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
            ],
          },
          isLoading: false,
          refetch: jest.fn(async () => undefined),
        }),
      },
      create: {
        useMutation: () => ({ isPending: false, error: null, mutate: eventCreateMutateMock }),
      },
      update: {
        useMutation: () => ({ isPending: false, mutate: eventUpdateMutateMock }),
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
  });

  it("renders the compact day shell without week-strip copy", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("create-event-entry")).toBeTruthy();
    expect(screen.getByTestId("calendar-mode-switcher")).toBeTruthy();
    expect(screen.getByTestId("calendar-day-page-2026-03-23")).toBeTruthy();
    expect(screen.getByTestId("schedule-event-event-1")).toBeTruthy();
    expect(screen.queryByText("Week Of")).toBeNull();
    expect(screen.queryByText("Next event")).toBeNull();
  });

  it("switches to month mode and jumps back into day mode from a month cell", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("calendar-mode-month"));

    expect(screen.getByTestId("calendar-month-page-2026-03-01")).toBeTruthy();

    fireEvent.press(screen.getByTestId("calendar-month-cell-2026-03-23"));

    expect(screen.getByTestId("calendar-day-page-2026-03-23")).toBeTruthy();
  });

  it("opens the event preview sheet and routes to full detail on demand", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("schedule-event-event-1"));
    expect(screen.getByTestId("calendar-event-preview-sheet")).toBeTruthy();

    fireEvent.press(screen.getByTestId("calendar-preview-open-detail"));

    expect(openRouteMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/event/event-1");
  });

  it("starts a planned activity from the day card quick action", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("schedule-event-action-event-2"));

    expect(setSelectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "outdoor_run",
        eventId: "event-2",
      }),
    );
  });

  it("opens the actions sheet and schedules a planned activity", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("create-event-entry"));
    expect(screen.getByTestId("calendar-actions-sheet")).toBeTruthy();

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

  it("moves an event onto another day through drag-mode drop targets", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("calendar-drag-handle-event-1"));
    fireEvent.press(screen.getByTestId("calendar-drop-zone-2026-03-24"));

    expect(eventUpdateMutateMock).toHaveBeenCalledWith({
      id: "event-1",
      scheduled_date: "2026-03-24",
    });
  });
});
