// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calendar: vi.fn(),
  goals: vi.fn(),
  directory: vi.fn(),
  overview: vi.fn(),
  selected: vi.fn(),
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
vi.mock("../../../../../components/coaching/athletes/coach-athlete-goals", () => ({
  CoachAthleteGoals: () => <p>goals</p>,
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

import { Route } from "./$athleteId";

afterEach(() => {
  cleanup();
  state.actorProfileId = "actor-a";
  mocks.calendar.mockReset();
  mocks.goals.mockReset();
  mocks.directory.mockReset();
  mocks.overview.mockReset();
  mocks.selected.mockReset();
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

  it("keeps an authorized overview when the secondary calendar loader rejects", async () => {
    mocks.overview.mockResolvedValue({ status: "granted", title: "overview" });
    mocks.directory.mockResolvedValue({ status: "granted", items: [] });
    mocks.selected.mockResolvedValue({ profileId: state.params.athleteId });
    mocks.calendar.mockRejectedValue(new Error("calendar unavailable"));
    mocks.goals.mockRejectedValue(new Error("goals unavailable"));
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
});
