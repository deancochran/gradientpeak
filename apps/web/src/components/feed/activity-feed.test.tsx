// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityFeed } from "./activity-feed";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
  navigate: vi.fn(),
  toggleLike: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mocks.navigate,
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    feed: { getFeed: { useInfiniteQuery: mocks.query } },
    social: {
      toggleLike: {
        useMutation: () => ({ isPending: false, mutate: mocks.toggleLike }),
      },
    },
  },
}));

vi.mock("../../hooks/use-viewing-user-preferred-unit-system", () => ({
  useViewingUserPreferredUnitSystem: () => ({ isLoading: false, unitSystem: "metric" }),
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
                contractVersion: "activity-display-v1",
                id: "activity-1",
                href: "/activities/activity-1",
                owner: { id: "runner-1", username: "runner", avatarUrl: null },
                time: {
                  startedAt: "2026-07-20T08:00:00.000Z",
                  finishedAt: null,
                },
                activityComposition: { kind: "single", categories: ["run"] },
                title: "Morning Run",
                notes: null,
                metrics: [
                  {
                    key: "elapsed_duration",
                    label: "Elapsed",
                    status: "available",
                    value: 3600,
                    unit: "seconds",
                    reason: null,
                  },
                ],
                visibility: "public",
                engagement: { likes: 2, comments: 1, viewerHasLiked: false },
                capabilities: {
                  canLike: true,
                  canComment: true,
                  canShare: true,
                  canEdit: false,
                  canDelete: false,
                  hasRoute: false,
                },
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
    expect(screen.getByRole("button", { name: /Like activity Morning Run/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Comment on activity Morning Run/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share activity Morning Run" })).toBeTruthy();
    expect(screen.getByText("@runner")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
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
