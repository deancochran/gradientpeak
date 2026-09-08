// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventDeleteForm, Route } from "./$eventId/index";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const mocks = vi.hoisted(() => ({
  deleteAction: vi.fn(),
  event: undefined as unknown,
  eventInputs: [] as unknown[],
  readModelOptions: [] as unknown[],
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

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.deleteAction }));

vi.mock("../../../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../../../lib/planning/server-actions", () => ({
  deleteCalendarEventAction: { url: "/actions/delete" },
}));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    events: {
      getById: {
        useQuery: (input: unknown) => {
          mocks.eventInputs.push(input);
          return { data: mocks.event, isError: false, isLoading: false };
        },
      },
    },
    athleteIntelligence: {
      getReadModel: {
        useQuery: (_input: unknown, options: unknown) => {
          mocks.readModelOptions.push(options);
          return { data: null };
        },
      },
    },
    routes: { get: { useQuery: () => ({ data: null }) } },
    trainingPlans: {
      get: { useQuery: () => ({ data: null }) },
    },
  },
}));

afterEach(cleanup);

describe("EventDetailPage", () => {
  it("keeps an RPE event authored and explains why session-flow personalization is off", () => {
    mocks.eventInputs = [];
    mocks.readModelOptions = [];
    mocks.event = {
      activityPlanSummary: {
        name: "Tempo run",
        activityCategory: "run",
        capabilities: { canEdit: true },
        structure: {
          activity_category: "run",
          segments: [
            {
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

    expect(screen.getAllByText("Run").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Bike")).toBeNull();
    expect(screen.getByTestId("activity-plan-structure")).toBeTruthy();
    const personalization = screen.getByRole("switch", { name: "Calculated targets" });
    expect(personalization.getAttribute("aria-checked")).toBe("false");
    expect(personalization.hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText(/5 RPE/).length).toBeGreaterThan(0);
    expect(mocks.eventInputs).toContainEqual({ id: "event-1", personalize: false });
    expect(mocks.readModelOptions).toContainEqual({ enabled: true });
    expect(mocks.eventInputs).not.toContainEqual({ id: "event-1", personalize: true });
  });

  it("renders the full authored plan timeline when the event viewer is not the plan owner", () => {
    mocks.eventInputs = [];
    mocks.readModelOptions = [];
    mocks.event = {
      activityPlanSummary: {
        id: "plan-1",
        name: "Shared tempo",
        activityCategory: "run",
        capabilities: { canEdit: false },
        structure: {
          activity_category: "run",
          segments: [
            {
              id: id(11),
              intervals: [
                {
                  id: id(12),
                  name: "Tempo",
                  repetitions: 1,
                  steps: [
                    {
                      duration: { seconds: 600, type: "time" },
                      id: id(13),
                      name: "Work",
                      targets: [{ intensity: 7, type: "RPE" }],
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
      event_type: "planned",
      id: "event-1",
      scheduled_date: "2026-07-28",
      status: "scheduled",
      title: "Shared tempo",
      training_plan_id: null,
    };
    const EventDetailPage = (Route as unknown as { component: React.ComponentType }).component;

    render(<EventDetailPage />);

    expect(screen.getByRole("img", { name: /Session flow.*authored duration/i })).toBeTruthy();
    expect(
      screen
        .getByTestId("activity-plan-session-flow-timeline-bar-0")
        .getAttribute("data-intensity"),
    ).toBe("RPE 7");
    expect(screen.getByTestId("activity-plan-structure")).toBeTruthy();
    expect(screen.getAllByText(/7 RPE/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("switch", { name: "Calculated targets" })).toBeNull();
  });

  it("keeps a rejected delete dialog form open with its selected scope available for retry", async () => {
    mocks.deleteAction.mockRejectedValueOnce(new Error("Delete request failed"));
    render(
      <EventDeleteForm
        eventId="00000000-0000-4000-8000-000000000001"
        recurring
        redirectTo="/calendar"
      />,
    );

    const scope = screen.getByLabelText("Delete recurrence scope") as HTMLSelectElement;
    fireEvent.change(scope, { target: { value: "future" } });
    const form = screen.getByRole("button", { name: "Delete event" }).closest("form");
    if (!(form instanceof HTMLFormElement)) throw new Error("Expected the delete form.");
    fireEvent.submit(form);

    expect((await screen.findByRole("alert")).textContent).toContain("Delete request failed");
    expect(scope.value).toBe("future");
    expect(screen.getByRole("button", { name: "Delete event" })).toBeTruthy();
  });
});
