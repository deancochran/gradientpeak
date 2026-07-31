// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanGoalForm } from "./plan-goal-form";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  invalidateGoals: vi.fn(),
  invalidateIntelligence: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.action }));
vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({
      goals: { invalidate: mocks.invalidateGoals },
      athleteIntelligence: { invalidate: mocks.invalidateIntelligence },
    }),
  },
}));
vi.mock("../../lib/planning/server-actions", () => ({
  createPlanGoalAction: {},
  updatePlanGoalAction: {},
}));

afterEach(() => {
  cleanup();
  mocks.action.mockReset();
  mocks.invalidateGoals.mockReset();
  mocks.invalidateIntelligence.mockReset();
});

function form() {
  const element = screen.getByTestId("goal-form");
  if (!(element instanceof HTMLFormElement)) throw new Error("Expected a goal form.");
  return element;
}

describe("PlanGoalForm", () => {
  it("uses FormData transport, keeps a rejected draft, and announces the local error", async () => {
    mocks.action.mockResolvedValueOnce({ status: "error", message: "Goal could not be saved" });
    render(
      <PlanGoalForm initialDate="2026-10-26" profileId="11111111-1111-4111-8111-111111111111" />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Autumn consistency" } });
    fireEvent.submit(form());

    expect((await screen.findByRole("alert")).textContent).toContain("Goal could not be saved");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Autumn consistency");
    expect(mocks.action).toHaveBeenCalledWith({ data: expect.any(FormData) });
    const data = mocks.action.mock.calls[0]?.[0].data as FormData;
    expect(data.get("target_date")).toBe("2026-10-26");
    expect(data.get("target_sessions_per_week")).toBe("4");
    expect(data.get("target_weeks")).toBe("8");
  });

  it("prevents duplicate submissions while pending", async () => {
    let resolve!: (value: { status: "error"; message: string }) => void;
    mocks.action.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<PlanGoalForm profileId="11111111-1111-4111-8111-111111111111" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "One request" } });

    fireEvent.submit(form());
    fireEvent.submit(form());

    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    resolve({ status: "error", message: "Retry" });
    await screen.findByRole("alert");
  });

  it("marks every required value and prevents invalid date or numeric submissions", () => {
    render(<PlanGoalForm profileId="11111111-1111-4111-8111-111111111111" />);

    for (const label of ["Title", "Target date", "Priority", "Sessions / week", "Weeks"]) {
      expect(screen.getByLabelText(label).getAttribute("required")).not.toBeNull();
    }
    expect(screen.getByTestId("goal-title-required").textContent).toBe("Required");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
    fireEvent.blur(screen.getByLabelText("Title"));
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Sessions / week"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Weeks"), { target: { value: "0" } });

    expect(screen.getByText("Enter a goal title.")).toBeTruthy();
    expect(screen.getByText(/Choose a valid target date/)).toBeTruthy();
    expect(screen.getByText(/Priority must be a whole number from 0 to 10/)).toBeTruthy();
    expect(screen.getByText(/Sessions per week must be a whole number from 1 to 21/)).toBeTruthy();
    expect(screen.getByText(/Weeks must be a whole number from 1 to 104/)).toBeTruthy();
    expect((screen.getByTestId("goal-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(form());
    expect(mocks.action).not.toHaveBeenCalled();
  });
});
