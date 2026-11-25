// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...props
  }: {
    children: ReactNode;
    className?: string;
    params?: unknown;
    search?: unknown;
    to: string;
  }) => (
    <a className={props.className} href={props.to}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
}));

import { AssignedAthleteDirectory } from "./assigned-athlete-directory";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AssignedAthleteDirectory", () => {
  it("uses the shared search field while preserving submitted URL search semantics", () => {
    render(
      <AssignedAthleteDirectory
        organizationId="organization-1"
        page={{ hasMore: false, items: [], nextCursor: null }}
        search={null}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search assigned athletes" }), {
      target: { value: "  Avery  " },
    });
    const form = screen
      .getByRole("searchbox", { name: "Search assigned athletes" })
      .closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/organizations/$organizationId/athletes",
      params: { organizationId: "organization-1" },
      search: { q: "Avery", cursor: undefined },
    });
    expect(screen.getByText("No assigned athletes match this search.")).toBeTruthy();
  });

  it("keeps long identities and their supporting usernames in the shared summary hierarchy", () => {
    const displayName = "Avery ".repeat(30).trim();
    render(
      <AssignedAthleteDirectory
        organizationId="organization-1"
        page={{
          hasMore: false,
          items: [{ profileId: "athlete-1", displayName, username: "avery-carter" }],
          nextCursor: null,
        }}
        search={null}
      />,
    );

    expect(screen.getByRole("link", { name: new RegExp(displayName) })).toBeTruthy();
    expect(screen.getByText("@avery-carter")).toBeTruthy();
  });

  it("keeps shared facts explicit rather than turning unavailable evidence into zero", () => {
    render(
      <AssignedAthleteDirectory
        organizationId="organization-1"
        page={{
          hasMore: false,
          items: [
            {
              profileId: "athlete-1",
              displayName: "Avery",
              username: "avery",
              metrics: { status: "available", freshness: "stale" },
              activities: {
                status: "unshared",
                planningTimezone: null,
                rangeStartDate: null,
                rangeEndDate: null,
                points: [],
              },
              goals: { status: "unavailable", items: [] },
            },
          ],
          nextCursor: null,
        }}
        search={null}
      />,
    );

    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getAllByText("Unshared")).toHaveLength(1);
    expect(screen.getAllByText("Unavailable")).toHaveLength(1);
    expect(screen.queryByText("0.0")).toBeNull();
  });

  it("renders the existing chart from actual recorded points with missing dates left absent", () => {
    render(
      <AssignedAthleteDirectory
        organizationId="organization-1"
        page={{
          hasMore: false,
          items: [
            {
              profileId: "athlete-1",
              displayName: "Avery",
              username: "avery",
              metrics: { status: "available", freshness: "fresh" },
              activities: {
                status: "available",
                planningTimezone: "America/Los_Angeles",
                rangeStartDate: "2026-11-01",
                rangeEndDate: "2026-11-03",
                qualifier: "fresh",
                points: [
                  {
                    date: "2026-11-01",
                    dailyLoad: 12,
                    fitness: 30,
                    fatigue: 25,
                    form: 5,
                    coverageStatus: "complete",
                    omittedActivityCount: 0,
                  },
                  {
                    date: "2026-11-03",
                    dailyLoad: 18,
                    fitness: 31,
                    fatigue: 27,
                    form: 4,
                    coverageStatus: "complete",
                    omittedActivityCount: 0,
                  },
                ],
              },
              goals: { status: "unavailable", items: [] },
            },
          ],
          nextCursor: null,
        }}
        search={null}
      />,
    );

    expect(screen.getByText("Recent training state")).toBeTruthy();
    expect(screen.getByText(/2 recorded days/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /Fitness Recorded: 2 values/ })).toBeTruthy();
  });

  it("shows stale and partial coverage together when both are present", () => {
    render(
      <AssignedAthleteDirectory
        organizationId="organization-1"
        page={{
          hasMore: false,
          items: [
            {
              profileId: "athlete-1",
              displayName: "Avery",
              username: "avery",
              metrics: { status: "available", freshness: "stale" },
              activities: {
                status: "available",
                planningTimezone: "UTC",
                rangeStartDate: "2026-11-01",
                rangeEndDate: "2026-11-01",
                qualifier: "stale",
                points: [
                  {
                    date: "2026-11-01",
                    dailyLoad: 12,
                    fitness: 30,
                    fatigue: 25,
                    form: 5,
                    coverageStatus: "partial",
                    omittedActivityCount: 2,
                  },
                ],
              },
              goals: { status: "unavailable", items: [] },
            },
          ],
          nextCursor: null,
        }}
        search={null}
      />,
    );
    expect(screen.getByText("1 recorded days · stale · partial coverage")).toBeTruthy();
  });

  it("keeps three authorized evidence states comparable without inventing unavailable facts", () => {
    render(
      <AssignedAthleteDirectory
        organizationId="organization-1"
        page={{
          hasMore: false,
          items: [
            {
              profileId: "fresh",
              displayName: "Fresh evidence",
              username: "fresh",
              metrics: { status: "available", freshness: "fresh" },
              activities: {
                status: "available",
                planningTimezone: "UTC",
                rangeStartDate: "2026-11-01",
                rangeEndDate: "2026-11-02",
                qualifier: "fresh",
                points: [
                  {
                    date: "2026-11-01",
                    dailyLoad: 12,
                    fitness: 30,
                    fatigue: 25,
                    form: 5,
                    coverageStatus: "complete",
                    omittedActivityCount: 0,
                  },
                ],
              },
              goals: {
                status: "available",
                items: [
                  {
                    id: "goal-1",
                    name: "Spring race",
                    targetDate: "2027-04-01",
                    category: "run",
                    priority: 1,
                  },
                ],
              },
            },
            {
              profileId: "stale-partial",
              displayName: "Stale partial",
              username: "stale",
              metrics: { status: "available", freshness: "stale" },
              activities: {
                status: "available",
                planningTimezone: "UTC",
                rangeStartDate: "2026-11-01",
                rangeEndDate: "2026-11-02",
                qualifier: "stale",
                points: [
                  {
                    date: "2026-11-02",
                    dailyLoad: 8,
                    fitness: 20,
                    fatigue: 21,
                    form: -1,
                    coverageStatus: "partial",
                    omittedActivityCount: 1,
                  },
                ],
              },
              goals: { status: "unshared", items: [] },
            },
            {
              profileId: "unshared",
              displayName: "Unshared evidence",
              username: "unshared",
              metrics: { status: "unshared" },
              activities: {
                status: "unshared",
                planningTimezone: null,
                rangeStartDate: null,
                rangeEndDate: null,
                points: [],
              },
              goals: { status: "unshared", items: [] },
            },
          ],
          nextCursor: null,
        }}
        search={null}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText("Spring race · 2027-04-01")).toBeTruthy();
    expect(screen.getByText("1 recorded days · stale · partial coverage")).toBeTruthy();
    expect(screen.getAllByText("Unshared")).toHaveLength(4);
    expect(screen.getAllByRole("img", { name: /Planning timezone UTC/ })).toHaveLength(2);
  });
});
