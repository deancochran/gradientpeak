// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$eventId";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const mocks = vi.hoisted(() => ({
  event: undefined as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ eventId: "event-1" }),
    useSearch: () => ({ month: "2026-07", view: "month" }),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/calendar">{children}</a>,
}));

vi.mock("../../../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../../../lib/planning/server-actions", () => ({
  deleteCalendarEventAction: { url: "/actions/delete" },
}));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    events: {
      getById: { useQuery: () => ({ data: mocks.event, isError: false, isLoading: false }) },
    },
    trainingPlans: {
      getById: { useQuery: () => ({ data: null }) },
    },
  },
}));

afterEach(cleanup);

describe("EventDetailPage", () => {
  it("renders the activity plan's compiled canonical activity_category as one badge", () => {
    mocks.event = {
      activity_plan: {
        name: "Tempo run",
        structure: {
          segments: [
            {
              activity_category: "run",
              id: id(1),
              intervals: [
                {
                  id: id(2),
                  name: "Tempo",
                  repetitions: 1,
                  steps: [
                    {
                      duration: { seconds: 60, type: "time" },
                      id: id(3),
                      name: "Work",
                      targets: [{ intensity: 5, type: "RPE" }],
                    },
                  ],
                },
              ],
              name: "Run",
              role: "activity",
            },
          ],
          version: 3,
        },
      },
      all_day: true,
      event_type: "activity",
      id: "event-1",
      scheduled_date: "2026-07-28",
      status: null,
      title: "Tempo run",
      training_plan_id: null,
    };
    const EventDetailPage = (Route as unknown as { component: React.ComponentType }).component;

    render(<EventDetailPage />);

    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.queryByText("Bike")).toBeNull();
  });
});
