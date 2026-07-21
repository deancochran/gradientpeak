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
  it("authors and submits a Core-valid multisport-ready V3 structure", async () => {
    const onSave = vi.fn();
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Web tempo" } });
    fireEvent.change(screen.getByLabelText("Sport"), { target: { value: "bike" } });
    fireEvent.click(screen.getByRole("button", { name: "Transition" }));
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: "Web tempo",
      structure: {
        version: 3,
        segments: [
          { category: "bike", role: "activity" },
          { role: "transition" },
          { category: "run", role: "activity" },
        ],
      },
    });
  });

  it("sets and clears an optional route association", async () => {
    const onSave = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{
          name: "Route workout",
          route_id: "99999999-9999-4999-8999-999999999999",
          structure: {
            version: 3,
            segments: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                role: "activity",
                category: "run",
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
        routeOptions={[{ id: "99999999-9999-4999-8999-999999999999", name: "River Loop" }]}
      />,
    );

    expect((screen.getByLabelText("Route") as HTMLSelectElement).value).toBe(
      "99999999-9999-4999-8999-999999999999",
    );
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ route_id: null });
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
});
