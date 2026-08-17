import { act } from "@testing-library/react-native/pure";
import React from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { create } from "zustand";

import {
  createObservationQuantificationBundleFixture,
  createPrescriptionQuantificationBundleFixture,
} from "@/components/shared/__tests__/activityQuantificationFixture";
import { createHost, type HostProps } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const replaceMock = jest.fn();
const calendarRangeUseQueryMock = jest.fn();
const mockFlatListScrollToIndex = jest.fn();
const mockFlatListScrollToOffset = jest.fn();
const utilsEventsInvalidateMock = jest.fn(async () => undefined);
const cancelPlannedSessionMock = jest.fn();
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
type AuthStoreFixture = {
  ready: boolean;
  session: { user: { id: string } };
  profile: { id: string };
};

jest.mock("@repo/api/react", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/api/react"),
  usePlannedSessionMutations: () => ({ cancel: { mutate: cancelPlannedSessionMock } }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/core"),
  formatGoalTypeLabel: () => "Race Day",
  getTrainingIntensityZone: jest.requireActual("@repo/core/load").getTrainingIntensityZone,
  getGoalObjectiveSummary: () => "Run your A race",
  isActivityCompleted: (activity: { completed?: boolean }) => activity.completed === true,
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
    selector({
      ready: mockAuthReady,
      session: { user: { id: "profile-1" } },
      profile: { id: "profile-1" },
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

function mockProjectionMetric(
  key: "common_load" | "distance" | "elapsed_duration" | "normalized_intensity",
  label: string,
  value: number | null,
  unit: string,
  status: "available" | "partial" | "unavailable" = "available",
) {
  return status === "unavailable"
    ? { key, label, status, value: null, unit, reason: "quantification_unavailable" }
    : {
        key,
        label,
        status,
        value: value ?? 0,
        unit,
        reason: status === "partial" ? "quantification_partial" : null,
      };
}

function mockProjectionItem(input: {
  allDay?: boolean;
  calendarDate?: string;
  endsAt?: string | null;
  id: string;
  kind: "completed_activity" | "event" | "goal" | "group_event" | "planned_activity";
  metrics?: unknown[];
  plan?: Record<string, unknown> | null;
  startsAt?: string | null;
  subtitle?: string | null;
  title: string;
}) {
  return {
    id: input.id,
    calendarDate: input.calendarDate ?? today,
    timing: {
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      allDay: input.allDay ?? false,
      timezone: "UTC",
    },
    kind: input.kind,
    title: input.title,
    subtitle: input.subtitle ?? null,
    status: input.kind === "completed_activity" ? "completed" : "scheduled",
    navigation: {
      target:
        input.kind === "completed_activity"
          ? "activity"
          : input.kind === "goal"
            ? "goal"
            : input.kind === "group_event"
              ? "group_event"
              : "event",
      href:
        input.kind === "completed_activity"
          ? `/activities/${input.id}`
          : input.kind === "goal"
            ? `/goals/${input.id}`
            : input.kind === "group_event"
              ? `/group-events/${input.id}`
              : `/calendar/events/${input.id}`,
    },
    metrics: input.metrics ?? [],
    estimated: input.kind === "planned_activity",
    partial: false,
    plan: input.plan ?? null,
    activity: null,
    event:
      input.kind === "planned_activity" || input.kind === "event"
        ? { type: input.kind === "planned_activity" ? "planned" : "custom", trainingPlanId: null }
        : null,
    groupEvent:
      input.kind === "group_event"
        ? { group: { id: "group-1", name: "Tuesday crew" }, viewerRsvpStatus: "accepted" }
        : null,
    goal:
      input.kind === "goal" ? { typeLabel: "Race Day", objectiveSummary: "Run your A race" } : null,
  };
}

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      events: {
        invalidate: utilsEventsInvalidateMock,
      },
      plannedSessions: { range: { fetch: jest.fn(async () => undefined) } },
    }),
    plannedSessions: {
      range: {
        useQuery: () => ({
          data: { items: [], truncated: false },
          isError: false,
          isLoading: false,
          refetch: jest.fn(async () => undefined),
        }),
      },
    },
    calendar: {
      range: {
        useQuery: (input?: unknown, options?: unknown) => {
          return (
            calendarRangeUseQueryMock(input, options) ?? {
              data: {
                legacyItems: [
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
                      activity_category: "run",
                      prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
                        durationSeconds: 3_600,
                        load: 67.24,
                      }),
                      structure: {
                        version: 3,
                        segments: [
                          {
                            id: "00000000-0000-4000-8000-000000000001",
                            role: "activity",
                            activity_category: "run",
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
                ],
                projection: {
                  contractVersion: "calendar-projection-v1",
                  startDate: "2026-03-02",
                  endDateExclusive: "2026-07-21",
                  timezone: "UTC",
                  items: [
                    mockProjectionItem({
                      id: "event-1",
                      kind: "event",
                      title: "Track activity",
                      subtitle: "Fast reps on the oval.",
                      startsAt: `${today}T05:00:00.000Z`,
                      endsAt: `${today}T06:30:00.000Z`,
                    }),
                    mockProjectionItem({
                      id: "event-2",
                      kind: "planned_activity",
                      title: "Tempo Builder",
                      startsAt: `${today}T06:30:00.000Z`,
                      metrics: [
                        mockProjectionMetric("elapsed_duration", "Duration", 3_600, "seconds"),
                        mockProjectionMetric("common_load", "Load", 67.24, "score"),
                        mockProjectionMetric("normalized_intensity", "Intensity", 0.82, "ratio"),
                      ],
                      plan: {
                        id: "plan-1",
                        name: "Tempo Builder",
                        description: "Progressive tempo with a strong finish.",
                        activityCategory: "run",
                        structure: { version: 3, activity_category: "run", segments: [] },
                      },
                    }),
                    mockProjectionItem({
                      id: "activity-1",
                      kind: "completed_activity",
                      title: "Morning miles",
                      startsAt: `${today}T11:00:00.000Z`,
                      metrics: [
                        mockProjectionMetric("distance", "Distance", 8_000, "meters"),
                        mockProjectionMetric("elapsed_duration", "Duration", 2_700, "seconds"),
                        mockProjectionMetric("common_load", "Load", 64, "score"),
                        mockProjectionMetric("normalized_intensity", "Intensity", 0.8, "ratio"),
                      ],
                    }),
                    mockProjectionItem({
                      id: "event-3",
                      kind: "event",
                      title: "Mobility session",
                      subtitle: "Gentle evening mobility.",
                      calendarDate: "2026-03-24",
                      startsAt: "2026-03-24T18:00:00.000Z",
                    }),
                    mockProjectionItem({
                      id: "goal-1",
                      kind: "goal",
                      title: "Spring A Race",
                      calendarDate: today,
                      allDay: true,
                    }),
                  ],
                  truncated: false,
                  truncation: {
                    events: false,
                    completedActivities: false,
                    groupEvents: false,
                    goals: false,
                  },
                },
                get items(): ReturnType<typeof mockProjectionItem>[] {
                  return this.projection.items;
                },
                completedActivities: {
                  items: [
                    {
                      id: "activity-1",
                      name: "Morning miles",
                      scheduled_date: today,
                      started_at: `${today}T11:00:00.000Z`,
                      duration_seconds: 2700,
                      distance_meters: 8000,
                      derived: {
                        observationQuantification: createObservationQuantificationBundleFixture(),
                      },
                    },
                  ],
                  truncated: false,
                },
                goals: {
                  items: [{ id: "goal-1", title: "Spring A Race", target_date: today }],
                  truncated: false,
                },
                selectedGroupEvents: {
                  items: [],
                  truncated: false,
                },
                plannedLoadSummaries: {
                  items: [],
                  truncated: false,
                },
              },
              isError: false,
              isLoading: false,
              refetch: jest.fn(async () => undefined),
            }
          );
        },
      },
    },
  },
}));

