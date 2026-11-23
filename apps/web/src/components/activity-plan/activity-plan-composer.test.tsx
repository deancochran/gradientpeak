import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
// @vitest-environment jsdom
import { ActivityPlanComposer } from "./activity-plan-composer";

afterEach(cleanup);
function openOutlineActions(label: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: label }), { button: 0 });
}
const strictStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "22222222-2222-4222-8222-222222222222",
      name: "Warm up",
      instructions: "Easy",
      duration: { type: "time", seconds: 60 },
      targets: [{ type: "RPE", intensity: 5 }],
    },
  ],
});
function renderCreate(onSave = vi.fn()) {
  render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);
  return onSave;
}
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
describe("ActivityPlanComposer draft boundary", () => {
  it("uses a single-line note field, rejects multiline paste, and blocks overlong notes on save", () => {
    const onSave = renderCreate();
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "run" } });
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Short cues" } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    const input = screen.getByLabelText(/^Instructions \(optional\)/);
    expect(input.tagName).toBe("INPUT");
    fireEvent.paste(input, { clipboardData: { getData: () => "Easy\n\nStay relaxed." } });
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("alert").textContent).toContain("single line");
    fireEvent.change(input, { target: { value: "a".repeat(161) } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toHaveLength(161);
  });
  it("only offers rest for timed steps and blocks duration changes while rest is selected", () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "run" } });
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Rest" } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "distance" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    expect(screen.queryByRole("option", { name: "rest" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "time" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Target type 1"), { target: { value: "rest" } });
    expect((screen.getByLabelText("Target type 1") as HTMLSelectElement).value).toBe("rest");
    fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "distance" } });
    expect((screen.getByLabelText("Completion") as HTMLSelectElement).value).toBe("time");
    expect(
      (
        screen
          .getByLabelText("Completion")
          .querySelector('option[value="distance"]') as HTMLOptionElement
      ).disabled,
    ).toBe(true);
  });
  it("allows the first RPE target for repetitions and hides add target at its shared limit", () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "strength" } });
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Reps" } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "repetitions" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));

    expect((screen.getByLabelText("Target type 1") as HTMLSelectElement).value).toBe("RPE");
    expect(screen.queryByRole("button", { name: "Add target" })).toBeNull();
  });
  it("starts intentionally blank without a silent category, name, block, step, duration, or target", () => {
    const onSave = renderCreate();
    expect((screen.getByLabelText("Activity category") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByText("Block 1")).toBeNull();
    expect(screen.queryByLabelText("Description")).toBeNull();
    expect((screen.getByRole("button", { name: "Add step" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Add repeat" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).not.toHaveBeenCalled();
  });
  it("requires a chosen category before creating a standalone provisional step", () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "run" } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect((screen.getByLabelText("Completion") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByLabelText("Target intensity 1")).toBeNull();
    expect(screen.getByLabelText("Name (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Instructions (optional)")).toBeTruthy();
  });
  it("keeps provisional completion and target intensity blank and rejects save until the user supplies them", () => {
    const onSave = renderCreate();
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "run" } });
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Easy" } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "time" } });
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    expect((screen.getByLabelText("Target intensity 1") as HTMLInputElement).value).toBe("");
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Target intensity 1"), { target: { value: "5" } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ structure: expect.objectContaining({ activity_category: "run" }) }),
    );
  });
  it.each([
    ["run", 160, "spm"],
    ["bike", 80, "rpm"],
  ] as const)("shows existing %s cadence in its authored unit", (activityCategory, intensity, unit) => {
    const [step] = strictStructure.items;
    if (!step || step.type !== "step") throw new Error("Expected root step fixture");
    const structure = activityPlanStructureSchema.parse({
      ...strictStructure,
      activity_category: activityCategory,
      items: [{ ...step, targets: [{ type: "cadence", intensity }] }],
    });
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(`60 sec · ${intensity} ${unit}`)).toBeTruthy();
  });
  it("preserves a blank supplemental target draft when its type changes to cadence", () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "bike" } });
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Draft continuity" } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "time" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    fireEvent.change(screen.getByLabelText("Target type 1"), { target: { value: "watts" } });
    fireEvent.change(screen.getByLabelText("Target intensity 1"), { target: { value: "0" } });
    expect(
      (screen.getByRole("button", { name: "Create plan" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    expect((screen.getByLabelText("Target intensity 2") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Target type 2"), { target: { value: "cadence" } });
    expect((screen.getByLabelText("Target intensity 2") as HTMLInputElement).value).toBe("");
    expect(
      (screen.getByRole("button", { name: "Create plan" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it.each([
    ["run", "spm"],
    ["bike", "rpm"],
  ] as const)("shows the %s cadence unit for a blank newly selected target", (activityCategory, unit) => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Activity category"), {
      target: { value: activityCategory },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "time" } });
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    fireEvent.change(screen.getByLabelText("Target type 1"), { target: { value: "cadence" } });
    expect((screen.getByLabelText("Target intensity 1") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(unit)).toBeTruthy();
  });
  it("rejects a completed targetless step until a semantic target is added", () => {
    const onSave = renderCreate();
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "run" } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "time" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "60" } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Choose a target before saving");
  });
  it("accepts an explicit zero-power target with a supplemental cadence target after repairing raw input", () => {
    const onSave = renderCreate();
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "bike" } });
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Zero power" } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "time" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    fireEvent.change(screen.getByLabelText("Target type 1"), { target: { value: "watts" } });
    const watts = screen.getByLabelText("Target intensity 1");
    fireEvent.change(watts, { target: { value: "not-a-number" } });
    expect(watts.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(watts, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    fireEvent.change(screen.getByLabelText("Target type 2"), { target: { value: "cadence" } });
    fireEvent.change(screen.getByLabelText("Target intensity 2"), { target: { value: "90" } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        structure: expect.objectContaining({
          items: [
            expect.objectContaining({
              targets: [
                { type: "watts", intensity: 0 },
                { type: "cadence", intensity: 90 },
              ],
            }),
          ],
        }),
      }),
    );
  });
  it("hydrates an explicit strict edit unchanged and only persists through Core's strict resolver", () => {
    const onSave = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", description: "Keep this", structure: strictStructure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    expect((screen.getByLabelText("Activity category") as HTMLSelectElement).value).toBe("run");
    expect((screen.getByLabelText("Description (optional)") as HTMLTextAreaElement).value).toBe(
      "Keep this",
    );
    expect(screen.getByText("Warm up")).toBeTruthy();
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Existing", structure: strictStructure }),
    );
  });
  it("opens a targetless legacy step for repair, preserves its content, and saves only after a target is added", () => {
    const onSave = vi.fn();
    const [strictStep] = strictStructure.items;
    if (strictStep?.type !== "step") throw new Error("Expected root step fixture");
    const legacyTargetlessStructure = {
      ...strictStructure,
      items: [
        {
          ...strictStep,
          name: "Legacy steady",
          duration: { type: "time" as const, seconds: 90 },
          targets: [],
        },
      ],
    };
    render(
      <ActivityPlanComposer
        initial={{ name: "Legacy plan", structure: legacyTargetlessStructure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.queryByText("This plan has an unsupported activity structure.")).toBeNull();
    expect(screen.getByText("Legacy steady")).toBeTruthy();
    expect((screen.getByLabelText("Completion") as HTMLSelectElement).value).toBe("time");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("90");
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Choose a target before saving");
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    fireEvent.change(screen.getByLabelText("Target type 1"), { target: { value: "RPE" } });
    fireEvent.change(screen.getByLabelText("Target intensity 1"), { target: { value: "5" } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Legacy plan",
        structure: expect.objectContaining({
          items: [
            expect.objectContaining({
              name: "Legacy steady",
              duration: { type: "time", seconds: 90 },
              targets: [{ type: "RPE", intensity: 5 }],
            }),
          ],
        }),
      }),
    );
  });
  it("keeps a legacy rest-duration mismatch repairable", () => {
    const [strictStep] = strictStructure.items;
    if (!strictStep || strictStep.type !== "step") throw new Error("Expected root step fixture");
    render(
      <ActivityPlanComposer
        initial={{
          name: "Legacy rest",
          structure: {
            ...strictStructure,
            items: [
              {
                ...strictStep,
                duration: { type: "distance", meters: 800 },
                targets: [{ type: "rest" }],
              },
            ],
          },
        }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const completion = screen.getByLabelText("Completion") as HTMLSelectElement;
    expect(
      (completion.querySelector('option[value="distance"]') as HTMLOptionElement).disabled,
    ).toBe(true);
    expect(
      (
        screen
          .getByLabelText("Target type 1")
          .querySelector('option[value="rest"]') as HTMLOptionElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Target type 1"), { target: { value: "RPE" } });
    expect(
      (completion.querySelector('option[value="distance"]') as HTMLOptionElement).disabled,
    ).toBe(false);
  });
  it("does not auto-open a duplicate and keeps a sole-step drag and delete action available", () => {
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: strictStructure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    openOutlineActions("More actions for step 1");
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(document.querySelectorAll('[id^="step-editor-"]')).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Drag step/ })).toHaveLength(2);
    openOutlineActions("More actions for step 1");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    openOutlineActions("More actions for step 1");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText(/Choose an activity, then add a step or repeat/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add step" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
  it("asks before retaining incompatible content on a category change", () => {
    const [firstItem] = strictStructure.items;
    if (!firstItem || firstItem.type !== "step") throw new Error("Expected root step fixture");
    const firstStep = firstItem;
    const bike = activityPlanStructureSchema.parse({
      ...strictStructure,
      activity_category: "bike",
      items: [{ ...firstStep, targets: [{ type: "watts", intensity: 200 }] }],
    });
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: bike }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "swim" } });
    expect(screen.getByText(/Keep them and repair/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep and repair" }));
    expect((screen.getByLabelText("Target type 1") as HTMLSelectElement).value).toBe("watts");
  });
  it("collapses a repeat without changing its authored child or count", async () => {
    const onSave = vi.fn();
    const repeated = activityPlanStructureSchema.parse({
      ...strictStructure,
      items: [
        {
          type: "repeat",
          id: "44444444-4444-4444-8444-444444444444",
          count: 2,
          steps: strictStructure.items,
        },
      ],
    });
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: repeated }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse repeat 1" }));
    const childList = document.querySelector('[aria-label="Repeat 1 steps"]');
    expect((childList as HTMLOListElement | null)?.hidden).toBe(true);
    fireEvent.change(screen.getByLabelText("Repeat count"), { target: { value: "3" } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          structure: expect.objectContaining({
            items: [
              expect.objectContaining({
                count: 3,
                steps: [expect.objectContaining({ name: "Warm up" })],
              }),
            ],
          }),
        }),
      ),
    );
  });
  it("restores its live generation after Strict Mode's setup probe and saves once", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <StrictMode>
        <ActivityPlanComposer
          initial={{ name: "Existing", structure: strictStructure }}
          mode="edit"
          onCancel={vi.fn()}
          onSave={onSave}
        />
      </StrictMode>,
    );
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
  it("does not re-save a durable plan when navigation fails and is retried", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi
      .fn()
      .mockRejectedValueOnce(new Error("Route failed"))
      .mockResolvedValue(undefined);
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: strictStructure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={onSave}
        onSaved={onSaved}
      />,
    );
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    await screen.findByText("Route failed");
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry navigation" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it("keeps an invalid later target draft when deleting the earlier target", () => {
    const [firstItem] = strictStructure.items;
    if (!firstItem || firstItem.type !== "step") throw new Error("Expected root step fixture");
    const firstStep = firstItem;
    const twoTargets = activityPlanStructureSchema.parse({
      ...strictStructure,
      items: [
        {
          ...firstStep,
          targets: [
            { type: "cadence", intensity: 90 },
            { type: "speed", intensity: 6 },
          ],
        },
      ],
    });
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: twoTargets }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Target intensity 2"), { target: { value: "6.222" } });
    const [deleteTarget] = screen.getAllByRole("button", { name: "Delete target" });
    if (!deleteTarget) throw new Error("Expected a delete-target action.");
    fireEvent.click(deleteTarget);
    expect((screen.getByLabelText("Target intensity 1") as HTMLInputElement).value).toBe("6.222");
    expect(
      (screen.getByLabelText("Target intensity 1") as HTMLInputElement).getAttribute(
        "aria-invalid",
      ),
    ).toBe("true");
  });
  it("reorders stable step identities with the keyboard drag handle", () => {
    const [firstItem] = strictStructure.items;
    if (!firstItem || firstItem.type !== "step") throw new Error("Expected root step fixture");
    const firstStep = firstItem;
    const twoSteps = activityPlanStructureSchema.parse({
      ...strictStructure,
      items: [
        firstStep,
        { ...firstStep, id: "33333333-3333-4333-8333-333333333333", name: "Cool down" },
      ],
    });
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: twoSteps }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Drag step 2" }), {
      key: "ArrowUp",
      altKey: true,
    });
    expect(
      screen.getAllByRole("listitem").filter((item) => item.id.startsWith("activity-plan-step-"))[0]
        ?.textContent,
    ).toContain("Cool down");
  });
  it("allows a failed durable save to be corrected and submitted successfully", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("Save failed"))
      .mockResolvedValueOnce(undefined);
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: strictStructure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    await screen.findByText("Save failed");
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Save failed")).toBeNull();
  });
  it("does not send a second durable write when save is double-submitted", async () => {
    const save = deferred<void>();
    const onSave = vi.fn(() => save.promise);
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: strictStructure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).toHaveBeenCalledTimes(1);
    save.resolve();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
  });
  it("cancels a pending navigation retry without leaving the composer busy", async () => {
    const retry = deferred<void>();
    const onCancel = vi.fn();
    const onSaved = vi.fn(() => retry.promise);
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: strictStructure }}
        mode="edit"
        onCancel={onCancel}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onSaved={onSaved}
      />,
    );
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    retry.reject(new Error("Navigation failed"));
    await waitFor(() => {
      expect(screen.queryByText("Navigation failed")).toBeNull();
    });
  });
  it("does not run the post-save effect after the composer unmounts during a durable save", async () => {
    const save = deferred<void>();
    const onSaved = vi.fn();
    const view = render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: strictStructure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={() => save.promise}
        onSaved={onSaved}
      />,
    );
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    view.unmount();
    save.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onSaved).not.toHaveBeenCalled();
  });
  it("keeps fractional RPE, allows two-decimal speed, rejects over-precise drafts, and clears optional step text", () => {
    const onSave = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: strictStructure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    const intensity = screen.getByLabelText("Target intensity 1") as HTMLInputElement;
    fireEvent.change(intensity, { target: { value: "5.5" } });
    expect(intensity.getAttribute("aria-invalid")).toBe("false");
    fireEvent.change(intensity, { target: { value: "5.25" } });
    expect(intensity.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(screen.getByLabelText("Target type 1"), { target: { value: "speed" } });
    fireEvent.change(intensity, { target: { value: "5.25" } });
    expect(intensity.getAttribute("aria-invalid")).toBe("false");
    fireEvent.change(intensity, { target: { value: "5.255" } });
    expect(intensity.getAttribute("aria-invalid")).toBe("true");
    expect(intensity.value).toBe("5.255");
    fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Instructions (optional)"), { target: { value: "" } });
    fireEvent.change(intensity, { target: { value: "5.5" } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        structure: expect.objectContaining({
          items: [
            expect.not.objectContaining({
              name: expect.anything(),
              instructions: expect.anything(),
            }),
          ],
        }),
      }),
    );
  });
  it("preserves invalid repeat and target drafts and requires repair before duplication", () => {
    const repeated = activityPlanStructureSchema.parse({
      ...strictStructure,
      items: [
        {
          type: "repeat",
          id: "44444444-4444-4444-8444-444444444444",
          count: 2,
          steps: strictStructure.items,
        },
      ],
    });
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: repeated }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Repeat count"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Target intensity 1"), { target: { value: "5.25" } });
    openOutlineActions("More actions for repeat 1");
    expect(screen.getByRole("menuitem", { name: "Duplicate" }).hasAttribute("data-disabled")).toBe(
      true,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    openOutlineActions("More actions for step 1");
    expect(screen.getByRole("menuitem", { name: "Duplicate" }).hasAttribute("data-disabled")).toBe(
      true,
    );
    expect(screen.getByDisplayValue("1.5")).toBeTruthy();
    expect(screen.getByDisplayValue("5.25")).toBeTruthy();
  });
  it("preserves an invalid target draft on move and blocks duplication until repaired", () => {
    const first = strictStructure.items[0];
    if (first?.type !== "step") throw new Error("Expected standalone fixture");
    const twoSteps = activityPlanStructureSchema.parse({
      ...strictStructure,
      items: [first, { ...first, id: "33333333-3333-4333-8333-333333333333", name: "Cool down" }],
    });
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: twoSteps }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Target intensity 1"), { target: { value: "5.25" } });
    openOutlineActions("More actions for step 1");
    expect(screen.getByRole("menuitem", { name: "Duplicate" }).hasAttribute("data-disabled")).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move later" }));
    expect((screen.getByLabelText("Target intensity 1") as HTMLInputElement).value).toBe("5.25");
    expect(
      screen.getAllByRole("listitem").filter((item) => item.id.startsWith("activity-plan-step-"))[0]
        ?.textContent,
    ).toContain("Cool down");
  });
  it("uses native drag events to move a step, rather than only styling a drag handle", () => {
    const [firstItem] = strictStructure.items;
    if (!firstItem || firstItem.type !== "step") throw new Error("Expected root step fixture");
    const firstStep = firstItem;
    const twoSteps = activityPlanStructureSchema.parse({
      ...strictStructure,
      items: [
        firstStep,
        { ...firstStep, id: "33333333-3333-4333-8333-333333333333", name: "Cool down" },
      ],
    });
    const dataTransfer = { effectAllowed: "", getData: vi.fn(() => ""), setData: vi.fn() };
    render(
      <ActivityPlanComposer
        initial={{ name: "Existing", structure: twoSteps }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    fireEvent.dragStart(screen.getByRole("button", { name: "Drag step 2" }), { dataTransfer });
    const target = screen.getByRole("button", { name: "Drop before item 1" });
    if (!target) throw new Error("Expected the first step drop target.");
    fireEvent.drop(target, { dataTransfer });
    expect(
      screen.getAllByRole("listitem").filter((item) => item.id.startsWith("activity-plan-step-"))[0]
        ?.textContent,
    ).toContain("Cool down");
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "text/plain",
      "33333333-3333-4333-8333-333333333333",
    );
  });
});
