// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  goalsRefetch: vi.fn(),
  fetchNextPage: vi.fn(),
  navigate: vi.fn(() => Promise.resolve()),
  profile: {
    data: { id: "profile-1" },
    isError: false,
    isLoading: false,
    isSuccess: true,
    refetch: vi.fn(),
  },
  search: {
    category: "run",
    flash: undefined,
    flashType: undefined,
    q: "marathon",
    sort: "priority",
  },
  goals: {
    data: { pages: [{ items: [], nextCursor: null as string | null, total: 0 }] },
    hasNextPage: false,
    isFetchingNextPage: false,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => state.navigate,
    useSearch: () => state.search,
  }),
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? "#"}>{children}</a>
  ),
}));
vi.mock("../../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../../lib/planning", () => ({ formatShortDayLabel: (value: string) => value }));
vi.mock("../../../lib/api/client", () => ({
  api: {
    profiles: { get: { useQuery: () => state.profile } },
    goals: {
      list: {
        useInfiniteQuery: () => ({
          data: state.goals.data,
          fetchNextPage: state.fetchNextPage,
          hasNextPage: state.goals.hasNextPage,
          isFetchingNextPage: state.goals.isFetchingNextPage,
          isError: false,
          isLoading: false,
          refetch: state.goalsRefetch,
        }),
      },
    },
  },
}));

import { GoalsPage } from "./index";

afterEach(() => {
  cleanup();
  state.goalsRefetch.mockReset();
  state.fetchNextPage.mockReset();
  state.navigate.mockReset();
  state.navigate.mockResolvedValue(undefined);
  state.profile = {
    data: { id: "profile-1" },
    isError: false,
    isLoading: false,
    isSuccess: true,
    refetch: vi.fn(),
  };
  state.search = {
    category: "run",
    flash: undefined,
    flashType: undefined,
    q: "marathon",
    sort: "priority",
  };
  state.goals = {
    data: { pages: [{ items: [], nextCursor: null as string | null, total: 0 }] },
    hasNextPage: false,
    isFetchingNextPage: false,
  };
});

describe("GoalsPage query controls", () => {
  it("clears a filtered category and sort with one canonical navigation", async () => {
    render(<GoalsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1));
    expect(state.navigate).toHaveBeenCalledWith({
      replace: true,
      search: {
        category: undefined,
        flash: undefined,
        flashType: undefined,
        q: "",
        sort: "target_date",
      },
    });
  });

  it("accepts one pending apply, shows updating status, and emits no private URL parameters", async () => {
    let resolveNavigation!: () => void;
    state.navigate.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveNavigation = resolve;
      }),
    );
    render(<GoalsPage />);
    const form = screen.getByLabelText("Search goals").closest("form");
    if (!form) throw new Error("Goals filter form missing");

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(state.navigate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Updating goals");
    expect((state.navigate.mock.calls as unknown[][]).at(0)?.[0]).toEqual({
      replace: true,
      search: {
        category: "run",
        flash: undefined,
        flashType: undefined,
        q: "marathon",
        sort: "priority",
      },
    });
    resolveNavigation();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("retains the profile-unavailable retry behavior", () => {
    const refetch = vi.fn();
    state.profile = {
      data: null,
      isError: false,
      isLoading: false,
      isSuccess: true,
      refetch,
    } as never;
    render(<GoalsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("requests the next cursor page from the visible pagination control", () => {
    state.goals = {
      data: { pages: [{ items: [], nextCursor: "50", total: 51 }] },
      hasNextPage: true,
      isFetchingNextPage: false,
    };
    render(<GoalsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Load more goals" }));
    expect(state.fetchNextPage).toHaveBeenCalledOnce();
  });
});
