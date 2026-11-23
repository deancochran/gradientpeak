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
              activities: { status: "unshared", points: [] },
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
});
