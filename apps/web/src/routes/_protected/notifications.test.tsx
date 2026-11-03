// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./notifications";

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const NOTIFICATION_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  notifications: [] as Array<Record<string, unknown>>,
  navigate: vi.fn(),
  fetchNextPage: vi.fn(),
  historyError: false,
  nextCursor: null as { createdAt: string; id: string } | null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => ({ flash: undefined, flashType: undefined, view: "all" }),
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@repo/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../lib/notifications/server-actions", () => ({
  markNotificationsReadAction: { url: "/actions/notifications/read" },
}));
vi.mock("../../lib/social/server-actions", () => ({
  acceptFollowRequestAction: { url: "/actions/follows/accept" },
  rejectFollowRequestAction: { url: "/actions/follows/reject" },
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    notifications: {
      getHistory: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: mocks.notifications, nextCursor: mocks.nextCursor }] },
          fetchNextPage: mocks.fetchNextPage,
          hasNextPage: mocks.nextCursor !== null,
          isError: mocks.historyError,
          isFetchingNextPage: false,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.notifications = [];
  mocks.historyError = false;
  mocks.nextCursor = null;
});

describe("follow-request notifications", () => {
  it("wires accept and reject actions to the actor and notification", () => {
    mocks.notifications = [
      {
        id: NOTIFICATION_ID,
        user_id: "11111111-1111-4111-8111-111111111111",
        actor_id: ACTOR_ID,
        type: "follow_request",
        entity_id: null,
        read_at: null,
        created_at: "2026-07-20T10:00:00.000Z",
      },
    ];
    const NotificationsPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<NotificationsPage />);

    for (const actionName of ["Accept", "Reject"]) {
      const form = screen.getByRole("button", { name: actionName }).closest("form");
      if (!form) throw new Error(`Expected ${actionName} form`);
      const data = new FormData(form);
      expect(data.get("follower_id")).toBe(ACTOR_ID);
      expect(data.get("notification_id")).toBe(NOTIFICATION_ID);
      expect(data.get("redirectTo")).toBe("/notifications?view=all");
    }
  });

  it("does not show follow-request decisions for ordinary notifications", () => {
    mocks.notifications = [
      {
        id: NOTIFICATION_ID,
        user_id: "11111111-1111-4111-8111-111111111111",
        actor_id: ACTOR_ID,
        type: "new_follower",
        entity_id: null,
        read_at: null,
        created_at: "2026-07-20T10:00:00.000Z",
      },
    ];
    const NotificationsPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<NotificationsPage />);

    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });
});

describe("notification history states", () => {
  it("makes the bulk action's loaded scope explicit and presents a compact empty state", () => {
    const NotificationsPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<NotificationsPage />);

    expect(
      screen.getByRole("button", { name: "Mark 0 loaded as read" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("No notifications yet")).toBeTruthy();
    expect(
      screen.getByText("Updates about messages, follows, and invitations will appear here."),
    ).toBeTruthy();
  });

  it("keeps cached notifications visible while loading the next page", () => {
    mocks.notifications = [
      {
        id: NOTIFICATION_ID,
        user_id: "11111111-1111-4111-8111-111111111111",
        actor_id: ACTOR_ID,
        type: "new_follower",
        entity_id: null,
        read_at: null,
        created_at: "2026-07-20T10:00:00.000Z",
      },
    ];
    mocks.nextCursor = { createdAt: "2026-07-20T10:00:00.000Z", id: NOTIFICATION_ID };
    const NotificationsPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<NotificationsPage />);

    expect(screen.getByText("Load more notifications")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more notifications" }));
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
    expect(screen.getByText("New Follower")).toBeTruthy();
  });
});
