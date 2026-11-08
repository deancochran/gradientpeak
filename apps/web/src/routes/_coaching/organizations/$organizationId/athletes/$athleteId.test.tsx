// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
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
vi.mock("../../../../../lib/coaching/athletes-server-functions", () => ({
  loadAssignedCoachAthletes: vi.fn(),
  loadCoachAthleteOverview: vi.fn(),
  loadSelectedCoachAthlete: vi.fn(),
}));

import { Route } from "./$athleteId";

afterEach(cleanup);

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
});
