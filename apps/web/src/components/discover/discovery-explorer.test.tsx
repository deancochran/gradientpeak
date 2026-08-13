// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscoveryExplorer } from "./discovery-explorer";

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
  }) => <a href={to.replace("$activityPlanId", params?.activityPlanId ?? "")}>{children}</a>,
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    activityPlans: {
      list: {
        useInfiniteQuery: () => ({
          ...emptyQuery,
          data: { pages: [{ items: [{ id: "plan-1", name: "Tempo ride" }] }] },
        }),
      },
    },
    groups: { listDiscoverable: { useInfiniteQuery: () => emptyQuery } },
    routes: { list: { useInfiniteQuery: () => emptyQuery } },
    social: { searchUsers: { useInfiniteQuery: () => emptyQuery } },
    trainingPlans: { listTemplates: { useInfiniteQuery: () => emptyQuery } },
  },
}));

afterEach(cleanup);

describe("DiscoveryExplorer", () => {
  it("links discovered activity plans to their detail page", () => {
    render(<DiscoveryExplorer />);

    expect(screen.getByRole("link", { name: "View activity plan" }).getAttribute("href")).toBe(
      "/activity-plans/plan-1",
    );
  });
});
