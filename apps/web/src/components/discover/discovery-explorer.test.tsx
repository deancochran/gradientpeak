// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoveryExplorer } from "./discovery-explorer";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), routeError: false, routeQuery: vi.fn() }));
const emptyQuery = {
  data: { pages: [{ items: [] }] },
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  isLoading: false,
  refetch: vi.fn(),
};
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
  }: {
    children: React.ReactNode;
    params?: Record<string, string>;
    to: string;
  }) => <a href={to.replace(/\$\w+/, Object.values(params ?? {})[0] ?? "")}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    activityPlans: {
      list: {
        useInfiniteQuery: () => ({
          ...emptyQuery,
          data: {
            pages: [
              {
                items: [
                  {
                    contractVersion: "activity-plan-summary-v1",
                    id: "plan-1",
                    href: "/activity-plans/plan-1",
                    name: "Tempo ride",
                    description: "A focused tempo session",
                    createdAt: "2026-08-19T10:00:00.000Z",
                    updatedAt: "2026-08-19T10:00:00.000Z",
                    owner: null,
                    activityCategory: "bike",
                    activityPlanRevision: 1,
                    structure: {
                      version: 5,
                      activity_category: "bike",
                      items: [
                        {
                          type: "step",
                          id: "00000000-0000-4000-8000-000000000003",
                          name: "Work",
                          duration: { type: "time", seconds: 900 },
                          targets: [{ type: "%FTP", intensity: 85 }],
                        },
                      ],
                    },
                    metrics: [],
                    visibility: "public",
                    isSystemTemplate: false,
                    engagement: { likes: 2, viewerHasLiked: false },
                    capabilities: {
                      canLike: true,
                      canEdit: false,
                      canDelete: false,
                      canDuplicate: false,
                      canSchedule: true,
                      canRecord: false,
                    },
                  },
                ],
              },
            ],
          },
        }),
      },
    },
    groups: {
      listDiscoverable: {
        useInfiniteQuery: () => ({
          ...emptyQuery,
          data: { pages: [{ items: [{ id: "group-1", name: "Sunday Riders" }] }] },
        }),
      },
    },
    routes: {
      list: {
        useInfiniteQuery: (input: unknown) => {
          mocks.routeQuery(input);
          return { ...emptyQuery, isError: mocks.routeError };
        },
      },
    },
    social: { searchUsers: { useInfiniteQuery: () => emptyQuery } },
    trainingPlans: { listTemplates: { useInfiniteQuery: () => emptyQuery } },
  },
}));
afterEach(() => {
  cleanup();
  mocks.navigate.mockClear();
  mocks.routeQuery.mockClear();
  mocks.routeError = false;
});
describe("DiscoveryExplorer", () => {
  it("renders discovered activity plans with their timeline and opens detail", () => {
    render(<DiscoveryExplorer />);
    expect(
      screen.getByTestId("activity-plan-card-timeline-plan-1-bar-0").getAttribute("data-intensity"),
    ).toBe("%FTP 85");
    fireEvent.click(screen.getByRole("button", { name: "Open activity plan Tempo ride" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/activity-plans/$activityPlanId",
      params: { activityPlanId: "plan-1" },
    });
  });
  it("links discovered groups to their detail page", () => {
    render(<DiscoveryExplorer />);
    fireEvent.click(screen.getByRole("tab", { name: "Groups" }));
    expect(screen.getByRole("link", { name: "View group" }).getAttribute("href")).toBe(
      "/groups/group-1",
    );
  });
  it("commits a public discovery query once on apply", () => {
    render(<DiscoveryExplorer />);
    fireEvent.change(screen.getByLabelText("Search activity plans"), {
      target: { value: "tempo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { q: "tempo", scope: "activityPlans" } }),
    );
  });
  it("persists the active scope category and sort filters when applied", () => {
    render(<DiscoveryExplorer />);
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "bike" } });
    fireEvent.change(screen.getByLabelText("Sort activity plans"), { target: { value: "oldest" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: { activityCategory: "bike", activitySort: "oldest", scope: "activityPlans" },
      }),
    );
  });
  it("keeps invalid route-distance drafts out of the applied query and clears bounds", () => {
    render(<DiscoveryExplorer initialScope="routes" />);
    mocks.navigate.mockClear();
    mocks.routeQuery.mockClear();
    fireEvent.change(screen.getByLabelText("Minimum distance (km)"), {
      target: { value: "not-a-number" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByRole("alert").textContent).toContain("Minimum distance");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.routeQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ min_distance_m: undefined, max_distance_m: undefined }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { scope: "routes" } }),
    );
  });
  it("resynchronizes clean controls from route props", () => {
    const view = render(<DiscoveryExplorer initialQuery="first" initialScope="routes" />);
    view.rerender(
      <DiscoveryExplorer
        initialMaxDistanceKm="20"
        initialMinDistanceKm="10"
        initialQuery="second"
        initialScope="routes"
      />,
    );
    expect((screen.getByLabelText("Search routes") as HTMLInputElement).value).toBe("second");
    expect((screen.getByLabelText("Minimum distance (km)") as HTMLInputElement).value).toBe("10");
  });
  it("keeps an unapplied discovery draft when route loading fails and is retried", () => {
    mocks.routeError = true;
    render(<DiscoveryExplorer initialScope="routes" />);
    fireEvent.change(screen.getByLabelText("Search routes"), { target: { value: "ridge" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry routes" }));
    expect((screen.getByLabelText("Search routes") as HTMLInputElement).value).toBe("ridge");
  });
});
