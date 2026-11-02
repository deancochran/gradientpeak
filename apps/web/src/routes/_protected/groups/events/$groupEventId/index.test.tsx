// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
  }: {
    children: React.ReactNode;
    params: { activityPlanId: string };
    to: string;
  }) => <a href={to.replace("$activityPlanId", params.activityPlanId)}>{children}</a>,
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ groupEventId: "event-1" }),
  }),
}));
vi.mock("../../../../../components/groups/group-ui", () => ({
  GroupEventCard: () => null,
  MutationError: () => null,
  QueryState: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock("../../../../../lib/api/client", () => ({
  api: {
    activityPlans: {
      getManyByIds: {
        useQuery: () => ({
          data: { items: [{ id: "plan-1", name: "Tempo ride" }] },
          isLoading: false,
        }),
      },
    },
    groups: {
      detail: { useQuery: () => ({ data: { viewer: { canCreateGroupEvent: false } } }) },
      events: {
        cancel: { useMutation: () => ({}) },
        detail: {
          useQuery: () => ({
            data: {
              event: {
                acceptedRsvpCount: 0,
                activity_plan_id: "plan-1",
                cancelled_at: null,
                group_id: "group-1",
                is_recurring_occurrence: false,
                is_recurring_series: false,
                series_id: null,
                starts_at: "2026-08-01T09:00:00.000Z",
                title: "Saturday ride",
                viewerRsvp: null,
                viewerSeriesRsvp: null,
              },
            },
            isLoading: false,
            refetch: vi.fn(),
          }),
        },
        rsvp: { useMutation: () => ({}) },
        rsvpEventSeries: { useMutation: () => ({}) },
        seriesOccurrences: { useQuery: () => ({}) },
      },
    },
    routes: { get: { useQuery: () => ({}) } },
    useUtils: () => ({
      calendar: { invalidate: vi.fn() },
      groups: { events: { invalidate: vi.fn() } },
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { Route } from "./index";

afterEach(cleanup);

describe("Group event detail attachments", () => {
  it("links an available activity plan to its detail page", () => {
    const GroupEventDetailPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<GroupEventDetailPage />);
    expect(screen.getByRole("link", { name: "View activity plan" }).getAttribute("href")).toBe(
      "/activity-plans/plan-1",
    );
  });
});
