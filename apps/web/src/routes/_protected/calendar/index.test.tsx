// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "./index";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  navigate: vi.fn(),
  onViewChange: undefined as ((value: string) => void) | undefined,
  query: undefined as Record<string, unknown> | undefined,
  rangeInputs: [] as Array<Record<string, unknown>>,
  refetch: vi.fn(),
  search: { date: "2026-11-02", month: "2026-12", view: "month" } as Record<string, string>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => mocks.search,
  }),
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("@repo/api/react", () => ({
  usePlannedSessionMutations: () => ({ cancel: { isPending: false, mutate: mocks.cancel } }),
}));

vi.mock("../../../lib/api/client", () => ({
  api: {
    calendar: {
      range: {
        useQuery: (input: Record<string, unknown>) => {
          mocks.rangeInputs.push(input);
          return mocks.query;
        },
      },
    },
  },
}));

vi.mock("../../../components/calendar/calendar-projection-card", () => ({
  CalendarProjectionCard: ({ item }: { item: { title: string } }) => <p>{item.title}</p>,
}));
vi.mock("../../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("@repo/ui/components/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ComponentProps<"button"> & { asChild?: boolean }) =>
    asChild ? children : <button {...props}>{children}</button>,
}));
vi.mock("@repo/ui/components/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@repo/ui/components/tabs", () => ({
  Tabs: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange: (value: string) => void;
  }) => {
    mocks.onViewChange = onValueChange;
    return <div>{children}</div>;
  },
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock("@repo/ui/lib/cn", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

function item({
  date,
  id,
  planned = false,
  title,
}: {
  date: string;
  id: string;
  planned?: boolean;
  title: string;
}) {
  return {
    calendarDate: date,
    id,
    kind: planned ? "planned_activity" : "event",
    metrics: [],
    navigation: { href: `/calendar/events/${id}`, target: "event" },
    plannedSession: planned
      ? {
          id,
          lifecycle: { status: "scheduled" },
          planningDate: date,
          profileId: "profile-1",
          sessionRevision: 1,
        }
      : null,
    status: "scheduled",
    subtitle: null,
    timing: { allDay: true, endsAt: null, startsAt: null, timezone: "UTC" },
    title,
  };
}

function query(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      items: [],
      truncation: {
        completedActivities: false,
        events: false,
        goals: false,
        groupEvents: false,
        plannedSessions: false,
      },
    },
    isError: false,
    isLoading: false,
    refetch: mocks.refetch,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.cancel.mockReset();
  mocks.navigate.mockReset();
  mocks.onViewChange = undefined;
  mocks.rangeInputs = [];
  mocks.refetch.mockReset();
  mocks.search = { date: "2026-11-02", month: "2026-12", view: "month" };
  mocks.query = query();
});
afterEach(cleanup);

describe("CalendarIndexPage", () => {
  const CalendarIndexPage = (Route as unknown as { component: React.ComponentType }).component;

  it("queries the entire visible grid while restricting month agenda and session actions to its month", () => {
    mocks.query = query({
      data: {
        items: [
          item({ date: "2026-11-29", id: "adjacent", planned: true, title: "Adjacent plan" }),
          item({ date: "2026-12-01", id: "current", planned: true, title: "December plan" }),
        ],
        truncation: query().data.truncation,
      },
    });

    render(<CalendarIndexPage />);

    expect(mocks.rangeInputs).toContainEqual({
      endDateExclusive: "2027-01-10",
      includeAdhoc: true,
      limit: 500,
      startDate: "2026-11-29",
    });
    expect(screen.getAllByText("December plan").length).toBeGreaterThan(0);
    expect(screen.queryByText("Adjacent plan")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel session" }));
    expect(mocks.cancel).toHaveBeenCalledWith({
      expectedRevision: 1,
      profileId: "profile-1",
      reason: "user_requested",
      sessionId: "current",
    });
  });

  it("keeps initial query failures distinct from empty and preserves cached calendar results", () => {
    mocks.query = query({ data: undefined, isError: true });
    const { rerender } = render(<CalendarIndexPage />);

    expect(
      screen.getByText(
        "Personal planned sessions are unavailable until the calendar can be loaded.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("The agenda is unavailable until the calendar can be loaded."),
    ).toBeTruthy();
    expect(screen.queryByText("No personal planned sessions in this period.")).toBeNull();
    expect(screen.queryByText("No events scheduled this month.")).toBeNull();

    mocks.query = query({
      data: {
        items: [item({ date: "2026-12-01", id: "cached", title: "Cached event" })],
        truncation: query().data.truncation,
      },
      isError: true,
    });
    rerender(<CalendarIndexPage />);
    expect(screen.getByText("Cached event")).toBeTruthy();
  });

  it("anchors a stale selected date to the visible month when changing to week view and alerts for every truncation source", () => {
    mocks.query = query({
      data: { items: [], truncation: { ...query().data.truncation, goals: true } },
    });
    render(<CalendarIndexPage />);

    act(() => mocks.onViewChange?.("week"));
    expect(mocks.navigate).toHaveBeenCalledWith({
      search: { date: "2026-12-01", month: "2026-12", view: "week" },
      to: "/calendar",
    });
    expect(screen.getByText(/This calendar period could not be shown completely/i)).toBeTruthy();
  });
});
