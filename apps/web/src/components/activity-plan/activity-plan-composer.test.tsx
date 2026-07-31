/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityPlanComposer } from "./activity-plan-composer";

let id = 0;

beforeEach(() => {
  id = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`),
  });
});

afterEach(cleanup);

describe("ActivityPlanComposer", () => {
  it("authors a single-activity-category structure and exposes one plan-level activity category selector", async () => {
    const onSave = vi.fn();
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Web tempo" } });
    fireEvent.change(screen.getByLabelText("Plan activity category"), {
      target: { value: "bike" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: "Web tempo",
      structure: {
        version: 3,
        segments: [
          { activity_category: "bike", role: "activity" },
          { activity_category: "bike", role: "activity" },
        ],
      },
    });
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("route_id");
    expect(screen.queryByRole("button", { name: "Transition" })).toBeNull();
  });

  it("requires confirmation before resetting incompatible targets and keeps the current activity category on cancel", async () => {
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "speed" } });
    fireEvent.change(screen.getByLabelText("Plan activity category"), {
      target: { value: "bike" },
    });
    await waitFor(() =>
      expect(screen.getByRole("alertdialog").textContent).toContain("Reset incompatible targets?"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep current activity category" }));
    expect((screen.getByLabelText("Plan activity category") as HTMLSelectElement).value).toBe(
      "run",
    );

    fireEvent.change(screen.getByLabelText("Plan activity category"), {
      target: { value: "bike" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Change activity category and reset targets" }),
    );
    expect((screen.getByLabelText("Plan activity category") as HTMLSelectElement).value).toBe(
      "bike",
    );
    expect((screen.getByLabelText("Target") as HTMLSelectElement).value).toBe("RPE");
  });

  it("does not present route selection when editing a structured plan", () => {
    const onSave = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{
          name: "Route activity",
          structure: {
            version: 3,
            segments: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                role: "activity",
                activity_category: "run",
                name: "Run",
                intervals: [
                  {
                    id: "22222222-2222-4222-8222-222222222222",
                    name: "Main set",
                    repetitions: 1,
                    steps: [
                      {
                        id: "33333333-3333-4333-8333-333333333333",
                        name: "Steady",
                        duration: { type: "time", seconds: 600 },
                        targets: [{ type: "RPE", intensity: 5 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.queryByLabelText("Route")).toBeNull();
  });

  it("prevents submission after removing the required structure", () => {
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Incomplete" } });
    const deleteSegment = screen.getAllByRole("button", { name: "Delete segment" }).at(0);
    if (!deleteSegment) throw new Error("Expected the initial activity segment");
    fireEvent.click(deleteSegment);

    expect(screen.getByRole("alert").textContent).toContain("Structure needs attention");
    expect(
      (screen.getByRole("button", { name: "Create plan" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("announces a rejected save and preserves save-button focus", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Server rejected this plan"));
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Rejected" } });
    const saveButton = screen.getByRole("button", { name: "Create plan" });
    fireEvent.click(saveButton);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Server rejected"));
    expect(document.activeElement).toBe(saveButton);
  });
});
