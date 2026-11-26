// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionRpeCard } from "./session-rpe-card";

const mutate = vi.fn();
let mutationOptions: {
  onError?: (error: Error) => void;
  onSuccess?: (evidence: { id: string }) => Promise<void>;
} = {};

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({
      activities: {
        dailyCommonLoadObservations: { invalidate: vi.fn(async () => undefined) },
        getById: { invalidate: vi.fn(async () => undefined) },
        listPaginated: { invalidate: vi.fn(async () => undefined) },
      },
      athleteIntelligence: { getReadModel: { invalidate: vi.fn(async () => undefined) } },
      home: { getDashboard: { invalidate: vi.fn(async () => undefined) } },
      trainingPlans: {
        getPlanTabProjection: { invalidate: vi.fn(async () => undefined) },
        preview: { invalidate: vi.fn(async () => undefined) },
      },
    }),
    activities: {
      recordSessionRpe: {
        useMutation: (options: typeof mutationOptions) => {
          mutationOptions = options;
          return { isPending: false, mutate };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("SessionRpeCard", () => {
  afterEach(() => {
    cleanup();
    mutate.mockClear();
    mutationOptions = {};
  });

  it("does not invent an RPE or mutate on mount", () => {
    render(<SessionRpeCard activityId="activity-1" effectiveSessionRpe={null} />);

    expect(screen.getByText("No RPE recorded")).toBeTruthy();
    expect((screen.getByLabelText("Perceived exertion") as HTMLInputElement).value).toBe("");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("keeps invalid drafts visible and submits a valid value only once", () => {
    render(<SessionRpeCard activityId="activity-1" effectiveSessionRpe={null} />);
    const input = screen.getByLabelText("Perceived exertion") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "7.5" } });
    expect(input.value).toBe("7.5");
    expect(screen.getByRole("alert").textContent).toContain("whole RPE from 1 to 10");
    expect((screen.getByRole("button", { name: "Save RPE" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save RPE" }));
    fireEvent.click(screen.getByRole("button", { name: "Save RPE" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ activity_id: "activity-1", rpe: 7, source: "user" }),
    );
  });

  it("retains a rejected draft and operation identity for retry", () => {
    render(<SessionRpeCard activityId="activity-1" effectiveSessionRpe={null} />);
    const input = screen.getByLabelText("Perceived exertion") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save RPE" }));
    const firstOperationId = mutate.mock.calls[0]?.[0].operation_id;

    act(() => mutationOptions.onError?.(new Error("Network unavailable")));
    expect(input.value).toBe("7");
    expect(screen.getByRole("alert").textContent).toContain("Network unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Save RPE" }));
    expect(mutate.mock.calls[1]?.[0].operation_id).toBe(firstOperationId);
  });
});
