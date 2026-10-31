// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PlanGoalForm } from "./plan-goal-form";

const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  }),
);
afterAll(() => {
  if (scrollIntoView)
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

vi.mock("../../lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    guardedCancel: mocks.guardedCancel,
    markSaveFailed: vi.fn(),
    markSaved: vi.fn(),
  }),
}));

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  guardedCancel: vi.fn(),
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
  window.history.replaceState(null, "", "/");
  mocks.action.mockReset();
  mocks.guardedCancel.mockReset();
  mocks.invalidateGoals.mockReset();
  mocks.invalidateIntelligence.mockReset();
});

function form() {
  const element = screen.getByTestId("goal-form");
  if (!(element instanceof HTMLFormElement)) throw new Error("Expected a goal form.");
  return element;
}

describe("PlanGoalForm", () => {
  it.each([
    ["Consistency", "Weeks", "oops", "Sessions / week", "3"],
    ["Completion", "Distance (km)", "10km", "Duration", "0:10:00"],
    ["Power threshold", "Watts", "250w", "Test duration", ""],
    ["Pace threshold", "Target pace", "4:3", "Test duration", ""],
    ["Power threshold", "Test duration", "bad", "Watts", "250"],
    ["Power threshold", "Test duration", "0:00:00", "Watts", "250"],
  ])("focuses invalid %s / %s and exposes its field message before submission", async (type, label, invalid, validLabel, valid) => {
    render(
      <PlanGoalForm profileId="11111111-1111-4111-8111-111111111111" initialDate="2026-12-01" />,
    );
    if (type !== "Consistency") {
      fireEvent.keyDown(screen.getByRole("combobox", { name: "Goal type" }), { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("option", { name: type }));
    }
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Focused goal" } });
    fireEvent.change(screen.getByLabelText(validLabel), { target: { value: valid } });
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value: invalid } });
    const save = screen.getByTestId("goal-submit");
    save.focus();
    fireEvent.click(save);
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field).toHaveProperty("value", invalid);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const descriptionIds = field.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(
      descriptionIds.some((id) =>
        document.getElementById(id)?.textContent?.toLowerCase().includes(label.toLowerCase()),
      ),
    ).toBe(true);
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("retains open-form values on backgrounding but drops them on page exit and cached return", () => {
    render(<PlanGoalForm profileId="11111111-1111-4111-8111-111111111111" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Temporary goal" } });
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "Temporary goal");
    fireEvent(window, new Event("pagehide"));
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Another temporary value" },
    });
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "");
    expect(screen.queryByRole("button", { name: /resume|stored save/i })).toBeNull();
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it("permits Cancel during a pending write and ignores its late failure in the next form", async () => {
    let finish!: (value: { status: "error"; message: string }) => void;
    mocks.action.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const cancel = vi.fn();
    render(<PlanGoalForm onCancel={cancel} profileId="11111111-1111-4111-8111-111111111111" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Old goal" } });
    fireEvent.submit(form());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New goal" } });
    finish({ status: "error", message: "Old request failed" });
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "New goal");
    expect(screen.queryByText("Old request failed")).toBeNull();
  });
  it("invalidates goal reads and navigates after a successful save", async () => {
    mocks.action.mockResolvedValue({ status: "success", redirectTo: "#saved-goal" });
    render(<PlanGoalForm profileId="11111111-1111-4111-8111-111111111111" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New consistency" } });
    fireEvent.submit(form());
    await waitFor(() => expect(window.location.hash).toBe("#saved-goal"));
    expect(mocks.invalidateGoals).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateIntelligence).toHaveBeenCalledTimes(1);
  });
  it.each([
    {
      choice: "Race performance",
      field: "Goal time",
      value: "25:00",
      target: { type: "event_performance", distance_m: 5000, target_time_s: 1500 },
    },
    {
      choice: "Completion",
      field: "Duration",
      value: "30:00",
      target: { type: "completion", distance_m: 5000, duration_s: 1800 },
    },
    {
      choice: "Pace threshold",
      field: "Target pace",
      value: "5:00",
      target: { type: "threshold", metric: "pace", value: 1000 / 300, test_duration_s: 1200 },
    },
    {
      choice: "Power threshold",
      field: "Watts",
      value: "250",
      target: { type: "threshold", metric: "power", value: 250, test_duration_s: 1200 },
    },
    {
      choice: "Heart rate threshold",
      field: "Target bpm",
      value: "170",
      target: { type: "threshold", metric: "hr", value: 170 },
    },
    {
      choice: "Consistency",
      field: "Weeks",
      value: "6",
      target: { type: "consistency", target_sessions_per_week: 4, target_weeks: 6 },
    },
  ])("creates $choice through its shared controls", async ({ choice, field, value, target }) => {
    mocks.action.mockResolvedValue({ status: "error", message: "Keep for inspection" });
    render(
      <PlanGoalForm profileId="11111111-1111-4111-8111-111111111111" initialDate="2026-11-01" />,
    );
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New goal" } });
    if (choice !== "Consistency") {
      fireEvent.keyDown(screen.getByRole("combobox", { name: "Goal type" }), { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("option", { name: choice }));
    }
    fireEvent.change(screen.getByLabelText(field), { target: { value } });
    fireEvent.submit(form());
    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    expect(mocks.action.mock.calls[0]?.[0].data.target_payload).toMatchObject(target);
  });

  it("discards local values immediately on Cancel without a retention prompt", () => {
    const cancel = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PlanGoalForm onCancel={cancel} profileId="11111111-1111-4111-8111-111111111111" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Keep my draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.action).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    confirm.mockRestore();
  });

  it("uses typed canonical transport, keeps a rejected draft, and announces the local error", async () => {
    mocks.action.mockResolvedValueOnce({ status: "error", message: "Goal could not be saved" });
    render(
      <PlanGoalForm initialDate="2026-10-26" profileId="11111111-1111-4111-8111-111111111111" />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Autumn consistency" } });
    fireEvent.submit(form());

    expect((await screen.findByRole("alert")).textContent).toContain("Goal could not be saved");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Autumn consistency");
    expect(mocks.action).toHaveBeenCalledWith({
      data: expect.objectContaining({
        target_date: "2026-10-26",
        target_payload: { type: "consistency", target_sessions_per_week: 4, target_weeks: 8 },
      }),
    });
    expect(mocks.action.mock.calls[0]?.[0].data).not.toHaveProperty("originalGoal");
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
    for (const label of ["Title", "Target date", "Priority", "Sessions / week", "Weeks"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Too late" } });
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("One request");
    expect(mocks.action.mock.calls[0]?.[0].data.title).toBe("One request");
    expect(
      screen.getByRole("combobox", { name: "Activity" }).getAttribute("data-disabled"),
    ).not.toBeNull();
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    resolve({ status: "error", message: "Retry" });
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("One request");
  });

  it("marks required headers, leaves optional targets clearable, and blocks invalid drafts", async () => {
    render(<PlanGoalForm profileId="11111111-1111-4111-8111-111111111111" />);

    for (const label of ["Title", "Target date"]) {
      expect(screen.getByLabelText(label).getAttribute("required")).not.toBeNull();
    }
    expect(screen.getByRole("combobox", { name: "Priority" }).getAttribute("aria-required")).toBe(
      "true",
    );
    expect(screen.getByTestId("goal-title-required").textContent).toBe("Required");

    for (const label of ["Sessions / week", "Weeks"]) {
      expect(screen.getByLabelText(label).getAttribute("required")).toBeNull();
    }
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Valid title" } });
    fireEvent.change(screen.getByLabelText("Weeks"), { target: { value: "oops" } });
    fireEvent.submit(form());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mocks.action).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Weeks")).toHaveProperty("value", "oops");
    fireEvent.change(screen.getByLabelText("Weeks"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Sessions / week"), { target: { value: "" } });
    fireEvent.submit(form());
    expect((await screen.findByRole("alert")).textContent).toContain("Set weekly sessions");
    fireEvent.change(screen.getByLabelText("Weeks"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "" } });
    fireEvent.submit(form());
    expect((await screen.findByRole("alert")).textContent).toContain("Choose a valid target date");
    expect(screen.getByLabelText("Target date")).toHaveProperty("value", "");
    expect(mocks.action).not.toHaveBeenCalled();
  });
});
