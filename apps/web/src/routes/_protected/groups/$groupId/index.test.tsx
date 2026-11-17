// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ eventsInputs: [] as Array<Record<string, unknown>> }));
const fetchNextPage = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => ({ eventsWindowStart: "2026-11-03T00:00:00.000Z" }),
    useNavigate: () => vi.fn(),
    useParams: () => ({ groupId: "group-1" }),
  }),
}));
vi.mock("../../../../components/groups/group-ui", () => ({
  GroupEventCard: ({ event }: { event: { title: string } }) => <p>{event.title}</p>,
  MutationError: () => null,
  QueryState: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    groups: {
      detail: {
        useQuery: () => ({
          data: {
            group: {
              access_level: "public",
              id: "group-1",
              name: "Sunday Riders",
              slug: "sunday-riders",
            },
            viewer: { canViewGroupEvents: true, relationshipState: "member" },
          },
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      events: {
        list: {
          useInfiniteQuery: (input: Record<string, unknown>) => {
            mocks.eventsInputs.push(input);
            const isPast = "startsBefore" in input;
            return {
              data: {
                pages: [
                  {
                    items: [
                      {
                        id: isPast ? "past" : "upcoming",
                        is_recurring_series: false,
                        title: isPast ? "Past ride" : "Upcoming ride",
                      },
                    ],
                  },
                ],
              },
              error: null,
              fetchNextPage,
              hasNextPage: isPast,
              isFetchingNextPage: false,
              isLoading: false,
              refetch: vi.fn(),
            };
          },
        },
      },
      joinOrRequest: { useMutation: () => ({}) },
      leave: { useMutation: () => ({}) },
      delete: { useMutation: () => ({}) },
    },
    useUtils: () => ({ groups: { invalidate: vi.fn() } }),
  },
}));

import { Route } from "./index";

afterEach(cleanup);
beforeEach(() => {
  mocks.eventsInputs.length = 0;
  fetchNextPage.mockClear();
});

describe("Group detail event dates", () => {
  it("switches to all past events without imposing an arbitrary start date", () => {
    const GroupDetailPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<GroupDetailPage />);

    const [upcomingInput, pastInput] = mocks.eventsInputs;
    expect(upcomingInput).toMatchObject({ groupId: "group-1", limit: 20 });
    expect(upcomingInput?.startsAfter).toEqual(expect.any(String));
    expect(pastInput).toMatchObject({
      groupId: "group-1",
      limit: 20,
      startsBefore: upcomingInput?.startsAfter,
    });
    expect(pastInput).not.toHaveProperty("startsAfter");

    fireEvent.click(screen.getByRole("button", { name: "Past" }));

    expect(screen.getByRole("heading", { name: "Past events" })).toBeTruthy();
    expect(screen.getByText("Past ride")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more events" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });
});
