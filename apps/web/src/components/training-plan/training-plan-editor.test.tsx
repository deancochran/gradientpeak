// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrainingPlanEditor } from "./training-plan-editor";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({ trainingPlans: { invalidate: mocks.invalidate } }),
    trainingPlans: {
      get: { useQuery: () => ({ data: undefined, error: null, isLoading: false }) },
      create: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.create }),
      },
      update: {
        useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                name: "Aerobic ride",
              },
            ],
          },
          error: null,
          isLoading: false,
        }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TrainingPlanEditor", () => {
  it("previews and persists the canonical Core structure, retaining input for retry", async () => {
    const onSaved = vi.fn();
    mocks.create
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ id: "22222222-2222-4222-8222-222222222222" });
    render(<TrainingPlanEditor onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Base plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add workout" }));
    expect(screen.getByText("1 workouts")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    expect((await screen.findByRole("alert")).textContent).toContain("temporary failure");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Base plan");

    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "Base plan",
        structure: expect.objectContaining({
          version: 1,
          sessions: [
            expect.objectContaining({
              activity_plan_id: "11111111-1111-4111-8111-111111111111",
              offset_days: 0,
            }),
          ],
        }),
      }),
    );
  });
});
