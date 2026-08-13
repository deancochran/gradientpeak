import React from "react";
import { createScheduledActivityPlanSummary } from "../../../../test/activity-plan-projection-fixture";
import { createCalendarProjectionItem } from "../../../../test/calendar-projection-fixture";
import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const setSelectionMock = jest.fn();
const setActiveDateMock = jest.fn();
const fixedNow = new Date("2026-03-23T12:00:00.000Z");
const [today] = fixedNow.toISOString().split("T");
const tomorrow = "2026-03-24";
let planningTimezone: string | null = "America/New_York";
let paramsState: {
  date?: string;
  trainingPlanId?: string;
  planSuggestionType?: string;
  planSuggestionLoadDelta?: string;
  planSuggestionDescription?: string;
} = { date: today };

type CalendarEvent = {
  id: string;
  completed?: boolean;
  activity_plan?: {
    id: string;
    name: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type StackScreenProps = {
  options?: { headerRight?: () => React.ReactNode; title?: string };
  [key: string]: unknown;
};

type CalendarStoreState = {
  setActiveDate: typeof setActiveDateMock;
};

type AuthStoreState = {
  profile: { planning_timezone: string | null };
  ready: boolean;
  session: { user: { id: string } };
};

type StackScreenNode = {
  props: { options: { title?: string } };
};

type UnsafeTypeQuery = {
  UNSAFE_getByType: (type: "StackScreen") => StackScreenNode;
};

let eventItems: CalendarEvent[] = [];
let groupEventItems: CalendarEvent[] = [];
let completedActivityItems: CalendarEvent[] = [];
const mockEventRefetch = jest.fn(async () => undefined);
const mockEventsUseQuery = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: {
    projection: {
      contractVersion: "calendar-projection-v1",
      from: today,
      to: today,
      timezone: planningTimezone ?? "UTC",
      truncated: false,
      items: [
        ...eventItems.map((event) => {
          const calendarDate = String(event.scheduled_date ?? today);
          const startsAt = String(event.starts_at ?? `${calendarDate}T00:00:00.000Z`);
          const normalizedStartsAt = /(?:Z|[+-]\d\d:\d\d)$/.test(startsAt)
            ? startsAt
            : `${startsAt}Z`;
          const endsAt = typeof event.ends_at === "string" ? event.ends_at : null;
          const normalizedEndsAt =
            endsAt && !/(?:Z|[+-]\d\d:\d\d)$/.test(endsAt) ? `${endsAt}Z` : endsAt;
          const planned = event.event_type === "planned";
          return createCalendarProjectionItem({
            id: event.id,
            kind: planned ? "planned_activity" : "event",
            title: String(event.title ?? "Calendar event"),
            subtitle: typeof event.description === "string" ? event.description : null,
            calendarDate,
            timing: {
              startsAt: normalizedStartsAt,
              endsAt: normalizedEndsAt,
              allDay: Boolean(event.all_day),
              timezone: planningTimezone ?? "UTC",
            },
            status: event.status === "cancelled" ? "cancelled" : "scheduled",
            navigation: { target: "event", href: `/event-detail?id=${event.id}` },
            event: {
              type: planned ? "planned" : "custom",
              trainingPlanId:
                typeof event.training_plan_id === "string" ? event.training_plan_id : null,
            },
            plan: event.activity_plan
              ? createScheduledActivityPlanSummary({
                  id: event.activity_plan.id,
                  name: event.activity_plan.name,
                  description:
                    typeof event.activity_plan.description === "string"
                      ? event.activity_plan.description
                      : null,
                  activityCategory:
                    event.activity_plan.activity_category === "bike" ? "bike" : "run",
                  schedule: {
                    eventId: event.id,
                    calendarDate,
                    startsAt: normalizedStartsAt,
                    allDay: Boolean(event.all_day),
                    status: event.status === "cancelled" ? "cancelled" : "scheduled",
                    trainingPlanId:
                      typeof event.training_plan_id === "string" ? event.training_plan_id : null,
                  },
                })
              : null,
          });
        }),
        ...groupEventItems.map((groupEvent) =>
          createCalendarProjectionItem({
            id: groupEvent.id,
            kind: "group_event",
            title: String(groupEvent.title ?? "Group event"),
            calendarDate: String(groupEvent.scheduled_date ?? today),
            navigation: { target: "group_event", href: `/group-event-detail?id=${groupEvent.id}` },
          }),
        ),
        ...completedActivityItems.map((activity) =>
          createCalendarProjectionItem({
            id: activity.id,
            kind: "completed_activity",
            title: String(activity.name ?? "Completed activity"),
            calendarDate: String(activity.scheduled_date ?? today),
            navigation: { target: "activity", href: `/activity-detail?id=${activity.id}` },
          }),
        ),
        createCalendarProjectionItem({
          id: "goal-1",
          kind: "goal",
          title: "Spring A Race",
          calendarDate: today,
          navigation: { target: "goal", href: "/goal-detail?id=goal-1" },
        }),
      ],
    },
    plannedLoadSummary: null,
  },
  isLoading: false,
  error: null,
  refetch: mockEventRefetch,
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: mockCreateHost("ScrollView"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: StackScreenProps) =>
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

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ArrowUpRight: mockCreateHost("ArrowUpRight"),
  Lock: mockCreateHost("Lock"),
  Play: mockCreateHost("Play"),
  Target: mockCreateHost("Target"),
  Zap: mockCreateHost("Zap"),
}));

