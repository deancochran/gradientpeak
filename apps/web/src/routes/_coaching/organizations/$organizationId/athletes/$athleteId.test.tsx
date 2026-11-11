// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calendar: vi.fn(),
  goals: vi.fn(),
  directory: vi.fn(),
  overview: vi.fn(),
  selected: vi.fn(),
  zones: vi.fn(),
}));
const state = vi.hoisted(() => ({
  actorProfileId: "actor-a",
  loaderData: {} as Record<string, unknown>,
  pathname:
    "/organizations/11111111-1111-4111-8111-111111111111/athletes/22222222-2222-4222-8222-222222222222",
  params: {
    athleteId: "22222222-2222-4222-8222-222222222222",
    organizationId: "11111111-1111-4111-8111-111111111111",
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/athletes">{children}</a>,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: state.pathname } }),
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.loaderData,
    useParams: () => state.params,
    useRouteContext: () => ({ actorProfileId: state.actorProfileId }),
  }),
}));
vi.mock("@repo/ui/components/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock("../../../../../components/coaching/athletes/athlete-workspace-switcher", () => ({
  AthleteWorkspaceSwitcher: () => <p>workspace switcher</p>,
}));
vi.mock("../../../../../components/coaching/athletes/coach-athlete-overview", () => ({
  CoachAthleteOverview: ({ athleteId }: { athleteId: string }) => <p>overview for {athleteId}</p>,
}));
vi.mock("../../../../../components/coaching/athletes/coach-activity-plan-publication", () => ({
  CoachActivityPlanPublication: () => <p>activityPlan publication</p>,
}));
vi.mock("../../../../../components/coaching/athletes/coach-athlete-goals", () => ({
  CoachAthleteGoals: () => <p>goals</p>,
}));
vi.mock("../../../../../components/coaching/athletes/coach-athlete-calendar", () => ({
  CoachAthleteCalendar: ({ result }: { result: { status: string } }) => (
    <p data-testid="calendar">calendar {result.status}</p>
  ),
}));
vi.mock("../../../../../components/coaching/athletes/coach-athlete-zones-section", () => ({
  CoachAthleteZonesSection: ({
    snapshot,
  }: {
    snapshot: {
      actorId: string;
      athleteProfileId: string;
      organizationId: string;
      revision: string;
      state: { kind: string };
    };
  }) => {
    if (snapshot.state.kind === "failed")
      return (
        <div data-testid="zones">
          <p role="alert">Bike zones could not be loaded.</p>
          <button type="button">Retry bike zones</button>
        </div>
      );
    return (
      <p
        data-actor={snapshot.actorId}
        data-athlete={snapshot.athleteProfileId}
        data-organization={snapshot.organizationId}
        data-revision={snapshot.revision}
        data-state={snapshot.state.kind}
        data-testid="zones"
      >
        zones {snapshot.state.kind}
      </p>
    );
  },
}));
vi.mock("../../../../../lib/coaching/athletes-server-functions", () => ({
  loadAssignedCoachAthletes: mocks.directory,
  loadCoachAthleteOverview: mocks.overview,
  loadSelectedCoachAthlete: mocks.selected,
}));
vi.mock("../../../../../lib/coaching/athlete-calendar-server-functions", () => ({
  currentCalendarWeek: () => ({ startDate: "2026-03-08", endDateExclusive: "2026-03-15" }),
  loadCoachAthleteCalendar: mocks.calendar,
}));
vi.mock("../../../../../lib/coaching/athlete-goals-server-functions", () => ({
  loadCoachAthleteGoals: mocks.goals,
}));
vi.mock("../../../../../lib/coaching/athlete-zones-server-functions", () => ({
  loadCoachAthleteBikeZones: mocks.zones,
}));

import { Route } from "./$athleteId";

beforeEach(() => {
  mocks.goals.mockResolvedValue({ status: "forbidden" });
  mocks.zones.mockResolvedValue({ status: "forbidden" });
});

