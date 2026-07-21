// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "./search";

type TestQuery = {
  data?: {
    pages: Array<{ items: Array<Record<string, unknown>>; users: Array<Record<string, unknown>> }>;
  };
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  refetch: ReturnType<typeof vi.fn>;
  fetchNextPage: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => {
  const emptyQuery = (): TestQuery => ({
    data: { pages: [{ items: [], users: [] }] },
    isLoading: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  });
  return {
    emptyQuery,
    routeSearch: { q: "tempo" as string | undefined },
    activityPlans: vi.fn(emptyQuery),
    trainingPlans: vi.fn(emptyQuery),
    routes: vi.fn(emptyQuery),
    users: vi.fn(emptyQuery),
    groups: vi.fn(emptyQuery),
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options, useSearch: () => mocks.routeSearch }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const SCOPES = [
  ["Activity plans", "activityPlans", "activity plans"],
  ["Training plans", "trainingPlans", "training plans"],
  ["Routes", "routes", "routes"],
  ["Profiles", "users", "profiles"],
  ["Groups", "groups", "groups"],
] as const;

vi.mock("../../lib/api/client", () => ({
  api: {
    activityPlans: { list: { useInfiniteQuery: mocks.activityPlans } },
    trainingPlans: { listTemplates: { useInfiniteQuery: mocks.trainingPlans } },
    routes: { list: { useInfiniteQuery: mocks.routes } },
    social: { searchUsers: { useInfiniteQuery: mocks.users } },
    groups: { listDiscoverable: { useInfiniteQuery: mocks.groups } },
  },
}));

beforeEach(() => {
  for (const [, queryName] of SCOPES) {
    mocks[queryName].mockImplementation(mocks.emptyQuery);
  }
  mocks.routeSearch.q = "tempo";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("discovery route", () => {
  it("sends persisted search and scope filters to the active paginated API", () => {
    const SearchPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<SearchPage />);

    expect(mocks.activityPlans).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerScope: "discoverable", search: "tempo", limit: 20 }),
      expect.objectContaining({ enabled: true }),
    );

    fireEvent.click(screen.getByRole("tab", { name: "Routes" }));
    fireEvent.change(screen.getByLabelText("Minimum distance (km)"), { target: { value: "12.5" } });
    fireEvent.change(screen.getByLabelText("Sort routes"), { target: { value: "distance_desc" } });

    expect(mocks.routes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: "tempo",
        min_distance_m: 12_500,
        sort_by: "distance_desc",
        limit: 20,
      }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("renders an empty recovery action rather than treating it as an error", () => {
    const SearchPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<SearchPage />);
    expect(screen.getByText("No activity plans match your search and filters.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(mocks.activityPlans).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: undefined }),
      expect.any(Object),
    );
  });

  it.each(SCOPES)("offers API retry for the %s scope", (scopeLabel, queryName, noun) => {
    const refetch = vi.fn();
    const { data: _data, ...emptyQuery } = mocks.emptyQuery();
    mocks[queryName].mockReturnValue({
      ...emptyQuery,
      isError: true,
      refetch,
    });
    const SearchPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<SearchPage />);
    if (scopeLabel !== "Activity plans") {
      fireEvent.click(screen.getByRole("tab", { name: scopeLabel }));
    }

    fireEvent.click(screen.getByRole("button", { name: `Retry ${noun}` }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it.each(SCOPES)("pages API results for the %s scope", (scopeLabel, queryName, noun) => {
    const fetchNextPage = vi.fn();
    const item = { id: `${queryName}-1`, name: `${scopeLabel} result`, username: "athlete" };
    mocks[queryName].mockReturnValue({
      ...mocks.emptyQuery(),
      data: { pages: [{ items: [item], users: [item] }] },
      hasNextPage: true,
      fetchNextPage,
    });
    const SearchPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<SearchPage />);
    if (scopeLabel !== "Activity plans") {
      fireEvent.click(screen.getByRole("tab", { name: scopeLabel }));
    }

    fireEvent.click(screen.getByRole("button", { name: `Load more ${noun}` }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });
});
