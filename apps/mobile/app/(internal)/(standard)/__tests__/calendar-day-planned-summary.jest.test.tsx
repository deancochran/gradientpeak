import React from "react";
import { announcePlannedDaySummaryRetryStatus } from "@/components/calendar/plannedDaySummaryAccessibility";
import { createPrescriptionQuantificationBundleFixture } from "@/components/shared/__tests__/activityQuantificationFixture";
import { createHost } from "../../../../test/mock-components";
import { act, fireEvent, renderNative, screen } from "../../../../test/render-native";

let routeDate: string | undefined = "2026-07-27";
const navigateMock = jest.fn();
const listUseQueryMock = jest.fn();
const plannedDaySummaryUseQueryMock = jest.fn();
const summaryRefetchMock = jest.fn(() => Promise.resolve());
const agendaEventsRefetchMock = jest.fn(() => Promise.resolve());
const agendaGroupsRefetchMock = jest.fn(() => Promise.resolve());
let groupEventsQueryState: Record<string, unknown> = { data: { items: [] }, isLoading: false };

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
  useLocalSearchParams: () => ({ date: routeDate }),
}));

jest.mock("@/components/calendar/AgendaCards", () => ({
  __esModule: true,
  EventAgendaCard: ({
    event,
    onPress,
  }: {
    event: { id: string; title: string };
    onPress: () => void;
  }) =>
    React.createElement("EventAgendaCard", {
      accessibilityLabel: event.title,
      onPress,
      testID: `event-card-${event.id}`,
    }),
  GoalAgendaCard: createHost("GoalAgendaCard"),
  PlannedAgendaEventCard: ({
    event,
    onPress,
  }: {
    event: { id: string; title: string };
    onPress: () => void;
  }) =>
    React.createElement("PlannedAgendaEventCard", {
      accessibilityLabel: event.title,
      onPress,
      testID: `planned-event-card-${event.id}`,
    }),
}));
jest.mock("@/components/groups/GroupEventCards", () => ({
  __esModule: true,
  GroupEventCard: createHost("GroupEventCard"),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateMock,
}));
jest.mock("@/lib/hooks/useProfileGoals", () => ({
  __esModule: true,
  useProfileGoals: () => ({ goals: [] }),
}));
jest.mock("@/lib/auth/auth-headers", () => ({
  __esModule: true,
  hasSessionAuthCredentials: () => true,
}));
jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ ready: true, session: { id: "session" }, profile: { planning_timezone: "UTC" } }),
}));
jest.mock("@/lib/stores/calendar-store", () => ({
  __esModule: true,
  useCalendarStore: (selector: (state: unknown) => unknown) =>
    selector({ setActiveDate: jest.fn() }),
}));
jest.mock("@/components/calendar/plannedDaySummaryAccessibility", () => ({
  __esModule: true,
  announcePlannedDaySummaryRetryStatus: jest.fn(),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    events: {
      list: { useQuery: (...args: unknown[]) => listUseQueryMock(...args) },
      plannedDaySummary: {
        useQuery: (...args: unknown[]) => plannedDaySummaryUseQueryMock(...args),
      },
    },
    groups: {
      events: {
        myCalendarGroupEvents: { useQuery: () => groupEventsQueryState },
      },
    },
    activityPlans: { getManyByIds: { useQuery: () => ({ data: { items: [] } }) } },
  },
}));

const CalendarDayScreen = require("../calendar-day").default;

function configureQueries(
  input: { agendaState?: "error" | "loading"; summaryError?: boolean } = {},
) {
  const agendaLoading = input.agendaState === "loading";
  const agendaError = input.agendaState === "error";
  groupEventsQueryState = {
    data: agendaLoading || agendaError ? undefined : { items: [] },
    error: agendaError ? new Error("agenda failed") : null,
    isLoading: agendaLoading,
    refetch: agendaGroupsRefetchMock,
  };
  listUseQueryMock.mockImplementation(() => ({
    data:
      agendaLoading || agendaError
        ? undefined
        : {
            items: [
              {
                id: "cancelled-event",
                event_type: "planned",
                title: "Cancelled Event remains in agenda",
                scheduled_date: "2026-07-27",
                all_day: true,
                activity_plan: null,
                status: "cancelled",
              },
            ],
          },
    isLoading: agendaLoading,
    error: agendaError ? new Error("agenda failed") : null,
    refetch: agendaEventsRefetchMock,
  }));
  plannedDaySummaryUseQueryMock.mockImplementation(() => ({
    data: input.summaryError
      ? undefined
      : {
          date: routeDate,
          source: {
            complete: true,
            eventCount: 1,
            unavailableEstimateCount: 0,
            unavailablePlanCount: 0,
            unlinkedPlanCount: 0,
          },
          summary: {
            eventCount: 1,
            activity_categories: ["bike"],
            totalDurationSeconds: 3_600,
            prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
              activityCategory: "bike",
              load: 50,
            }),
          },
        },
    isError: Boolean(input.summaryError),
    isLoading: false,
    refetch: summaryRefetchMock,
  }));
}