afterEach(() => {
  cleanup();
  state.actorProfileId = "actor-a";
  state.loaderData = {};
  state.params = {
    athleteId: "22222222-2222-4222-8222-222222222222",
    organizationId: "11111111-1111-4111-8111-111111111111",
  };
  state.pathname =
    "/organizations/11111111-1111-4111-8111-111111111111/athletes/22222222-2222-4222-8222-222222222222";
  mocks.calendar.mockReset();
  mocks.goals.mockReset();
  mocks.directory.mockReset();
  mocks.overview.mockReset();
  mocks.selected.mockReset();
  mocks.zones.mockReset();
});

describe("coach athlete workspace route", () => {
  it("does not render a delayed prior athlete response after the selected athlete changes", () => {
    state.params = {
      athleteId: "33333333-3333-4333-8333-333333333333",
      organizationId: "11111111-1111-4111-8111-111111111111",
    };
    state.loaderData = {
      athleteId: "22222222-2222-4222-8222-222222222222",
      organizationId: "11111111-1111-4111-8111-111111111111",
      overview: { status: "granted" },
      directory: { status: "granted", items: [] },
      identity: { profileId: "22222222-2222-4222-8222-222222222222" },
    };
    state.pathname =
      "/organizations/11111111-1111-4111-8111-111111111111/athletes/33333333-3333-4333-8333-333333333333";

    const route = Route as unknown as { component: () => React.ReactNode };
    render(route.component());

    expect(screen.getByRole("status").textContent).toContain("Loading athlete workspace");
    expect(screen.queryByText(/overview for/)).toBeNull();
  });

  it("does not render workspace data while the live location is still the prior athlete", () => {
    state.params = {
      athleteId: "33333333-3333-4333-8333-333333333333",
      organizationId: "11111111-1111-4111-8111-111111111111",
    };
    state.loaderData = {
      athleteId: "33333333-3333-4333-8333-333333333333",
      organizationId: "11111111-1111-4111-8111-111111111111",
      overview: { status: "granted" },
      directory: { status: "granted", items: [] },
      identity: { profileId: "33333333-3333-4333-8333-333333333333" },
    };
    state.pathname =
      "/organizations/11111111-1111-4111-8111-111111111111/athletes/22222222-2222-4222-8222-222222222222";

    const route = Route as unknown as { component: () => React.ReactNode };
    render(route.component());

    expect(screen.getByRole("status").textContent).toContain("Loading athlete workspace");
    expect(screen.queryByText(/overview for/)).toBeNull();
  });

  it("does not render cached workspace data for a different actor", () => {
    state.actorProfileId = "actor-b";
    state.loaderData = {
      actorProfileId: "actor-a",
      athleteId: state.params.athleteId,
      organizationId: state.params.organizationId,
    };
    const route = Route as unknown as { component: () => React.ReactNode };
    render(route.component());
    expect(screen.getByRole("status").textContent).toContain("Loading athlete workspace");
  });

  it("does not render realistic prior granted zones after the actor changes", () => {
    state.actorProfileId = "actor-b";
    state.loaderData = {
      actorProfileId: "actor-a",
      athleteId: state.params.athleteId,
      organizationId: state.params.organizationId,
      overview: { status: "granted" },
      directory: { status: "granted", items: [] },
      identity: { profileId: state.params.athleteId },
      calendar: { status: "granted", events: [], nextCursor: null },
      calendarRange: { startDate: "2026-03-08", endDateExclusive: "2026-03-15" },
      zones: {
        actorId: "actor-a",
        athleteProfileId: state.params.athleteId,
        organizationId: state.params.organizationId,
        revision: "prior-revision",
        state: {
          kind: "granted",
          result: { status: "granted", zones: { power: { source: { value: 237.5 } } } },
        },
      },
    };
    const route = Route as unknown as { component: () => React.ReactNode };
    render(route.component());

    expect(screen.getByRole("status").textContent).toContain("Loading athlete workspace");
    expect(screen.queryByTestId("zones")).toBeNull();
    expect(screen.queryByText("237.5")).toBeNull();
  });

  it("keeps an authorized overview when the secondary calendar loader rejects", async () => {
    mocks.overview.mockResolvedValue({ status: "granted", title: "overview" });
    mocks.directory.mockResolvedValue({ status: "granted", items: [] });
    mocks.selected.mockResolvedValue({ profileId: state.params.athleteId });
    mocks.calendar.mockRejectedValue(new Error("calendar unavailable"));
    mocks.goals.mockRejectedValue(new Error("goals unavailable"));
    mocks.zones.mockResolvedValue({ status: "forbidden" });
    const route = Route as unknown as {
      loader: (input: {
        context: { actorProfileId: string };
        params: typeof state.params;
      }) => Promise<Record<string, unknown>>;
    };
    const loaded = await route.loader({
      context: { actorProfileId: "actor-a" },
      params: state.params,
    });
    expect(loaded.overview).toEqual({ status: "granted", title: "overview" });
    expect(loaded.calendar).toEqual({ status: "error" });
    expect(loaded.goals).toEqual({ status: "error" });
    expect(typeof loaded.goalsRevision).toBe("string");
    expect(loaded.actorProfileId).toBe("actor-a");
  });

  it("binds zones to the actor, organization, athlete, and a fresh loader revision", async () => {
    mocks.overview.mockResolvedValue({ status: "granted", title: "overview" });
    mocks.directory.mockResolvedValue({ status: "granted", items: [] });
    mocks.selected.mockResolvedValue({ profileId: state.params.athleteId });
    mocks.calendar.mockResolvedValue({ status: "granted", events: [], nextCursor: null });
    mocks.zones.mockResolvedValue({ status: "granted", zones: {} });
    const route = Route as unknown as {
      loader: (input: {
        context: { actorProfileId: string };
        params: typeof state.params;
      }) => Promise<{ zones: { revision: string; state: { kind: string } } }>;
    };

    const [first, second] = await Promise.all([
      route.loader({ context: { actorProfileId: "actor-a" }, params: state.params }),
      route.loader({ context: { actorProfileId: "actor-a" }, params: state.params }),
    ]);
    expect(first.zones.state).toEqual({
      kind: "granted",
      result: { status: "granted", zones: {} },
    });
    expect(first.zones).toMatchObject({
      actorId: "actor-a",
      athleteProfileId: state.params.athleteId,
      organizationId: state.params.organizationId,
    });
    expect(first.zones.revision).not.toBe(second.zones.revision);
  });

  it("keeps overview, directory, and calendar available when the initial zones load rejects", async () => {
    mocks.overview.mockResolvedValue({ status: "granted", title: "overview" });
    mocks.directory.mockResolvedValue({ status: "granted", items: [] });
    mocks.selected.mockResolvedValue({ profileId: state.params.athleteId });
    mocks.calendar.mockResolvedValue({ status: "granted", events: [], nextCursor: null });
    mocks.zones.mockRejectedValue(new Error("zones unavailable"));
    const route = Route as unknown as {
      loader: (input: {
        context: { actorProfileId: string };
        params: typeof state.params;
      }) => Promise<Record<string, unknown>>;
    };

    const loaded = await route.loader({
      context: { actorProfileId: "actor-a" },
      params: state.params,
    });
    expect(loaded.overview).toEqual({ status: "granted", title: "overview" });
    expect(loaded.directory).toEqual({ status: "granted", items: [] });
    expect(loaded.calendar).toEqual({ status: "granted", events: [], nextCursor: null });
    expect(loaded.zones).toMatchObject({ state: { kind: "failed" } });
  });

  it("renders independently consented calendar and denied zones without redacting the calendar", () => {
    state.loaderData = {
      actorProfileId: "actor-a",
      athleteId: state.params.athleteId,
      organizationId: state.params.organizationId,
      overview: { status: "granted" },
      directory: { status: "granted", items: [] },
      identity: { profileId: state.params.athleteId },
      calendar: { status: "granted", events: [], nextCursor: null },
      calendarRange: { startDate: "2026-03-08", endDateExclusive: "2026-03-15" },
      zones: {
        actorId: "actor-a",
        athleteProfileId: state.params.athleteId,
        organizationId: state.params.organizationId,
        revision: "fresh-revision",
        state: { kind: "denied" },
      },
    };
    const route = Route as unknown as { component: () => React.ReactNode };
    render(route.component());

    expect(screen.getByTestId("calendar").textContent).toContain("calendar granted");
    const zones = screen.getByTestId("zones");
    expect(zones.getAttribute("data-state")).toBe("denied");
    expect(zones.getAttribute("data-actor")).toBe("actor-a");
    expect(zones.getAttribute("data-organization")).toBe(state.params.organizationId);
    expect(zones.getAttribute("data-athlete")).toBe(state.params.athleteId);
  });

  it("redacts calendar and zones when selected athlete identity is unavailable", () => {
    state.loaderData = {
      actorProfileId: "actor-a",
      athleteId: state.params.athleteId,
      organizationId: state.params.organizationId,
      overview: { status: "granted" },
      directory: { status: "granted", items: [] },
      identity: null,
      calendar: { status: "granted", events: [], nextCursor: null },
      calendarRange: { startDate: "2026-03-08", endDateExclusive: "2026-03-15" },
      zones: {
        actorId: "actor-a",
        athleteProfileId: state.params.athleteId,
        organizationId: state.params.organizationId,
        revision: "granted-prior-to-identity-denial",
        state: { kind: "granted", result: { status: "granted", zones: {} } },
      },
    };
    const route = Route as unknown as { component: () => React.ReactNode };
    render(route.component());

    expect(screen.getByTestId("calendar").textContent).toContain("calendar forbidden");
    expect(screen.getByTestId("zones").getAttribute("data-state")).toBe("denied");
  });

  it("keeps overview and calendar rendered when zones fail and exposes generic retry UI", () => {
    state.loaderData = {
      actorProfileId: "actor-a",
      athleteId: state.params.athleteId,
      organizationId: state.params.organizationId,
      overview: { status: "granted" },
      directory: { status: "granted", items: [] },
      identity: { profileId: state.params.athleteId },
      calendar: { status: "granted", events: [], nextCursor: null },
      calendarRange: { startDate: "2026-03-08", endDateExclusive: "2026-03-15" },
      zones: {
        actorId: "actor-a",
        athleteProfileId: state.params.athleteId,
        organizationId: state.params.organizationId,
        revision: "failed-revision",
        state: { kind: "failed" },
      },
    };
    const route = Route as unknown as { component: () => React.ReactNode };
    render(route.component());

    expect(screen.getByText(`overview for ${state.params.athleteId}`)).toBeTruthy();
    expect(screen.getByTestId("calendar").textContent).toContain("calendar granted");
    expect(screen.getByRole("alert").textContent).toContain("Bike zones could not be loaded.");
    expect(screen.getByRole("button", { name: "Retry bike zones" })).toBeTruthy();
  });

  it("recovers from denied zones only with a fresh loader revision", () => {
    const base = {
      actorProfileId: "actor-a",
      athleteId: state.params.athleteId,
      organizationId: state.params.organizationId,
      overview: { status: "granted" },
      directory: { status: "granted", items: [] },
      identity: { profileId: state.params.athleteId },
      calendar: { status: "granted", events: [], nextCursor: null },
      calendarRange: { startDate: "2026-03-08", endDateExclusive: "2026-03-15" },
    };
    state.loaderData = {
      ...base,
      zones: {
        actorId: "actor-a",
        athleteProfileId: state.params.athleteId,
        organizationId: state.params.organizationId,
        revision: "denied-revision",
        state: { kind: "denied" },
      },
    };
    const route = Route as unknown as { component: () => React.ReactNode };
    const rendered = render(route.component());
    expect(screen.getByTestId("zones").getAttribute("data-state")).toBe("denied");

    state.loaderData = {
      ...base,
      zones: {
        actorId: "actor-a",
        athleteProfileId: state.params.athleteId,
        organizationId: state.params.organizationId,
        revision: "granted-revision",
        state: { kind: "granted", result: { status: "granted", zones: {} } },
      },
    };
    rendered.rerender(route.component());

    const zones = screen.getByTestId("zones");
    expect(zones.getAttribute("data-state")).toBe("granted");
    expect(zones.getAttribute("data-revision")).toBe("granted-revision");
  });
});