const CalendarScreenWithErrorBoundary = require("../calendar").default;
const {
  CALENDAR_PROJECTION_LIMIT,
  DAY_RANGE_BACKWARD,
  DAY_RANGE_EXTENSION,
  DAY_RANGE_FORWARD,
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

function calendarProjectionQuery(input: {
  completedActivities?: unknown[];
  goals?: unknown[];
  items?: unknown[];
  selectedGroupEvents?: unknown[];
}) {
  const projectionItems = [
    ...(input.items ?? []).map((event) => {
      const value = event as Record<string, unknown>;
      return mockProjectionItem({
        id: String(value.id),
        kind: value.event_type === "planned" ? "planned_activity" : "event",
        title: typeof value.title === "string" ? value.title : "Event",
        subtitle: typeof value.description === "string" ? value.description : null,
        calendarDate: typeof value.scheduled_date === "string" ? value.scheduled_date : today,
        startsAt: typeof value.starts_at === "string" ? value.starts_at : null,
        endsAt: typeof value.ends_at === "string" ? value.ends_at : null,
      });
    }),
    ...(input.completedActivities ?? []).map((activity) => {
      const value = activity as Record<string, unknown>;
      const metrics = Array.isArray(value.metrics)
        ? value.metrics
        : [
            typeof value.distance_meters === "number"
              ? mockProjectionMetric("distance", "Distance", value.distance_meters, "meters")
              : null,
            typeof value.duration_seconds === "number"
              ? mockProjectionMetric(
                  "elapsed_duration",
                  "Duration",
                  value.duration_seconds,
                  "seconds",
                )
              : null,
          ].filter(Boolean);
      return mockProjectionItem({
        id: String(value.id),
        kind: "completed_activity",
        title: typeof value.name === "string" ? value.name : "Completed activity",
        calendarDate: typeof value.scheduled_date === "string" ? value.scheduled_date : today,
        startsAt: typeof value.started_at === "string" ? value.started_at : null,
        metrics,
      });
    }),
    ...(input.selectedGroupEvents ?? []).map((groupEvent) => {
      const value = groupEvent as Record<string, unknown>;
      const group = value.group as { name?: string } | undefined;
      const plan = value.selectedActivityPlan as { name?: string } | undefined;
      return mockProjectionItem({
        id: String(value.id),
        kind: "group_event",
        title: typeof value.title === "string" ? value.title : "Group event",
        subtitle: [group?.name, plan?.name].filter(Boolean).join(" · ") || null,
        calendarDate: typeof value.scheduled_date === "string" ? value.scheduled_date : today,
        startsAt: typeof value.starts_at === "string" ? value.starts_at : null,
        metrics: plan
          ? [
              mockProjectionMetric("common_load", "Common Load", 56.25, "score"),
              mockProjectionMetric("normalized_intensity", "Normalized intensity", 0.75, "ratio"),
            ]
          : [],
      });
    }),
    ...(input.goals ?? []).map((goal) => {
      const value = goal as Record<string, unknown>;
      return mockProjectionItem({
        id: String(value.id),
        kind: "goal",
        title: typeof value.title === "string" ? value.title : "Goal",
        calendarDate: typeof value.target_date === "string" ? value.target_date : today,
        allDay: true,
      });
    }),
  ];
  return {
    data: {
      contractVersion: "calendar-projection-v1",
      startDate: "2026-03-02",
      endDateExclusive: "2026-07-21",
      timezone: "UTC",
      items: projectionItems,
      truncated: false,
      truncation: {
        events: false,
        completedActivities: false,
        groupEvents: false,
        goals: false,
      },
    },
    isError: false,
    isLoading: false,
    refetch: jest.fn(async () => undefined),
  };
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
    calendarRangeUseQueryMock.mockReset();
    mockFlatListScrollToIndex.mockClear();
    mockFlatListScrollToOffset.mockClear();
  });

  it("requests one bounded calendar projection for the visible window", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(calendarRangeUseQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: CALENDAR_PROJECTION_LIMIT }),
      expect.not.objectContaining({ getNextPageParam: expect.anything() }),
    );
    expect(calendarRangeUseQueryMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ placeholderData: expect.any(Function) }),
    );
  });

  it("shows loading rather than an error while auth is still initializing", () => {
    mockAuthReady = false;
    calendarRangeUseQueryMock.mockReturnValue({
      data: undefined,
      isError: false,
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
    expect(screen.getByText("Distance 8.0 km · Duration 45 min · Load 64")).toBeTruthy();
    expect(screen.getByTestId("calendar-planned_activity-row-event-2")).toBeTruthy();
    expect(screen.getByText("Duration ~1h · Load 67.2 · Intensity 0.82")).toBeTruthy();
    expect(screen.queryByText(/TSS|\bIF\b/)).toBeNull();
    expect(
      screen.getByTestId("calendar-activity-row-activity-1").props.accessibilityLabel,
    ).toContain("Load 64");
    expect(
      screen.getByTestId("calendar-planned_activity-row-event-2").props.accessibilityLabel,
    ).toContain("Load 67.2 · Intensity 0.82");
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
    calendarRangeUseQueryMock.mockReturnValue(
      calendarProjectionQuery({
        completedActivities: [
          {
            id: "activity-missing-load",
            name: "Easy spin",
            scheduled_date: today,
            started_at: `${today}T13:00:00.000Z`,
            duration_seconds: 1800,
            distance_meters: 9000,
            metrics: [
              mockProjectionMetric("distance", "Distance", 9_000, "meters"),
              mockProjectionMetric("elapsed_duration", "Duration", 1_800, "seconds"),
              mockProjectionMetric("common_load", "Load", null, "score", "unavailable"),
              mockProjectionMetric(
                "normalized_intensity",
                "Intensity",
                null,
                "ratio",
                "unavailable",
              ),
            ],
            derived: {
              observationQuantification: createObservationQuantificationBundleFixture({
                activityCategory: "bike",
                durationSeconds: 1_800,
                status: "unsupported",
              }),
            },
          },
        ],
      }),
    );

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByText("Distance 9.0 km · Duration 30 min · Load unavailable")).toBeTruthy();
    expect(screen.queryByText(/91|0\.93|TSS|\bIF\b/)).toBeNull();
    expect(
      screen.getByTestId("calendar-activity-row-activity-missing-load").props.accessibilityLabel,
    ).toContain("Load unavailable");
  });

  it("marks partial completed common Load and Intensity as incomplete", () => {
    calendarRangeUseQueryMock.mockReturnValue(
      calendarProjectionQuery({
        completedActivities: [
          {
            id: "activity-partial-load",
            name: "Patchy tempo",
            scheduled_date: today,
            started_at: `${today}T13:00:00.000Z`,
            duration_seconds: 3600,
            metrics: [
              mockProjectionMetric("elapsed_duration", "Duration", 3_600, "seconds"),
              mockProjectionMetric("common_load", "Load", 32, "score", "partial"),
              mockProjectionMetric("normalized_intensity", "Intensity", 0.8, "ratio", "partial"),
            ],
            derived: {
              observationQuantification: createObservationQuantificationBundleFixture({
                status: "partial",
              }),
            },
          },
        ],
      }),
    );

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(
      screen.getByText("Duration 60 min · Load 32 · Incomplete · Intensity 0.80 · Incomplete"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("calendar-activity-row-activity-partial-load").props.accessibilityLabel,
    ).toContain("Incomplete");
  });

  it("renders selected group activity-plan common Load without legacy estimates", () => {
    calendarRangeUseQueryMock.mockReturnValue(
      calendarProjectionQuery({
        selectedGroupEvents: [
          {
            id: "group-event-load",
            title: "Club tempo",
            scheduled_date: today,
            starts_at: `${today}T15:00:00.000Z`,
            activity_plan_id: "group-plan-load",
            viewerRsvp: null,
            group: { name: "Tuesday crew" },
            selectedActivityPlan: {
              id: "group-plan-load",
              name: "Group tempo plan",
              activity_category: "run",
              prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
                durationSeconds: 3_600,
                load: 56.25,
              }),
            },
          },
        ],
      }),
    );

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(
      screen.getByText("Tuesday crew · Common Load 56.3 · Normalized intensity 0.75"),
    ).toBeTruthy();
    expect(screen.queryByText(/99|0\.99|TSS|\bIF\b/)).toBeNull();
    expect(
      screen.getByTestId("calendar-group-event-row-group-event-load").props.accessibilityLabel,
    ).toContain("Common Load 56.3 · Normalized intensity 0.75");
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

    expect(calendarRangeUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: "2026-03-02",
        endDateExclusive: "2026-07-21",
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

    expect(screen.getByTestId("calendar-goal-row-goal-1")).toBeTruthy();
    expect(screen.getByText("5:00 AM")).toBeTruthy();
    expect(screen.getByText("Fast reps on the oval.")).toBeTruthy();
    expect(screen.getByTestId("calendar-event-row-event-1")).toBeTruthy();
  });

  it("uses the same agenda row frame for activity plans and normal events", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("calendar-event-row-event-1").props.className).toContain("py-3");
    expect(screen.getByTestId("calendar-event-row-event-1").props.className).toBe(
      screen.getByTestId("calendar-planned_activity-row-event-2").props.className,
    );
  });

  it("renders personal events returned by the bounded projection", () => {
    calendarRangeUseQueryMock.mockReturnValue(
      calendarProjectionQuery({
        items: [
          {
            id: "event-page-2",
            event_type: "custom",
            title: "Projected event",
            scheduled_date: today,
            starts_at: `${today}T16:00:00.000`,
            all_day: false,
          },
        ],
      }),
    );

    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(screen.getByTestId("calendar-event-row-event-page-2")).toBeTruthy();
  });

  it("uses the bounded server projection size", () => {
    renderNative(<CalendarScreenWithErrorBoundary />);

    expect(CALENDAR_PROJECTION_LIMIT).toBe(500);
    expect(calendarRangeUseQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
      expect.not.objectContaining({ getNextPageParam: expect.anything() }),
    );
  });

  it("shows a retryable warning when the calendar projection fails", () => {
    const refetch = jest.fn(async () => undefined);
    calendarRangeUseQueryMock.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch,
    });

    renderNative(<CalendarScreenWithErrorBoundary />);
    fireEvent.press(screen.getByText("Retry"));

    expect(screen.getByText("Unable to load calendar events right now.")).toBeTruthy();
    expect(refetch).toHaveBeenCalled();
  });

  it("extends the end of the day window while loading future days", () => {
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

    expect(calendarRangeUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: "2026-03-02",
        endDateExclusive: "2026-08-20",
      }),
      expect.anything(),
    );
  });

  it("extends the start of the day window while loading past days", () => {
    const rendered = renderNative(<CalendarScreenWithErrorBoundary />);
    const list = getFlatListByTestId(rendered, "calendar-day-list");

    act(() => {
      list.props.onStartReached();
    });

    expect(calendarRangeUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: "2026-01-31",
        endDateExclusive: "2026-07-21",
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