describe("calendar day planned summary boundary", () => {
  beforeEach(() => {
    routeDate = "2026-07-27";
    navigateMock.mockReset();
    summaryRefetchMock.mockClear();
    agendaEventsRefetchMock.mockClear();
    agendaGroupsRefetchMock.mockClear();
    jest.mocked(announcePlannedDaySummaryRetryStatus).mockClear();
    listUseQueryMock.mockReset();
    plannedDaySummaryUseQueryMock.mockReset();
    groupEventsQueryState = { data: { items: [] }, isLoading: false };
  });

  it("uses one exact-day summary query while keeping cancelled Event cards independently actionable", () => {
    configureQueries();
    renderNative(<CalendarDayScreen />);

    expect(plannedDaySummaryUseQueryMock).toHaveBeenCalledWith(
      { date: "2026-07-27" },
      expect.objectContaining({ enabled: true }),
    );
    fireEvent.press(screen.getByTestId("event-card-cancelled-event"));
    expect(navigateMock).toHaveBeenCalled();
    expect(screen.getByText("1 Event")).toBeTruthy();
  });

  it("keeps prior Event cards visible and actionable when the summary fails", async () => {
    configureQueries({ summaryError: true });
    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Planned workload could not be loaded.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("calendar-day-planned-summary-retry"));
    });
    expect(summaryRefetchMock).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("event-card-cancelled-event"));
    expect(navigateMock).toHaveBeenCalled();
  });

  it.each([
    "loading",
    "error",
  ] as const)("keeps a successful summary visible when the agenda is %s", (agendaState) => {
    configureQueries({ agendaState });
    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("1 Event")).toBeTruthy();
    expect(
      screen.getByText(
        agendaState === "loading" ? "Loading day agenda..." : "Unable to load this day right now.",
      ),
    ).toBeTruthy();
  });

  it("does not show prior-day totals while the next day summary is loading", () => {
    configureQueries();
    const rendered = renderNative(<CalendarDayScreen />);
    expect(screen.getByText("50")).toBeTruthy();

    routeDate = "2026-07-28";
    plannedDaySummaryUseQueryMock.mockImplementation(() => ({
      data: {
        date: "2026-07-27",
        source: {
          complete: true,
          eventCount: 1,
          unavailableEstimateCount: 0,
          unavailablePlanCount: 0,
          unlinkedPlanCount: 0,
        },
        summary: {
          eventCount: 1,
          activity_categories: ["bike"],
          totalDurationSeconds: 3_600,
          prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
            activityCategory: "bike",
            load: 50,
          }),
        },
      },
      isError: false,
      isLoading: true,
      refetch: summaryRefetchMock,
    }));
    rendered.rerender(<CalendarDayScreen />);
    expect(screen.queryByText("50")).toBeNull();
    expect(screen.getByText("Loading planned workload...")).toBeTruthy();

    plannedDaySummaryUseQueryMock.mockImplementation(() => ({
      data: {
        date: "2026-07-28",
        source: {
          complete: true,
          eventCount: 1,
          unavailableEstimateCount: 0,
          unavailablePlanCount: 0,
          unlinkedPlanCount: 0,
        },
        summary: {
          eventCount: 1,
          activity_categories: ["run"],
          totalDurationSeconds: 1_800,
          prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
            load: 75,
          }),
        },
      },
      isError: false,
      isLoading: false,
      refetch: summaryRefetchMock,
    }));
    rendered.rerender(<CalendarDayScreen />);
    expect(screen.getByText("75")).toBeTruthy();
  });

  it("makes the localized agenda retry semantic, announced, and re-enabled after deferred success and failure", async () => {
    configureQueries({ agendaState: "error" });
    let resolveEvents: (() => void) | undefined;
    let resolveGroups: (() => void) | undefined;
    agendaEventsRefetchMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEvents = resolve;
        }),
    );
    agendaGroupsRefetchMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveGroups = resolve;
        }),
    );
    renderNative(<CalendarDayScreen />);

    const retryButton = screen.getByTestId("calendar-day-agenda-retry");
    expect(retryButton.props.accessibilityRole).toBe("button");
    expect(retryButton.props.accessibilityHint).toMatch(/Attempts to load/);
    act(() => {
      fireEvent.press(retryButton);
    });
    expect(retryButton.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(retryButton.props.disabled).toBe(true);
    expect(screen.getByText("Retrying day agenda.")).toBeTruthy();
    expect(announcePlannedDaySummaryRetryStatus).toHaveBeenCalledWith("Retrying day agenda.");

    await act(async () => {
      resolveEvents?.();
      resolveGroups?.();
    });
    expect(screen.getByTestId("calendar-day-agenda-retry").props.disabled).toBe(false);
    expect(screen.getByText("Day agenda retry finished.")).toBeTruthy();
    expect(announcePlannedDaySummaryRetryStatus).toHaveBeenCalledWith("Day agenda retry finished.");

    agendaEventsRefetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    agendaGroupsRefetchMock.mockImplementationOnce(() => Promise.resolve());
    await act(async () => {
      fireEvent.press(screen.getByTestId("calendar-day-agenda-retry"));
    });
    expect(screen.getByTestId("calendar-day-agenda-retry").props.disabled).toBe(false);
    expect(screen.getByText("Day agenda retry failed. The error remains available.")).toBeTruthy();
    expect(announcePlannedDaySummaryRetryStatus).toHaveBeenCalledWith(
      "Day agenda retry failed. The error remains available.",
    );
  });

  it("does not enable a fallback calendar or summary query for an invalid route date", () => {
    routeDate = "not-a-day";
    configureQueries();
    renderNative(<CalendarDayScreen />);

    expect(screen.getByText("Choose a valid calendar date to view this day.")).toBeTruthy();
    expect(plannedDaySummaryUseQueryMock).toHaveBeenCalledWith(
      { date: "1970-01-01" },
      expect.objectContaining({ enabled: false }),
    );
    expect(listUseQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ date_from: "1970-01-01", date_to: "1970-01-01" }),
      expect.objectContaining({ enabled: false }),
    );
  });
});