jest.mock("@/lib/stores/calendar-store", () => ({
  __esModule: true,
  useCalendarStore: <T,>(selector: (state: CalendarStoreState) => T) =>
    selector({ setActiveDate: setActiveDateMock }),
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: <T,>(selector: (state: AuthStoreState) => T) =>
    selector({
      profile: { planning_timezone: planningTimezone },
      ready: true,
      session: { user: { id: "profile-1" } },
    }),
}));

jest.mock("@/lib/auth/auth-headers", () => ({
  __esModule: true,
  hasSessionAuthCredentials: () => true,
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
      AGENDA_CREATE: (date: string) => ({ pathname: "/agenda-create", params: { date } }),
      PLAN_DETAIL: (id: string) => `/activity-plan-detail?id=${id}`,
      EVENT_DETAIL: (id: string) => `/event-detail?id=${id}`,
      GOAL_DETAIL: (id: string) => `/goal-detail?id=${id}`,
    },
  },
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: mockCreateHost("ActivityPlanCard"),
}));

jest.mock("@/components/shared/ActivityCard", () => ({
  __esModule: true,
  ActivityCard: mockCreateHost("ActivityCard"),
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

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    routes: {
      get: {
        useQuery: () => ({ data: { id: "route-1", name: "River Loop" } }),
      },
    },
    calendar: {
      day: {
        useQuery: (input: unknown, options: unknown) => mockEventsUseQuery(input, options),
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
    jest.clearAllMocks();
    paramsState = { date: today };
    planningTimezone = "America/New_York";
    eventItems = [
      {
        id: "event-1",
        event_type: "planned",
        title: "Tempo Builder",
        training_plan_id: "training-plan-1",
        scheduled_date: today,
        starts_at: `${today}T06:30:00.000`,
        all_day: false,
        completed: false,
        activity_plan: {
          id: "plan-1",
          name: "Tempo Builder",
          description: "Progressive tempo with a strong finish.",
          activity_category: "run",
          estimated_duration: 3600,
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
        starts_at: `${today}T14:00:00.000`,
        ends_at: `${today}T15:00:00.000`,
        all_day: false,
      },
    ];
    groupEventItems = [];
    completedActivityItems = [];
    pushMock.mockReset();
    mockEventsUseQuery.mockClear();
    mockEventRefetch.mockClear();
  });

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("sets the full-date header and persists the selected day", () => {
    const rendered = renderNative(<CalendarDayScreen />);

    expect(setActiveDateMock).toHaveBeenCalledWith(today);
    const stackScreen = (rendered as unknown as UnsafeTypeQuery).UNSAFE_getByType("StackScreen");
    expect(stackScreen.props.options.title).toBe("Today, March 23");
  });

  it("only enables day queries with validated date and planning-timezone boundaries", () => {
    renderNative(<CalendarDayScreen />);

    expect(mockEventsUseQuery).toHaveBeenCalledWith(
      { date: today },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("renders standalone completed activities from the calendar day projection", () => {
    completedActivityItems = [
      {
        id: "activity-1",
        name: "Morning ride",
        scheduled_date: today,
        started_at: `${today}T10:00:00.000Z`,
        distance_meters: 12_000,
        duration_seconds: 3_600,
      },
    ];

    renderNative(<CalendarDayScreen />);

    expect(screen.getByTestId("calendar-day-activity-row-activity-1")).toBeTruthy();
    expect(screen.getByText("3 events")).toBeTruthy();
  });

  it("uses valid dormant inputs without executing queries for an invalid route date", () => {
    paramsState = { date: "not-a-date" };

    renderNative(<CalendarDayScreen />);

    expect(mockEventsUseQuery).toHaveBeenCalledWith(
      { date: "1970-01-01" },
      expect.objectContaining({ enabled: false }),
    );
    expect(screen.getByText("Choose a valid calendar date to view this day.")).toBeTruthy();
    expect(screen.queryByTestId("calendar-day-create-event-button")).toBeNull();
    expect(setActiveDateMock).not.toHaveBeenCalledWith("not-a-date");
  });

  it("opens agenda creation with the selected day prefilled", () => {
    renderNative(<CalendarDayScreen />);

    fireEvent.press(screen.getByTestId("calendar-day-create-event-button"));

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(internal)/(standard)/agenda-create",
      params: { date: today },
    });
  });

  it("shows a plan suggestion and passes it into event creation", () => {
    paramsState = {
      date: tomorrow,
      trainingPlanId: "training-plan-1",
      planSuggestionType: "add_load",
      planSuggestionLoadDelta: "75",
      planSuggestionDescription: "Add load to close the readiness gap.",
    };

    renderNative(<CalendarDayScreen />);

    expect(screen.getByTestId("calendar-day-plan-suggestion")).toBeTruthy();
    expect(screen.getByText("Plan suggestion")).toBeTruthy();
    expect(screen.getByText("Add about ~75 Load")).toBeTruthy();
    expect(screen.getByText("Add load to close the readiness gap.")).toBeTruthy();

    fireEvent.press(screen.getByTestId("calendar-day-create-from-plan-suggestion"));

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(internal)/(standard)/agenda-create",
      params: {
        date: tomorrow,
        planSuggestionType: "add_load",
        planSuggestionLoadDelta: "75",
      },
    });
  });

  it("does not show scheduled session candidates for a reduce-load suggestion", () => {
    paramsState = {
      date: today,
      trainingPlanId: "training-plan-1",
      planSuggestionType: "reduce_load",
      planSuggestionLoadDelta: "-40",
      planSuggestionDescription: "Reduce load to protect readiness.",
    };

    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Reduce about ~40 Load")).toBeTruthy();
    expect(screen.getByText("Reduce load to protect readiness.")).toBeTruthy();
    expect(screen.getByText("Create adjustment note")).toBeTruthy();
    expect(screen.queryByTestId("calendar-day-reduce-load-candidates")).toBeNull();
    expect(screen.queryByText("Scheduled sessions to review")).toBeNull();
  });

  it("shows the canonical planned activity row and opens event detail on tap", () => {
    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Goal")).toBeTruthy();
    expect(screen.getByText("Spring A Race")).toBeTruthy();
    expect(screen.getByText("Tempo Builder")).toBeTruthy();
    fireEvent.press(screen.getByTestId("calendar-day-planned_activity-row-event-1"));

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
    expect(screen.getByTestId("calendar-day-event-row-event-2")).toBeTruthy();
  });

  it("keeps planned agenda items scan-first without a quick action button", () => {
    renderNative(<CalendarDayScreen />);

    expect(screen.queryByTestId("schedule-event-action-event-1")).toBeNull();
  });

  it("renders recurring events through the canonical event row", () => {
    eventItems = [
      {
        id: "event-recurring",
        event_type: "custom",
        title: "Team sync",
        scheduled_date: today,
        starts_at: `${today}T16:00:00.000`,
        all_day: false,
        recurrence_rule: "FREQ=WEEKLY;UNTIL=20260530T235959Z",
      },
    ];

    renderNative(<CalendarDayScreen />);

    expect(screen.getByTestId("calendar-day-event-row-event-recurring")).toBeTruthy();
  });

  it("shows goal anchors even when the day has no events", () => {
    eventItems = [];

    renderNative(<CalendarDayScreen />);

    expect(screen.getByTestId("calendar-day-goal-anchor")).toBeTruthy();
    expect(screen.getByText("No events scheduled")).toBeTruthy();
    expect(screen.queryByText("Rest day")).toBeNull();
  });

  it("keeps custom events visible without inferring a rest day", () => {
    paramsState = { date: tomorrow };
    eventItems = [
      {
        id: "event-custom-only",
        event_type: "custom",
        title: "Dinner reservation",
        description: "Family night out.",
        location: "Downtown",
        scheduled_date: tomorrow,
        starts_at: `${tomorrow}T19:00:00.000`,
        ends_at: `${tomorrow}T20:30:00.000`,
        all_day: false,
      },
    ];

    renderNative(<CalendarDayScreen />);

    expect(screen.queryByTestId(`calendar-rest-day-state-${tomorrow}`)).toBeNull();
    expect(screen.queryByText("Rest day")).toBeNull();
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
