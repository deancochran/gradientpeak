// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: { q: undefined as string | undefined, tab: "upcoming" },
  upcomingInputs: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../../lib/api/route-loading", () => ({
  loadRouteQuery: async (
    getCached: () => unknown,
    fetch: () => Promise<unknown>,
  ): Promise<void> => {
    if (getCached() === undefined) await fetch();
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => mocks.search,
    useLoaderData: () => ({ upcomingWindowStart: "2026-11-03T00:00:00.000Z" }),
  }),
}));
vi.mock("../../../components/groups/group-ui", () => ({
  GroupCard: () => null,
  MutationError: () => null,
  QueryState: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock("../../../lib/api/client", () => {
  const page = { data: { pages: [{ items: [] }] }, hasNextPage: false, isLoading: false };
  const mutation = { error: null, isPending: false, mutate: vi.fn() };
  return {
    api: {
      groups: {
        acceptInvite: { useMutation: () => mutation },
        cancelJoinRequest: { useMutation: () => mutation },
        declineInvite: { useMutation: () => mutation },
        events: {
          myUpcomingGroupEvents: {
            useInfiniteQuery: (input: Record<string, unknown>, options: { retry?: number }) => {
              mocks.upcomingInputs.push(input);
              expect(options.retry).toBe(2);
              return { ...page, refetch: vi.fn() };
            },
          },
        },
        joinOrRequest: { useMutation: () => mutation },
        listDiscoverable: { useInfiniteQuery: () => page },
        myGroups: { useInfiniteQuery: () => page },
        myInvitations: { useInfiniteQuery: () => page },
        myJoinRequests: { useInfiniteQuery: () => page },
      },
      useUtils: () => ({ groups: { invalidate: vi.fn() } }),
    },
  };
});

import { Route } from "./index";

afterEach(cleanup);
beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.search = { q: undefined, tab: "upcoming" };
  mocks.upcomingInputs.length = 0;
});

describe("Groups library upcoming window", () => {
  it("keeps the upcoming query key stable across ordinary renders", () => {
    const GroupsLibraryPage = (Route as unknown as { component: React.ComponentType }).component;
    const view = render(<GroupsLibraryPage />);
    view.rerender(<GroupsLibraryPage />);

    expect(mocks.upcomingInputs).toHaveLength(2);
    expect(mocks.upcomingInputs[0]).toEqual(mocks.upcomingInputs[1]);
  });
});

describe("Groups library URL state", () => {
  it("validates tab and search parameters", () => {
    const validateSearch = (
      Route as unknown as {
        validateSearch: (search: Record<string, unknown>) => unknown;
      }
    ).validateSearch;

    expect(validateSearch({ q: "  local club  ", tab: "discover" })).toEqual({
      q: "local club",
      tab: "discover",
    });
    expect(validateSearch({ q: ["local"], tab: "invalid" })).toEqual({
      q: undefined,
      tab: undefined,
    });
  });

  it("prefetches only the active tab with the component query key", async () => {
    const getInfiniteData = vi.fn(() => undefined);
    const fetchInfinite = vi.fn(() => Promise.resolve({ pages: [], pageParams: [] }));
    const loader = (
      Route as unknown as {
        loader: (options: {
          context: { apiUtils: object };
          deps: { q?: string; tab: string };
        }) => Promise<unknown>;
      }
    ).loader;

    await loader({
      context: {
        apiUtils: {
          groups: {
            listDiscoverable: { fetchInfinite, getInfiniteData },
          },
        },
      },
      deps: { q: "local club", tab: "discover" },
    });

    expect(getInfiniteData).toHaveBeenCalledWith({ limit: 30, search: "local club" });
    expect(fetchInfinite).toHaveBeenCalledWith(
      { limit: 30, search: "local club" },
      { getNextPageParam: expect.any(Function), pages: 1 },
    );
    const calls = fetchInfinite.mock.calls as unknown as Array<
      [unknown, { getNextPageParam: (page: { nextCursor: string | null }) => string | null }]
    >;
    const options = calls[0]?.[1] as {
      getNextPageParam: (page: { nextCursor: string | null }) => string | null;
    };
    expect(options.getNextPageParam({ nextCursor: "next-page" })).toBe("next-page");
  });

  it("debounces discovery search into replacement URL state", () => {
    vi.useFakeTimers();
    mocks.search = { q: undefined, tab: "discover" };
    const GroupsLibraryPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<GroupsLibraryPage />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search groups" }), {
      target: { value: "  local club  " },
    });
    act(() => vi.advanceTimersByTime(299));
    expect(mocks.navigate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    const options = mocks.navigate.mock.calls[0]?.[0] as {
      replace: boolean;
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(options.replace).toBe(true);
    expect(options.search({ tab: "discover", unrelated: "kept" })).toEqual({
      q: "local club",
      tab: "discover",
      unrelated: "kept",
    });
    vi.useRealTimers();
  });
});
