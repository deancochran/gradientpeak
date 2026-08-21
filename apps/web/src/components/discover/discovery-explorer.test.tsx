// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscoveryExplorer } from "./discovery-explorer";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

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
                      version: 3,
                      activity_category: "bike",
                      segments: [
                        {
                          id: "00000000-0000-4000-8000-000000000001",
                          role: "activity",
                          name: "Ride",
                          intervals: [
                            {
                              id: "00000000-0000-4000-8000-000000000002",
                              name: "Tempo",
                              repetitions: 1,
                              steps: [
                                {
                                  id: "00000000-0000-4000-8000-000000000003",
                                  name: "Work",
                                  duration: { type: "time", seconds: 900 },
                                  targets: [{ type: "%FTP", intensity: 85 }],
                                },
                              ],
                            },
                          ],
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
    routes: { list: { useInfiniteQuery: () => emptyQuery } },
    social: { searchUsers: { useInfiniteQuery: () => emptyQuery } },
    trainingPlans: { listTemplates: { useInfiniteQuery: () => emptyQuery } },
  },
}));

afterEach(cleanup);

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
});
