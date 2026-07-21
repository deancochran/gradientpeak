// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityFeed } from "./activity-feed";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../lib/api/client", () => ({
  api: { feed: { getFeed: { useInfiniteQuery: mocks.query } } },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityFeed", () => {
  it("renders persisted pages and requests the next cursor page", () => {
    mocks.query.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "activity-1",
                name: "Morning Run",
                profile: { username: "runner" },
                activity_kind: "single",
                type: "run",
                started_at: "2026-07-20T08:00:00.000Z",
                duration_seconds: 3600,
                distance_meters: 10000,
                likes_count: 2,
                comments_count: 1,
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      isRefetching: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage: mocks.fetchNextPage,
      refetch: mocks.refetch,
    });
    render(<ActivityFeed />);
    expect(screen.getByText("Morning Run")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more activities" }));
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(
      { limit: 20 },
      expect.objectContaining({ getNextPageParam: expect.any(Function) }),
    );
  });

  it("offers retry when the initial API request fails", () => {
    mocks.query.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isRefetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
      refetch: mocks.refetch,
    });
    render(<ActivityFeed />);
    fireEvent.click(screen.getByRole("button", { name: "Retry feed" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});
