// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "./$date";

const mocks = vi.hoisted(() => ({
  eventsError: false,
  eventsLoading: false,
  events: [] as Array<Record<string, unknown>>,
  plannedDaySummary: undefined as Record<string, unknown> | undefined,
  summaryError: false,
  summaryLoading: false,
  summaryRefetch: vi.fn(),
  summaryInputs: [] as Array<Record<string, unknown>>,
  linkClick: vi.fn(),
  routeDate: "2026-07-27",
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ date: mocks.routeDate }),
    useSearch: () => ({ month: "2026-07", view: "month" }),
  }),
  notFound: () => new Error("not found"),
  Link: ({
    children,
    params,
    to,
  }: {
    children: React.ReactNode;
    params?: { eventId?: string };
    to: string;
  }) => (
    <a
      href={params?.eventId ? `/calendar/events/${params.eventId}` : to}
      onClick={(event) => {
        event.preventDefault();
        mocks.linkClick();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("../../../../lib/api/client", () => ({
  api: {
    profiles: { get: { useQuery: () => ({ data: { id: "profile-1" } }) } },
    goals: { list: { useQuery: () => ({ data: { items: [] }, isError: false }) } },
    calendar: {
      day: {
        useQuery: (input: Record<string, unknown>) => {
          mocks.summaryInputs.push(input);
          return {
            data: { items: mocks.events, plannedLoadSummary: mocks.plannedDaySummary },
            isError: mocks.eventsError || mocks.summaryError,
            isLoading: mocks.eventsLoading || mocks.summaryLoading,
            error: mocks.eventsError || mocks.summaryError ? new Error("Calendar failed") : null,
            refetch: mocks.summaryRefetch,
          };
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.eventsError = false;
  mocks.eventsLoading = false;
  mocks.events = [];
  mocks.plannedDaySummary = undefined;
  mocks.summaryError = false;
  mocks.summaryLoading = false;
  mocks.summaryInputs = [];
  mocks.routeDate = "2026-07-27";
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("CalendarDayPage planned workload", () => {
  const CalendarDayPage = (Route as unknown as { component: React.ComponentType }).component;

  it("uses the canonical day route input and leaves each agenda Event independent", () => {
    mocks.events = [
      { id: "bike-event", starts_at: "2026-07-27T08:00:00.000Z", title: "Bike intervals" },
      {
        id: "cancelled-event",
        starts_at: "2026-07-27T10:00:00.000Z",
        status: "cancelled",
        title: "Cancelled run",
      },
    ];
    mocks.plannedDaySummary = {
      summary: {
        eventCount: 1,
        activity_categories: ["bike"],
        totalDurationSeconds: 3_600,
        quantification: {},
        commonLoad: {},
      },
      source: {
        complete: true,
        eventCount: 1,
        unavailableEstimateCount: 0,
        unavailablePlanCount: 0,
        unlinkedPlanCount: 0,
      },
    };

    render(<CalendarDayPage />);

    expect(mocks.summaryInputs).toEqual([{ date: "2026-07-27" }]);
    expect(screen.getByText("1 Event")).toBeTruthy();
    expect(screen.getByText("Bike intervals")).toBeTruthy();
    expect(screen.getByText("Cancelled run")).toBeTruthy();
    expect(screen.getByText("2 scheduled events")).toBeTruthy();
  });

  it("keeps loaded Event cards visible when the complete summary endpoint fails and retries it separately", () => {
    mocks.events = [{ id: "event-1", starts_at: "2026-07-27T08:00:00.000Z", title: "Run easy" }];
    mocks.summaryError = true;

    render(<CalendarDayPage />);

    expect(screen.getByText("Planned workload could not be loaded.")).toBeTruthy();
    expect(screen.getByText("Run easy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry planned workload" }));
    expect(mocks.summaryRefetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("No planned Events for this day.")).toBeNull();
  });

  it("keeps Event detail links keyboard-focusable and clickable when the summary fails", () => {
    mocks.events = [{ id: "event-1", starts_at: "2026-07-27T08:00:00.000Z", title: "Run easy" }];
    mocks.summaryError = true;

    render(<CalendarDayPage />);

    const eventLink = screen.getByRole("link", { name: /Run easy/i });
    eventLink.focus();
    expect(document.activeElement).toBe(eventLink);
    expect(eventLink.getAttribute("href")).toBe("/calendar/events/event-1");
    fireEvent.click(eventLink);
    expect(mocks.linkClick).toHaveBeenCalledOnce();
  });

  it("rejects nonexistent route dates before any day query runs", () => {
    mocks.routeDate = "2026-02-30";
    const beforeLoad = (
      Route as unknown as { beforeLoad: (input: { params: { date: string } }) => void }
    ).beforeLoad;

    expect(() => beforeLoad({ params: { date: mocks.routeDate } })).toThrow("not found");
    expect(mocks.summaryInputs).toEqual([]);
  });
});
