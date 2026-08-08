// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrainingPlanActivityReorder } from "./training-plan-activity-reorder";

const planId = "11111111-1111-4111-8111-111111111111";
const firstEventId = "22222222-2222-4222-8222-222222222222";
const secondEventId = "33333333-3333-4333-8333-333333333333";
const mocks = vi.hoisted(() => ({
  invalidateEvents: vi.fn(),
  refetchEvents: vi.fn(),
  reorderActivities: vi.fn(),
  eventItems: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      activity_plan_id: "44444444-4444-4444-8444-444444444444",
      training_plan_id: "11111111-1111-4111-8111-111111111111",
      scheduled_date: "2026-08-01",
      title: "Activity one",
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      activity_plan_id: "55555555-5555-4555-8555-555555555555",
      training_plan_id: "11111111-1111-4111-8111-111111111111",
      scheduled_date: "2026-08-02",
      title: "Activity two",
    },
  ],
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({ events: { invalidate: mocks.invalidateEvents } }),
    calendar: {
      range: {
        useQuery: () => ({
          data: {
            items: mocks.eventItems,
          },
          error: null,
          isLoading: false,
          refetch: mocks.refetchEvents,
        }),
      },
    },
    trainingPlans: {
      reorderActivities: {
        useMutation: () => ({
          isError: false,
          isPending: false,
          mutateAsync: mocks.reorderActivities,
        }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TrainingPlanActivityReorder", () => {
  it("sends every changed activity in one atomic mutation", async () => {
    mocks.reorderActivities.mockResolvedValue({ affected_count: 2 });
    mocks.refetchEvents.mockResolvedValue(undefined);
    render(<TrainingPlanActivityReorder />);

    const nextButtons = screen.getAllByRole("button", { name: "Next day" });
    const [firstNextButton, secondNextButton] = nextButtons;
    if (!firstNextButton || !secondNextButton) throw new Error("Expected two activity controls");
    fireEvent.click(firstNextButton);
    fireEvent.click(secondNextButton);
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));

    await waitFor(() => expect(mocks.reorderActivities).toHaveBeenCalledTimes(1));
    expect(mocks.reorderActivities).toHaveBeenCalledWith({
      training_plan_id: planId,
      changes: [
        {
          event_id: firstEventId,
          expected_scheduled_date: "2026-08-01",
          requested_scheduled_date: "2026-08-02",
        },
        {
          event_id: secondEventId,
          expected_scheduled_date: "2026-08-02",
          requested_scheduled_date: "2026-08-03",
        },
      ],
    });
    expect(await screen.findByText("Activity schedule saved.")).toBeTruthy();
  });

  it("retains the edited schedule after a failed save so it can be retried", async () => {
    mocks.reorderActivities.mockRejectedValue(new Error("Network unavailable"));
    render(<TrainingPlanActivityReorder />);

    const [firstNextButton] = screen.getAllByRole("button", { name: "Next day" });
    if (!firstNextButton) throw new Error("Expected an activity control");
    fireEvent.click(firstNextButton);
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));

    await screen.findByText(/Network unavailable.*still ready to retry/i);
    expect(screen.getByRole("button", { name: "Retry save" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getAllByText("2026-08-02")).toHaveLength(2);
  });
});
