// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upcomingInputs: [] as Array<Record<string, unknown>> }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options, useNavigate: () => vi.fn() }),
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
            useInfiniteQuery: (input: Record<string, unknown>) => {
              mocks.upcomingInputs.push(input);
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
