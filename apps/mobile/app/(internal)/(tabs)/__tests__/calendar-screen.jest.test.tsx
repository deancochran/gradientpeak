import { keepPreviousData } from "@tanstack/react-query";
import { act } from "@testing-library/react-native/pure";
import React from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { create } from "zustand";

import { createHost, type HostProps } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const replaceMock = jest.fn();
const eventsListUseQueryMock = jest.fn();
const activitiesListUseQueryMock = jest.fn();
const groupEventsListUseQueryMock = jest.fn();
const mockFlatListScrollToIndex = jest.fn();
const mockFlatListScrollToOffset = jest.fn();
const utilsEventsInvalidateMock = jest.fn(async () => undefined);
let mockAuthReady = true;
const fixedNow = new Date("2026-03-23T12:00:00.000Z");
const today = fixedNow.toISOString().slice(0, 10);
let mockTodayKey = today;

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

type FlatListItem = Record<string, unknown> & { key?: React.Key };
type FlatListHandle = {
  scrollToIndex: typeof mockFlatListScrollToIndex;
  scrollToOffset: typeof mockFlatListScrollToOffset;
};
type FlatListMockProps = {
  data?: FlatListItem[];
  renderItem: (info: {
    item: FlatListItem;
    index: number;
    separators: Record<string, never>;
  }) => React.ReactNode;
  testID?: string;
};
type AuthStoreFixture = { ready: boolean; session: { user: { id: string } } };

jest.mock("@repo/core", () => ({
  __esModule: true,
  formatGoalTypeLabel: () => "Race Day",
  getGoalObjectiveSummary: () => "Run your A race",
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  FlatList: React.forwardRef(function FlatListMock(
    { data = [], renderItem, ...props }: FlatListMockProps,
    ref: React.ForwardedRef<FlatListHandle>,
  ) {
    const imperativeHandle = {
      scrollToIndex: mockFlatListScrollToIndex,
      scrollToOffset: mockFlatListScrollToOffset,
    };
    React.useImperativeHandle(ref, () => imperativeHandle);
    if (ref && typeof ref === "object") {
      ref.current = imperativeHandle;
    }

    return React.createElement(
      "FlatList",
      { data, renderItem, ...props },
      data.map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: item.key ?? index },
          renderItem({ item, index, separators: {} }),
        ),
      ),
    );
  }),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
  View: createHost("View"),
}));

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    createAnimatedComponent: (Component: unknown) => Component,
  },
  runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
  useAnimatedScrollHandler: (handler: unknown) => handler,
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/auth/auth-headers", () => ({
  __esModule: true,
  hasSessionAuthCredentials: () => true,
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: <T,>(selector: (state: AuthStoreFixture) => T) =>
    selector({ ready: mockAuthReady, session: { user: { id: "profile-1" } } }),
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
    isError: false,
    refetch: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/lib/hooks/useLocalTodayKey", () => ({
  __esModule: true,
  useLocalTodayKey: () => mockTodayKey,
}));

jest.mock("@react-navigation/native", () => ({
  __esModule: true,
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.spyOn(global, "setTimeout").mockImplementation((fn: TimerHandler) => {
  if (typeof fn === "function") fn();
  return 0 as never;
});
global.requestAnimationFrame = jest.fn((fn: FrameRequestCallback) => {
  fn(0);
  return 0;
});

jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children, ...props }: HostProps) =>
      React.createElement("BottomSheet", props, children),
    BottomSheetBackdrop: (props: HostProps) => React.createElement("BottomSheetBackdrop", props),
    BottomSheetView: ({ children, ...props }: HostProps) =>
      React.createElement("BottomSheetView", props, children),
  };
});

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: createHost("DateTimePicker"),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
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
  CalendarDays: createHost("CalendarDays"),
  CalendarRange: createHost("CalendarRange"),
  CheckCircle2: createHost("CheckCircle2"),
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
  useCalendarStore: <T,>(selector: (state: CalendarStoreState) => T) =>
    selector(useCalendarStore()),
}));

jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: {
    RECORD: "/record",
    PLAN: {
      CALENDAR_DAY: (date: string) => ({ pathname: "/calendar-day", params: { date } }),
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
  isActivityCompleted: (activity: { completed?: boolean }) => activity.completed === true,
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

jest.mock("expo-haptics", () => ({
  __esModule: true,
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

jest.mock("@shopify/react-native-skia", () => ({
  __esModule: true,
  Canvas: createHost("Canvas"),
  Group: createHost("Group"),
  LinearGradient: createHost("LinearGradient"),
  Path: createHost("Path"),
  Rect: createHost("Rect"),
  Skia: {
    Path: { Make: () => ({ lineTo: jest.fn(), moveTo: jest.fn() }) },
  },
  vec: jest.fn((x, y) => ({ x, y })),
}));

jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      events: {
        invalidate: utilsEventsInvalidateMock,
      },
    }),
    events: {
      list: {
        useInfiniteQuery: (input?: unknown, options?: unknown) =>
          eventsListUseQueryMock(input, options) ?? {
            data: {
              pages: [
                {
                  items: [
                    {
                      id: "event-1",
                      event_type: "custom",
                      title: "Track activity",
                      description: "Fast reps on the oval.",
                      scheduled_date: today,
                      starts_at: `${today}T05:00:00.000`,
                      ends_at: `${today}T06:30:00.000`,
                      all_day: false,
                      notes: "Bring spikes",
                    },
                    {
                      id: "event-2",
                      event_type: "planned",
                      title: "Tempo Builder",
                      scheduled_date: today,
                      starts_at: `${today}T06:30:00.000`,
                      all_day: false,
                      completed: false,
                      activity_plan: {
                        id: "plan-1",
                        name: "Tempo Builder",
                        description: "Progressive tempo with a strong finish.",
                        activity_category: "outdoor_run",
                        estimated_duration: 3600,
                        estimated_tss: 72,
                        intensity_factor: 0.82,
                        structure: {
                          version: 3,
                          segments: [
                            {
                              id: "00000000-0000-4000-8000-000000000001",
                              role: "activity",
                              category: "run",
                              name: "Track activity",
                              intervals: [
                                {
                                  id: "00000000-0000-4000-8000-000000000002",
                                  name: "Main set",
                                  repetitions: 1,
                                  steps: [
                                    {
                                      id: "00000000-0000-4000-8000-000000000003",
                                      name: "Warmup",
                                      duration: { type: "time", seconds: 600 },
                                      targets: [{ type: "%MaxHR", intensity: 55 }],
                                    },
                                    {
                                      id: "00000000-0000-4000-8000-000000000004",
                                      name: "Tempo",
                                      duration: { type: "time", seconds: 1800 },
                                      targets: [{ type: "%MaxHR", intensity: 92 }],
                                    },
                                    {
                                      id: "00000000-0000-4000-8000-000000000005",
                                      name: "Cooldown",
                                      duration: { type: "time", seconds: 600 },
                                      targets: [{ type: "%MaxHR", intensity: 45 }],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      },
                    },
                    {
                      id: "event-3",
                      event_type: "custom",
                      title: "Mobility session",
                      description: "Gentle evening mobility.",
                      scheduled_date: "2026-03-24",
                      starts_at: "2026-03-24T18:00:00.000",
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
                      starts_at: `${today}T14:00:00.000`,
                      all_day: false,
                    },
                  ],
                  nextCursor: undefined,
                },
              ],
            },
            fetchNextPage: jest.fn(async () => undefined),
            hasNextPage: false,
            isError: false,
            isFetchingNextPage: false,
            isLoading: false,
            refetch: jest.fn(async () => undefined),
          },
      },
    },
    groups: {
      events: {
        myCalendarGroupEvents: {
          useInfiniteQuery: (input?: unknown, options?: unknown) =>
            groupEventsListUseQueryMock(input, options) ?? {
              data: { pages: [{ items: [], nextCursor: undefined }] },
              fetchNextPage: jest.fn(async () => undefined),
              hasNextPage: false,
              isError: false,
              isFetchingNextPage: false,
              isLoading: false,
              error: null,
              refetch: jest.fn(async () => undefined),
            },
        },
      },
    },
    activityPlans: {
      getManyByIds: {
        useQuery: () => ({
          data: { items: [] },
          isError: false,
          isLoading: false,
          error: null,
          refetch: jest.fn(async () => undefined),
        }),
      },
    },
    activities: {
      listPaginated: {
        useInfiniteQuery: (input?: unknown, options?: unknown) =>
          activitiesListUseQueryMock(input, options) ?? {
            data: {
              pages: [
                {
                  items: [
                    {
                      id: "activity-1",
                      name: "Morning miles",
                      type: "run",
                      started_at: `${today}T11:00:00.000Z`,
                      duration_seconds: 2700,
                      distance_meters: 8000,
                      moving_seconds: 2600,
                      avg_heart_rate: 145,
                      avg_power: null,
                      avg_cadence: 86,
                      elevation_gain_meters: 45,
                      calories: 520,
                      polyline: null,
                      activity_file_path: null,
                      likes_count: 0,
                      comments_count: 0,
                      is_private: false,
                      has_liked: false,
                      derived: {
                        tss: 64,
                        intensity_factor: 0.78,
                        computed_as_of: `${today}T11:45:00.000Z`,
                      },
                    },
                  ],
                },
              ],
            },
            fetchNextPage: jest.fn(async () => undefined),
            hasNextPage: false,
            isFetchingNextPage: false,
            isError: false,
            isLoading: false,
            refetch: jest.fn(async () => undefined),
          },
      },
    },
  },
}));

const CalendarScreenWithErrorBoundary = require("../calendar").default;
const {
  CALENDAR_EVENT_QUERY_LIMIT,
  DAY_RANGE_BACKWARD,
  DAY_RANGE_EXTENSION,
  DAY_RANGE_FORWARD,
  GROUP_CALENDAR_EVENT_QUERY_LIMIT,
  buildDayQueryWindow,
  ensureDayQueryWindowCovers,
} = require("@/components/calendar/useCalendarTimelineController");

function getFlatListByTestId(rendered: ReturnType<typeof renderNative>, testID: string) {
  type HostQueries = { UNSAFE_getAllByType(type: string): ReactTestInstance[] };
  const list = (rendered as typeof rendered & HostQueries)
    .UNSAFE_getAllByType("FlatList")
    .find((candidate) => candidate.props.testID === testID);
  if (!list) throw new Error(`Unable to find FlatList: ${testID}`);
  return list;
}

function getHostByType(rendered: ReturnType<typeof renderNative>, type: string) {
  type HostQueries = { UNSAFE_getByType(type: string): ReactTestInstance };
  return (rendered as typeof rendered & HostQueries).UNSAFE_getByType(type);
}

describe("calendar day timeline screen", () => {
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
    mockAuthReady = true;
    mockTodayKey = today;
    eventsListUseQueryMock.mockReset();
    activitiesListUseQueryMock.mockReset();
    groupEventsListUseQueryMock.mockReset();
    mockFlatListScrollToIndex.mockClear();
    mockFlatListScrollToOffset.mockClear();
  });

  it("keeps previous calendar data visible while the query window changes", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(eventsListUseQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ placeholderData: keepPreviousData }),
    );
  });

  it("shows loading rather than an error while auth is still initializing", () => {
    mockAuthReady = false;
    eventsListUseQueryMock.mockReturnValue({
      data: undefined,
      fetchNextPage: jest.fn(async () => undefined),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });
    activitiesListUseQueryMock.mockReturnValue({
      data: undefined,
      fetchNextPage: jest.fn(async () => undefined),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });
    groupEventsListUseQueryMock.mockReturnValue({
      data: undefined,
      fetchNextPage: jest.fn(async () => undefined),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("calendar-screen-loading")).toBeTruthy();
    expect(screen.queryByTestId("calendar-screen-ready")).toBeNull();
  });

  it("renders the day-first calendar timeline instead of the month grid", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);

    expect(getHostByType(rendered, "AppHeader").props.title).toBe("Calendar");
    expect(screen.getByTestId("calendar-visible-month-label")).toBeTruthy();
    expect(screen.getByTestId("calendar-visible-month-label").props.children).toBe("March 2026");
    expect(screen.getByTestId("calendar-week-strip")).toBeTruthy();
    expect(screen.getByTestId(`calendar-week-day-selected-${today}`)).toBeTruthy();
    expect(screen.getByTestId(`calendar-week-indicator-event-${today}`)).toBeTruthy();
    expect(screen.getByTestId(`calendar-week-indicator-activity-${today}`)).toBeTruthy();
    expect(screen.getByTestId(`calendar-week-indicator-goal-${today}`)).toBeTruthy();
    expect(screen.getByTestId("calendar-day-list")).toBeTruthy();
    expect(screen.getByTestId(`calendar-day-row-${today}`)).toBeTruthy();
    expect(screen.getByText("Mar 23")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByTestId("calendar-goal-row-goal-1")).toBeTruthy();
    expect(screen.getByTestId("calendar-activity-row-activity-1")).toBeTruthy();
    expect(screen.getByText("8.0 km · 45 min · ~64 TSS · ~IF 0.78")).toBeTruthy();
    expect(screen.getByTestId("calendar-event-row-event-2")).toBeTruthy();
    expect(screen.getByText("~1h · ~72 TSS · ~IF 0.82")).toBeTruthy();
    expect(screen.queryByTestId("calendar-summary-card")).toBeNull();
    expect(screen.queryByTestId("calendar-month-page-2026-03-01")).toBeNull();
    expect(screen.queryByTestId("calendar-month-marker-2026-04-01")).toBeNull();
  });

  it("updates the active visible day and header title from agenda scrolling", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    const list = getFlatListByTestId(rendered, "calendar-day-list");
    const aprilRow = { key: "day:2026-04-01", type: "day", dateKey: "2026-04-01" };

    act(() => {
      list.props.onViewableItemsChanged({
        viewableItems: [{ item: aprilRow, key: aprilRow.key, index: 20, isViewable: true }],
      });
    });

    expect(getHostByType(rendered, "AppHeader").props.title).toBe("Calendar");
    expect(screen.getByTestId("calendar-visible-month-label").props.children).toBe("April 2026");
    expect(screen.getByTestId("calendar-week-day-selected-2026-04-01")).toBeTruthy();
  });

  it("uses the topmost visible agenda row when viewability tokens are unsorted", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);
    const list = screen.getByTestId("calendar-day-list");
    const aprilRow = { key: "day:2026-04-01", type: "day", dateKey: "2026-04-01" };
    const laterRow = { key: "day:2026-04-08", type: "day", dateKey: "2026-04-08" };

    act(() => {
      list.props.onViewableItemsChanged({
        viewableItems: [
          { item: laterRow, key: laterRow.key, index: 28, isViewable: true },
          { item: aprilRow, key: aprilRow.key, index: 20, isViewable: true },
        ],
      });
    });

    expect(screen.getByTestId("calendar-week-day-selected-2026-04-01")).toBeTruthy();
  });

  it("keeps legacy persisted anchors out of manual scroll synchronization", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);
    const list = screen.getByTestId("calendar-day-list");
    const aprilRow = { key: "day:2026-04-01", type: "day", dateKey: "2026-04-01" };

    act(() => {
      list.props.onViewableItemsChanged({
        viewableItems: [{ item: aprilRow, key: aprilRow.key, index: 20, isViewable: true }],
      });
    });

    expect(screen.getByTestId("calendar-week-day-selected-2026-04-01")).toBeTruthy();
    expect(useCalendarStore.getState().visibleAnchor).toBe(today);

    act(() => {
      list.props.onScrollEndDrag({ nativeEvent: {} });
      list.props.onMomentumScrollBegin();
      jest.runOnlyPendingTimers();
    });

    expect(useCalendarStore.getState().visibleAnchor).toBe(today);

    act(() => {
      list.props.onMomentumScrollEnd();
    });

    expect(useCalendarStore.getState().visibleAnchor).toBe(today);
  });

  it("updates the selected week date when agenda scrolling reveals non-header rows", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);
    const list = screen.getByTestId("calendar-day-list");
    const objectRow = {
      key: "event:event-3",
      type: "object",
      dateKey: "2026-03-24",
      object: { id: "event-3", type: "event", event: { id: "event-3" } },
    };

    act(() => {
      list.props.onViewableItemsChanged({
        viewableItems: [{ item: objectRow, key: objectRow.key, index: 26, isViewable: true }],
      });
    });

    expect(screen.getByTestId("calendar-week-day-selected-2026-03-24")).toBeTruthy();
  });

  it("recenters the week strip when agenda scrolling changes the active week", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    const list = getFlatListByTestId(rendered, "calendar-day-list");
    const nextWeekRow = { key: "day:2026-04-08", type: "day", dateKey: "2026-04-08" };

    mockFlatListScrollToIndex.mockClear();

    act(() => {
      list.props.onViewableItemsChanged({
        viewableItems: [{ item: nextWeekRow, key: nextWeekRow.key, index: 28, isViewable: true }],
      });
    });

    expect(screen.getByTestId("calendar-visible-month-label").props.children).toBe("April 2026");
    expect(screen.getByTestId("calendar-week-day-selected-2026-04-08")).toBeTruthy();
    expect(screen.getByTestId("calendar-week-page-2026-04-05")).toBeTruthy();
    expect(getFlatListByTestId(rendered, "calendar-week-strip-list").props.extraData).toBe(
      "2026-04-08",
    );
    expect(getFlatListByTestId(rendered, "calendar-week-strip-list").props.initialScrollIndex).toBe(
      6,
    );
  });

  it("selects a week strip day without opening the day detail route", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    mockFlatListScrollToIndex.mockClear();

    act(() => {
      fireEvent.press(screen.getByTestId("calendar-week-day-2026-03-24"));
    });

    expect(useCalendarStore.getState().activeDate).toBe("2026-03-24");
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("calendar-week-day-selected-2026-03-24")).toBeTruthy();
  });

  it("keeps a tapped week strip day selected during programmatic agenda scrolling", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);
    const list = screen.getByTestId("calendar-day-list");
    const todayRow = { key: `day:${today}`, type: "day", dateKey: today };

    act(() => {
      fireEvent.press(screen.getByTestId("calendar-week-day-2026-03-24"));
    });

    act(() => {
      list.props.onViewableItemsChanged({
        viewableItems: [{ item: todayRow, key: todayRow.key, index: 21, isViewable: true }],
      });
    });

    expect(screen.getByTestId("calendar-week-day-selected-2026-03-24")).toBeTruthy();
    expect(screen.queryByTestId(`calendar-week-day-selected-${today}`)).toBeNull();

    act(() => {
      list.props.onMomentumScrollEnd();
    });

    expect(screen.getByTestId("calendar-week-day-selected-2026-03-24")).toBeTruthy();
  });

  it("opens completed activity rows from the calendar timeline", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("calendar-activity-row-activity-1"));

    expect(pushMock).toHaveBeenCalledWith("/activity-detail?id=activity-1");
  });

  it("keeps completed activity load fields visible when derived values are unavailable", () => {
    activitiesListUseQueryMock.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "activity-missing-load",
                name: "Easy spin",
                type: "bike",
                started_at: `${today}T13:00:00.000Z`,
                duration_seconds: 1800,
                distance_meters: 9000,
                derived: null,
              },
            ],
          },
        ],
      },
      fetchNextPage: jest.fn(async () => undefined),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByText("9.0 km · 30 min · -- TSS · IF --")).toBeTruthy();
  });

  it("keeps horizontal week paging passive until a day is selected", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    const weekList = getFlatListByTestId(rendered, "calendar-week-strip-list");

    expect(screen.getByTestId("calendar-week-strip-list")).toBeTruthy();
    expect(weekList.props.onViewableItemsChanged).toBeUndefined();

    expect(pushMock).not.toHaveBeenCalled();
    expect(useCalendarStore.getState().activeDate).toBe(today);
    expect(screen.getByTestId(`calendar-week-day-selected-${today}`)).toBeTruthy();
  });

  it("keeps a reset-to-today control beside the calendar create action", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    const list = getFlatListByTestId(rendered, "calendar-day-list");
    const aprilRow = { key: "day:2026-04-01", type: "day", dateKey: "2026-04-01" };

    act(() => {
      list.props.onViewableItemsChanged({
        viewableItems: [{ item: aprilRow, key: aprilRow.key, index: 20, isViewable: true }],
      });
    });

    fireEvent.press(screen.getByTestId("calendar-reset-today-entry"));

    expect(screen.getByTestId("create-event-entry")).toBeTruthy();
    expect(useCalendarStore.getState().activeDate).toBe(today);
    expect(screen.getByTestId(`calendar-week-day-selected-${today}`)).toBeTruthy();
  });

  it("uses the rollover-aware local today key when resetting the calendar", () => {
    const nextLocalDay = "2026-03-24";
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    mockTodayKey = nextLocalDay;

    act(() => {
      rendered.rerender(<CalendarScreenWithErrorBoundary />);
    });
    fireEvent.press(screen.getByTestId("calendar-reset-today-entry"));

    expect(useCalendarStore.getState().activeDate).toBe(nextLocalDay);
    expect(screen.getByTestId(`calendar-week-day-selected-${nextLocalDay}`)).toBeTruthy();
  });

  it("recovers agenda snapping when the selected day has not been measured", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    const list = getFlatListByTestId(rendered, "calendar-day-list");

    act(() => {
      list.props.onScrollToIndexFailed({
        averageItemLength: 72,
        highestMeasuredFrameIndex: 5,
        index: 26,
      });
    });

    expect(list.props.onScrollToIndexFailed).toBeDefined();
  });

  it("opens agenda creation for the visible agenda day", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("create-event-entry"));

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(internal)/(standard)/agenda-create",
      params: { date: today },
    });
  });

  it("initializes the query window around today instead of a stale persisted day", () => {
    act(() => {
      useCalendarStore.setState({ activeDate: "2026-09-12", visibleAnchor: "2026-03-01" });
    });

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(eventsListUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        date_from: "2026-03-02T05:00:00.000Z",
        date_to: "2026-07-21T04:00:00.000Z",
      }),
      expect.anything(),
    );
    expect(useCalendarStore.getState().activeDate).toBe(today);
    expect(useCalendarStore.getState().visibleAnchor).toBe("2026-03-01");
  });

  it("reconciles an external active date change while the tab remains mounted", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);
    mockFlatListScrollToIndex.mockClear();

    act(() => {
      useCalendarStore.getState().setActiveDate("2026-04-01");
    });

    expect(screen.getByTestId("calendar-week-day-selected-2026-04-01")).toBeTruthy();
    expect(screen.getByTestId("calendar-visible-month-label").props.children).toBe("April 2026");
  });

  it("opens the dedicated day route from a day row tap", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("calendar-day-row-2026-03-24"));

    expect(useCalendarStore.getState().activeDate).toBe("2026-03-24");
    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/calendar-day",
      params: { date: "2026-03-24" },
    });
  });

  it("renders lightweight agenda rows for non-planned events", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("calendar-entry-type-goal-goal-1")).toBeTruthy();
    expect(screen.getByText("5:00 AM")).toBeTruthy();
    expect(screen.getByText("1h 30m")).toBeTruthy();
    expect(screen.getByText("Fast reps on the oval.")).toBeTruthy();
    expect(screen.queryByTestId("calendar-entry-type-event-event-1")).toBeNull();
  });

  it("uses the same agenda row frame for activity plans and normal events", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("calendar-event-press-event-1").props.className).toContain(
      "min-h-16",
    );
    expect(screen.getByTestId("calendar-event-press-event-2").props.className).toContain(
      "min-h-16",
    );
    expect(screen.getByTestId("calendar-event-press-event-1").props.className).toBe(
      screen.getByTestId("calendar-event-press-event-2").props.className,
    );
  });

  it("renders personal events returned on later cursor pages", () => {
    eventsListUseQueryMock.mockReturnValue({
      data: {
        pages: [
          { items: [], nextCursor: "page-2" },
          {
            items: [
              {
                id: "event-page-2",
                event_type: "custom",
                title: "Later page event",
                scheduled_date: today,
                starts_at: `${today}T16:00:00.000`,
                all_day: false,
              },
            ],
            nextCursor: undefined,
          },
        ],
      },
      fetchNextPage: jest.fn(async () => undefined),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("calendar-event-row-event-page-2")).toBeTruthy();
  });

  it("continues personal and group event cursor queries", () => {
    const fetchNextEventsPage = jest.fn(async () => undefined);
    const fetchNextGroupEventsPage = jest.fn(async () => undefined);
    eventsListUseQueryMock.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: "event-page-2" }] },
      fetchNextPage: fetchNextEventsPage,
      hasNextPage: true,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });
    groupEventsListUseQueryMock.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: "group-page-2" }] },
      fetchNextPage: fetchNextGroupEventsPage,
      hasNextPage: true,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(fetchNextEventsPage).toHaveBeenCalledTimes(1);
    expect(fetchNextGroupEventsPage).toHaveBeenCalledTimes(1);
  });

  it("uses bounded cursor page sizes for personal and group events", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(CALENDAR_EVENT_QUERY_LIMIT).toBe(50);
    expect(GROUP_CALENDAR_EVENT_QUERY_LIMIT).toBe(50);
    expect(eventsListUseQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
      expect.objectContaining({ getNextPageParam: expect.any(Function) }),
    );
    expect(groupEventsListUseQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
      expect.objectContaining({ getNextPageParam: expect.any(Function) }),
    );
  });

  it("shows a retryable warning when one calendar source fails", () => {
    const refetch = jest.fn(async () => undefined);
    groupEventsListUseQueryMock.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: undefined }] },
      fetchNextPage: jest.fn(async () => undefined),
      hasNextPage: false,
      isError: true,
      isFetchingNextPage: false,
      isLoading: false,
      refetch,
    });

    renderNative(<CalendarScreenWithErrorBoundary />);
    fireEvent.press(screen.getByLabelText("Retry loading calendar items"));

    expect(screen.getByTestId("calendar-partial-error")).toBeTruthy();
    expect(refetch).toHaveBeenCalled();
  });

  it("shifts a bounded day window while loading future days", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    const list = getFlatListByTestId(rendered, "calendar-day-list");

    expect(list.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
    expect(list.props.initialNumToRender).toBeLessThanOrEqual(14);
    expect(list.props.maxToRenderPerBatch).toBeLessThanOrEqual(10);
    expect(list.props.windowSize).toBeLessThanOrEqual(5);
    expect(list.props.viewabilityConfig).toEqual(
      expect.objectContaining({ itemVisiblePercentThreshold: 35 }),
    );

    act(() => {
      list.props.onEndReached();
    });

    expect(eventsListUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        date_from: "2026-04-01T04:00:00.000Z",
        date_to: "2026-08-20T04:00:00.000Z",
      }),
      expect.anything(),
    );
  });

  it("shifts a bounded day window while loading past days", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    const list = getFlatListByTestId(rendered, "calendar-day-list");

    act(() => {
      list.props.onStartReached();
    });

    expect(eventsListUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        date_from: "2026-01-31T05:00:00.000Z",
        date_to: "2026-06-21T04:00:00.000Z",
      }),
      expect.anything(),
    );
  });

  it("does not expose list reordering as a calendar interaction", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    const list = getFlatListByTestId(rendered, "calendar-day-list");

    expect(list.props.onDragEnd).toBeUndefined();
  });

  it("keeps the calendar query window limits explicit and inclusive", () => {
    expect(DAY_RANGE_BACKWARD).toBe(21);
    expect(DAY_RANGE_FORWARD).toBe(119);
    expect(DAY_RANGE_EXTENSION).toBe(30);
    expect(buildDayQueryWindow(today)).toEqual({
      rangeStart: "2026-03-02",
      rangeEnd: "2026-07-20",
    });

    const currentWindow = { rangeStart: "2026-03-02", rangeEnd: "2026-07-20" };

    expect(ensureDayQueryWindowCovers({ ...currentWindow, anchorDate: "2026-03-02" })).toEqual(
      currentWindow,
    );
    expect(ensureDayQueryWindowCovers({ ...currentWindow, anchorDate: "2026-07-20" })).toEqual(
      currentWindow,
    );
    expect(ensureDayQueryWindowCovers({ ...currentWindow, anchorDate: "2026-03-01" })).toEqual({
      rangeStart: "2026-02-08",
      rangeEnd: "2026-06-28",
    });
    expect(ensureDayQueryWindowCovers({ ...currentWindow, anchorDate: "2026-07-21" })).toEqual({
      rangeStart: "2026-06-30",
      rangeEnd: "2026-11-17",
    });
  });
});
