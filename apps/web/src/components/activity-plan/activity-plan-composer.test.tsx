/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivityPlanInterval,
  createActivityPlanStep,
  createActivityPlanStructure,
} from "../../lib/activity-plan-authoring";
import { ActivityPlanComposer } from "./activity-plan-composer";

vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));

let id = 0;

beforeEach(() => {
  id = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openStepMenu(row: Pick<typeof screen, "getByRole"> = screen, name = "Step 1 actions") {
  fireEvent.pointerDown(row.getByRole("button", { name }), { button: 0, ctrlKey: false });
}

type Queries = Pick<typeof screen, "getByRole" | "queryByRole">;
function duration(row: Queries = screen, part = "seconds") {
  fireEvent.click(row.getByRole("button", { name: /, duration:/ }));
  return row.getByRole("textbox", { name: new RegExp(`, duration ${part}$`) }) as HTMLInputElement;
}
function setSeconds(value: number, row: Queries = screen) {
  duration(row);
  if (value >= 3600 && !row.queryByRole("textbox", { name: /duration hours$/ }))
    fireEvent.click(row.getByRole("button", { name: "Add hours" }));
  const hours = row.queryByRole("textbox", { name: /duration hours$/ });
  if (hours) fireEvent.change(hours, { target: { value: String(Math.floor(value / 3600)) } });
  fireEvent.change(row.getByRole("textbox", { name: /duration minutes$/ }), {
    target: { value: String(Math.floor((value % 3600) / 60)) },
  });
  fireEvent.change(row.getByRole("textbox", { name: /duration seconds$/ }), {
    target: { value: String(value % 60) },
  });
}
function details(row: Queries = screen) {
  fireEvent.click(row.getByRole("button", { name: /, details$/ }));
}
function target(index = 1, row: Queries = screen) {
  if (!row.queryByRole("button", { name: new RegExp(`, target ${index}:`) })) details(row);
  fireEvent.click(row.getByRole("button", { name: new RegExp(`, target ${index}:`) }));
}
function intensity(index = 1, row: Queries = screen) {
  target(index, row);
  return row.getByRole("textbox", {
    name: index === 1 ? /, Intensity$/ : new RegExp(`, Target ${index} intensity$`),
  }) as HTMLInputElement;
}
function metric(type: string, index = 1, row: Queries = screen) {
  target(index, row);
  fireEvent.change(
    row.getByRole("combobox", {
      name: index === 1 ? /, Target metric$/ : new RegExp(`, Target ${index} metric$`),
    }),
    { target: { value: type } },
  );
}
function rpe(value: number, index = 1, row: Queries = screen) {
  target(index, row);
  fireEvent.click(row.getByRole("radio", { name: new RegExp(`, target ${index}, RPE ${value}$`) }));
}
function purpose(value: string, row: Queries = screen) {
  fireEvent.click(row.getByRole("button", { name: /, purpose:/ }));
  fireEvent.change(row.getByRole("combobox", { name: /, purpose$/ }), { target: { value } });
}
function mode(type: string, row: Queries = screen) {
  fireEvent.click(row.getByRole("button", { name: /, duration:/ }));
  fireEvent.change(row.getByRole("combobox", { name: /, completion mode$/ }), {
    target: { value: type },
  });
}

describe("ActivityPlanComposer", () => {
  it("Escape restores only the active snapshot, including an earlier invalid snapshot, while Close retains changes", async () => {
    const structure = createActivityPlanStructure("bike");
    const segment = structure.segments[0];
    const interval = segment?.role === "activity" ? segment.intervals[0] : undefined;
    const step = interval?.steps[0];
    if (!step || !interval) throw new Error("Missing fixture");
    step.duration = { type: "time", seconds: 180 };
    step.targets = [
      { type: "watts", intensity: 250 },
      { type: "RPE", intensity: 5 },
    ];
    interval.steps.push({
      ...createActivityPlanStep("Recovery", "recovery"),
      duration: { type: "time", seconds: 61 },
    });
    const save = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Snapshots", structure }}
        mode="edit"
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    const work = within(screen.getByRole("group", { name: "Interval 1, step 1" }));
    const recovery = within(screen.getByRole("group", { name: "Interval 1, step 2" }));
    fireEvent.change(duration(work, "minutes"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(work.getByRole("button", { name: /duration: 4 min/ })).toBeTruthy();
    fireEvent.change(duration(recovery), { target: { value: "bad" } });
    fireEvent.change(intensity(1, work), { target: { value: "251.1234567" } });
    fireEvent.keyDown(work.getByRole("textbox", { name: /, Intensity$/ }), { key: "Escape" });
    expect(document.activeElement).toBe(work.getByRole("button", { name: /target 1: 250 W/ }));
    expect(recovery.getByRole("button", { name: /duration: Unresolved/ })).toBeTruthy();
    const raw = duration(recovery);
    expect(raw.value).toBe("bad");
    fireEvent.change(raw, { target: { value: "2" } });
    fireEvent.keyDown(raw, { key: "Escape" });
    expect(recovery.getByRole("button", { name: /duration: Unresolved/ })).toBeTruthy();
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(save).not.toHaveBeenCalled();
    expect((document.activeElement as HTMLInputElement).value).toBe("bad");
    fireEvent.change(document.activeElement as HTMLInputElement, { target: { value: "1" } });
    fireEvent.change(intensity(1, work), { target: { value: "251.1234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps).toMatchObject([
      {
        id: step.id,
        duration: { type: "time", seconds: 240 },
        targets: [
          { type: "watts", intensity: 251.1234567 },
          { type: "RPE", intensity: 5 },
        ],
      },
      { duration: { type: "time", seconds: 61 } },
    ]);
  });
  it.each([
    1, 61, 3661, 86400,
  ])("preserves exact %i seconds on opening, closing and saving semantic duration", async (seconds) => {
    const structure = createActivityPlanStructure();
    const segment = structure.segments[0];
    const step = segment?.role === "activity" ? segment.intervals[0]?.steps[0] : undefined;
    if (!step) throw new Error("Missing fixture");
    step.duration = { type: "time", seconds };
    const save = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Exact time", structure }}
        mode="edit"
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    duration();
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps[0].duration).toEqual({
      type: "time",
      seconds,
    });
  });
  it("preserves exact distance and incomplete kilometers across unit switching and Escape", async () => {
    const save = vi.fn();
    render(<ActivityPlanComposer mode="create" onSave={save} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Distance" } });
    metric("speed");
    fireEvent.change(intensity(), { target: { value: "12.3456789" } });
    mode("distance");
    fireEvent.change(screen.getByRole("textbox", { name: /, Distance$/ }), {
      target: { value: "1234" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /distance unit$/ }), {
      target: { value: "km" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    fireEvent.click(screen.getByRole("button", { name: /, duration:/ }));
    const input = screen.getByRole("textbox", { name: /, Distance$/ }) as HTMLInputElement;
    expect(input.value).toBe("1.234");
    fireEvent.change(input, { target: { value: "1.2345" } });
    fireEvent.change(screen.getByRole("combobox", { name: /distance unit$/ }), {
      target: { value: "m" },
    });
    expect(input.value).toBe("1.2345");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps[0]).toMatchObject({
      duration: { type: "distance", meters: 1234 },
      targets: [{ type: "speed", intensity: 12.3456789 }],
    });
  });
  it.each([
    true,
    false,
  ])("prefers watts over RPE with rpeFirst=%s while retaining exact saved order", async (rpeFirst) => {
    const structure = createActivityPlanStructure("bike");
    const segment = structure.segments[0];
    const step = segment?.role === "activity" ? segment.intervals[0]?.steps[0] : undefined;
    if (!step) throw new Error("Missing fixture");
    const rpe = { type: "RPE" as const, intensity: 5 };
    const watts = { type: "watts" as const, intensity: 250 };
    step.targets = rpeFirst ? [rpe, watts] : [watts, rpe];
    const save = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Target priority", structure }}
        mode="edit"
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("textbox", { name: /intensity/i })).toBeNull();
    expect(screen.getByRole("button", { name: /target \d: 5 RPE/ })).toBeTruthy();
    const objectiveInput = intensity(rpeFirst ? 2 : 1);
    fireEvent.change(objectiveInput, { target: { value: "275" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps[0].targets).toEqual(
      rpeFirst ? [rpe, { ...watts, intensity: 275 }] : [{ ...watts, intensity: 275 }, rpe],
    );
  });

  it.each([
    "Step 1 actions",
    "Interval 1 actions",
  ])("freezes already-open %s when a save becomes pending", (menu) => {
    const props = { mode: "create" as const, onCancel: vi.fn(), onSave: vi.fn() };
    const view = render(<ActivityPlanComposer {...props} />);
    openStepMenu(screen, menu);
    view.rerender(<ActivityPlanComposer {...props} pending />);
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(item);
    }
    expect(screen.getAllByTestId(/^activity-plan-step-/)).toHaveLength(1);
    expect(screen.getByLabelText(/, duration:/).matches(":disabled")).toBe(true);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("opens supporting details and focuses an existing invalid half-point target from its schema error", () => {
    const structure = createActivityPlanStructure("bike");
    const segment = structure.segments[0];
    const step = segment?.role === "activity" ? segment.intervals[0]?.steps[0] : undefined;
    if (!step) throw new Error("Missing fixture");
    step.targets = [
      { type: "watts", intensity: 200 },
      { type: "RPE", intensity: 5.25 },
    ];
    render(
      <ActivityPlanComposer
        initial={{ name: "Legacy target", structure }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /RPE must be.*half-point/ }));
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /, target 2, RPE 1$/ }));
    expect(screen.getByText(/Existing RPE 5.25 needs correction/)).toBeTruthy();
  });

  it("keeps the prescription path compact with accessible exact inputs and one secondary menu", () => {
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={vi.fn()} />);
    const row = within(screen.getByRole("group", { name: "Interval 1, step 1" }));
    expect(row.getByRole("button", { name: /, purpose: work/ })).toBeTruthy();
    expect(row.queryByRole("combobox")).toBeNull();
    expect(row.getByRole("button", { name: /, duration:/ })).toBeTruthy();
    expect(row.getByRole("button", { name: /, target 1: 5 RPE/ })).toBeTruthy();
    expect(row.queryByRole("textbox")).toBeNull();
    expect(row.queryByRole("slider")).toBeNull();
    expect(row.queryByRole("button", { name: /Increase|Decrease/ })).toBeNull();
    expect(row.queryByRole("button", { name: "Add RPE target" })).toBeNull();
    expect(row.queryByRole("button", { name: "Delete step 1" })).toBeNull();
    expect(row.getByRole("button", { name: /, details$/ }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(screen.getByLabelText("Interval name")).toBeTruthy();
    expect(screen.queryByText("Interval name")).toBeNull();
    openStepMenu(row);
    expect(screen.getByRole("menuitem", { name: "Duplicate step" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete step 1" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Add RPE target" })).toBeTruthy();
  });

  it("promotes objective effort visually without changing supporting-first target order", async () => {
    const structure = createActivityPlanStructure("bike");
    const segment = structure.segments[0];
    const step = segment?.role === "activity" ? segment.intervals[0]?.steps[0] : undefined;
    if (!step) throw new Error("Missing fixture");
    step.targets = [
      { type: "cadence", intensity: 87.25 },
      { type: "watts", intensity: 2500 },
    ];
    step.notes = "Relax shoulders";
    const save = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Supporting first", structure }}
        mode="edit"
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /target 1: 87.25 rpm/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /, details$/ }).textContent).toContain(
      "Instructions: Relax shoulders",
    );
    expect(screen.queryByRole("textbox", { name: /intensity/i })).toBeNull();
    fireEvent.change(intensity(2), {
      target: { value: "2500.125" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps[0].targets).toEqual([
      { type: "cadence", intensity: 87.25 },
      { type: "watts", intensity: 2500.125 },
    ]);
  });

  it("reopens and focuses a hidden invalid target without clearing its raw input through collapse or type change", () => {
    const structure = createActivityPlanStructure("bike");
    const segment = structure.segments[0];
    const step = segment?.role === "activity" ? segment.intervals[0]?.steps[0] : undefined;
    if (!step) throw new Error("Missing fixture");
    step.targets = [
      { type: "watts", intensity: 200 },
      { type: "cadence", intensity: 90 },
    ];
    const save = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Hidden input", structure }}
        mode="edit"
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    const input = intensity(2);
    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.blur(input);
    metric("RPE", 2);
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.queryByRole("textbox", { name: /, Target 2 intensity$/ })).toBeNull();
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /, Target 2 intensity$/ })).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("invalid");
  });

  it("duplicates current valid and invalid step edits under new stable IDs without clearing the original", async () => {
    const structure = createActivityPlanStructure();
    const segment = structure.segments[0];
    const step = segment?.role === "activity" ? segment.intervals[0]?.steps[0] : undefined;
    if (!step) throw new Error("Missing fixture");
    const save = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Copies", structure }}
        mode="edit"
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(duration(), { target: { value: "invalid" } });
    rpe(5.5);
    openStepMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate step" }));
    const copy = within(screen.getByRole("group", { name: "Interval 1, step 2" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(copy.getByRole("textbox", { name: /duration seconds$/ })),
    );
    expect(
      (copy.getByRole("textbox", { name: /duration seconds$/ }) as HTMLInputElement).value,
    ).toBe("invalid");
    expect(copy.getByRole("button", { name: /target 1: 5.5 RPE/ })).toBeTruthy();
    openStepMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete step 1" }));
    expect(duration().value).toBe("invalid");
    setSeconds(3661);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const saved = save.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps[0];
    expect(saved.id).not.toBe(step.id);
    expect(saved.duration).toEqual({ type: "time", seconds: 3661 });
    expect(saved.targets).toEqual([{ type: "RPE", intensity: 5.5 }]);
  });

  it("adds a target only from the menu, reveals details and focuses the new exact field", async () => {
    const save = vi.fn();
    render(<ActivityPlanComposer mode="create" onSave={save} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Plan name"), {
      target: { value: "More effort detail" },
    });
    openStepMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add RPE target" }));
    const input = await screen.findByRole("radio", { name: /, target 2, RPE 5$/ });
    await waitFor(() => expect(document.activeElement).toBe(input));
    metric("bpm", 2);
    const objectiveInput = intensity(2);
    fireEvent.change(objectiveInput, { target: { value: "145" } });
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.getByRole("button", { name: /target 2: 145 bpm/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /target 1: 5 RPE/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps[0].targets).toEqual([
      { type: "RPE", intensity: 5 },
      { type: "bpm", intensity: 145 },
    ]);
  });

  it("uses fixed RPE for repetition steps and preserves invalid duration text on a mode change", () => {
    render(<ActivityPlanComposer mode="create" onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Strength" } });
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "strength" } });
    fireEvent.change(duration(), { target: { value: "1.5" } });
    mode("repetitions");
    expect(duration().value).toBe("1.5");
    fireEvent.change(duration(), { target: { value: "0" } });
    mode("repetitions");
    expect(screen.queryByRole("combobox", { name: /Target metric/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Increase|Decrease/ })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /, Repetitions$/ }), {
      target: { value: "8" },
    });
    rpe(5.5);
    expect(screen.getAllByRole("radio")).toHaveLength(19);
    expect(screen.queryByRole("radio", { name: /RPE 5.25$/ })).toBeNull();
  });

  it("edits all rows across intervals without selecting and saves their original identities together", async () => {
    const structure = createActivityPlanStructure("bike");
    const segment = structure.segments[0];
    if (segment?.role !== "activity" || !segment.intervals[0]) throw new Error("Missing fixture");
    segment.intervals[0].steps.push(createActivityPlanStep("Recovery", "recovery"));
    segment.intervals.push(createActivityPlanInterval("Finish"));
    const ids = segment.intervals.flatMap((interval) => [
      interval.id,
      ...interval.steps.map((step) => step.id),
    ]);
    const save = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Inline", structure }}
        mode="edit"
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    const first = within(screen.getByRole("group", { name: "Interval 1, step 1" }));
    const recovery = within(screen.getByRole("group", { name: "Interval 1, step 2" }));
    const finish = within(screen.getByRole("group", { name: "Interval 2, step 1" }));
    setSeconds(300, first);
    rpe(3, 1, recovery);
    purpose("cooldown", finish);
    setSeconds(120, finish);
    const elements = [...document.querySelectorAll("[id]")];
    expect(new Set(elements.map((element) => element.id)).size).toBe(elements.length);
    for (const label of document.querySelectorAll("label[for]")) {
      expect(document.getElementById(label.getAttribute("for") ?? "")).not.toBeNull();
    }
    expect(screen.queryByRole("button", { name: "Steady effort" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const intervals = save.mock.calls[0]?.[0].structure.segments[0].intervals;
    expect(
      intervals.flatMap((interval: { id: string; steps: { id: string }[] }) => [
        interval.id,
        ...interval.steps.map((step) => step.id),
      ]),
    ).toEqual(ids);
    expect(intervals[0].steps[0].duration.seconds).toBe(300);
    expect(intervals[0].steps[1].targets[0].intensity).toBe(3);
    expect(intervals[1].steps[0]).toMatchObject({
      purpose: "cooldown",
      duration: { type: "time", seconds: 120 },
    });
  });

  it("focuses newly added intervals, steps and recovery, and timeline selection scrolls to a mounted dose field", () => {
    render(<ActivityPlanComposer mode="create" onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add interval" }));
    const interval = within(screen.getByRole("group", { name: "Interval 2: Interval 2" }));
    expect(document.activeElement).toBe(interval.getByLabelText("Interval name"));
    fireEvent.click(interval.getByRole("button", { name: "Add step" }));
    const step = within(screen.getByRole("group", { name: "Interval 2, step 2" }));
    expect(document.activeElement).toBe(step.getByRole("textbox", { name: /duration minutes$/ }));
    fireEvent.click(interval.getByRole("button", { name: "Add recovery step" }));
    const recovery = within(screen.getByRole("group", { name: "Interval 2, step 3" }));
    expect(document.activeElement).toBe(
      recovery.getByRole("textbox", { name: /duration minutes$/ }),
    );
    expect(recovery.getByRole("button", { name: /purpose: recovery/ })).toBeTruthy();
    const firstRow = within(screen.getByRole("group", { name: "Interval 1, step 1" }));
    fireEvent.click(screen.getByTestId("activity-plan-composer-timeline-bar-0"));
    expect(document.activeElement).toBe(
      firstRow.getByRole("textbox", { name: /duration minutes$/ }),
    );
    expect(screen.getAllByRole("textbox", { name: /duration seconds$/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /, duration:/ })).toHaveLength(4);
  });

  it("focuses the actual inline field for schema errors and exact-draft errors", () => {
    const structure = createActivityPlanStructure();
    const segment = structure.segments[0];
    const interval = segment?.role === "activity" ? segment.intervals[0] : undefined;
    if (!interval) throw new Error("Missing fixture");
    interval.steps.push({
      ...createActivityPlanStep("Legacy"),
      purpose: undefined,
      targets: [{ type: "RPE", intensity: 5.25 }],
    });
    render(
      <ActivityPlanComposer
        initial={{ name: "Errors", structure }}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const second = within(screen.getByRole("group", { name: "Interval 1, step 2" }));
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(document.activeElement).toBe(second.getByRole("combobox", { name: /, purpose$/ }));
    purpose("work", second);
    fireEvent.click(screen.getByRole("button", { name: /RPE must be.*half-point/ }));
    expect(document.activeElement).toBe(second.getByRole("radio", { name: /, RPE 1$/ }));
    rpe(5, 1, second);
    fireEvent.change(duration(second), { target: { value: "bad" } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(document.activeElement).toBe(second.getByRole("textbox", { name: /duration seconds$/ }));
  });

  it("keeps invalid drafts by row and target identity through removal and category changes", () => {
    const structure = createActivityPlanStructure("bike");
    const segment = structure.segments[0];
    const interval = segment?.role === "activity" ? segment.intervals[0] : undefined;
    const first = interval?.steps[0];
    if (!first || !interval) throw new Error("Missing fixture");
    first.targets = [
      { type: "RPE", intensity: 5 },
      { type: "watts", intensity: 200 },
      { type: "cadence", intensity: 90 },
    ];
    interval.steps.push(createActivityPlanStep("Next"));
    render(
      <ActivityPlanComposer
        initial={{ name: "Draft identities", structure }}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const row = within(screen.getByRole("group", { name: "Interval 1, step 1" }));
    const next = within(screen.getByRole("group", { name: "Interval 1, step 2" }));
    rpe(5.5, 1, row);
    fireEvent.change(intensity(2, row), {
      target: { value: "second invalid" },
    });
    fireEvent.change(duration(next), { target: { value: "1.5" } });
    target(1, row);
    fireEvent.click(row.getByRole("button", { name: "Remove target 1" }));
    expect(intensity(1, row).value).toBe("second invalid");
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "run" } });
    expect((row.getByRole("combobox", { name: /Target metric/ }) as HTMLSelectElement).value).toBe(
      "watts",
    );
    expect(intensity(1, row).value).toBe("second invalid");
    fireEvent.click(row.getByRole("button", { name: "Remove target 1" }));
    expect(intensity(1, row).value).toBe("90");
    expect(duration(next).value).toBe("1.5");
    openStepMenu(row);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete step 1" }));
    expect(duration().value).toBe("1.5");
  });

  it("preserves drafts when duplicating an interval with new IDs, and removes only the deleted interval's drafts", () => {
    render(<ActivityPlanComposer mode="create" onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Copies" } });
    fireEvent.change(duration(), { target: { value: "invalid" } });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Interval 1 actions" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate interval" }));
    const copy = within(screen.getByRole("group", { name: "Interval 2, step 1" }));
    expect(duration(copy).value).toBe("invalid");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Interval 1 actions" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete interval" }));
    expect(duration().value).toBe("invalid");
    setSeconds(300);
    expect(screen.getByRole("button", { name: "Create plan" }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("keeps populated instructions discoverable and retains cleared text through collapse", async () => {
    const structure = createActivityPlanStructure();
    const segment = structure.segments[0];
    const interval = segment?.role === "activity" ? segment.intervals[0] : undefined;
    if (!interval?.steps[0]) throw new Error("Missing fixture");
    interval.notes = "Interval cue";
    interval.steps[0].notes = "Step cue";
    const save = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Notes", structure }}
        mode="edit"
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    const intervalDisclosure = screen.getByText("Interval instructions: Interval cue");
    const stepDisclosure = screen.getByRole("button", { name: /, details$/ });
    expect(intervalDisclosure.closest("details")?.open).toBe(false);
    expect(stepDisclosure.textContent).toContain("Instructions: Step cue");
    expect(stepDisclosure.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(intervalDisclosure);
    fireEvent.click(stepDisclosure);
    const fields = screen.getAllByRole("textbox", { name: /instructions$/i });
    fields.forEach((field) => {
      fireEvent.change(field, { target: { value: "" } });
    });
    fireEvent.click(screen.getByText("Add interval instructions"));
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0].structure.segments[0].intervals[0]).toMatchObject({
      notes: "",
      steps: [{ notes: "" }],
    });
  });
  it("keeps invalid exact input while every inline step stays editable", () => {
    render(
      <ActivityPlanComposer
        initial={{ name: "Draft", structure: createActivityPlanStructure("bike") }}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(duration(), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    const first = within(screen.getByRole("group", { name: "Interval 1, step 1" }));
    const second = within(screen.getByRole("group", { name: "Interval 1, step 2" }));
    expect(document.activeElement).toBe(second.getByRole("textbox", { name: /duration minutes$/ }));
    setSeconds(420, second);
    expect(duration(first).value).toBe("1.5");
    expect(second.getByRole("button", { name: /duration: 7 min/ })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps the other target's invalid draft when removing an earlier target", () => {
    const structure = createActivityPlanStructure("bike");
    const segment = structure.segments[0];
    const step = segment?.role === "activity" ? segment.intervals[0]?.steps[0] : undefined;
    if (!step) throw new Error("Missing fixture step");
    step.targets = [
      { type: "RPE", intensity: 5 },
      { type: "watts", intensity: 200 },
    ];
    render(
      <ActivityPlanComposer
        initial={{ name: "Draft", structure }}
        mode="edit"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(intensity(2), { target: { value: "invalid" } });
    target(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove target 1" }));
    expect(intensity().value).toBe("invalid");
    expect(
      (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("retains invalid exact repeats on blur and treats that draft as dirty on Cancel", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ActivityPlanComposer
        initial={{ name: "Plan", structure: createActivityPlanStructure("bike") }}
        mode="edit"
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    const repeats = screen.getByLabelText("Repeats") as HTMLInputElement;
    fireEvent.change(repeats, { target: { value: "1.5" } });
    fireEvent.blur(repeats);
    expect(repeats.value).toBe("1.5");
    expect(
      (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("single-flights a save and freezes all controls until a rejected write retains the draft", async () => {
    let reject!: (error: Error) => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((_done, fail) => {
          reject = fail;
        }),
    );
    render(
      <ActivityPlanComposer
        initial={{ name: "Pending plan", structure: createActivityPlanStructure("bike") }}
        mode="edit"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    const form = screen.getByTestId("activity-plan-composer");
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Plan name").matches(":disabled")).toBe(true);
    expect(screen.getByLabelText("Activity category").matches(":disabled")).toBe(true);
    await act(async () => reject(new Error("Save unavailable")));
    expect(screen.getByRole("alert").textContent).toContain("Save unavailable");
    expect((screen.getByLabelText("Plan name") as HTMLInputElement).value).toBe("Pending plan");
    expect(screen.getByLabelText("Plan name").matches(":disabled")).toBe(false);
  });

  it("acknowledges the save before navigation and never resubmits after navigation failure", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onSaved = vi.fn(() => {
      const unload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(false);
      throw new Error("Navigation failed");
    });
    render(
      <ActivityPlanComposer
        initial={{ name: "Loaded", structure: createActivityPlanStructure("bike") }}
        mode="edit"
        onSave={onSave}
        onSaved={onSaved}
        onCancel={onCancel}
      />,
    );
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Saved draft" } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    await screen.findByText(/Plan saved, but it could not be opened/);
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("edits an objective target without dropping existing supporting targets", async () => {
    const structure = createActivityPlanStructure("bike");
    const segment = structure.segments[0];
    if (segment?.role !== "activity" || !segment.intervals[0]?.steps[0])
      throw new Error("Missing fixture");
    segment.intervals[0].steps[0].targets = [
      { type: "watts", intensity: 200 },
      { type: "cadence", intensity: 90 },
    ];
    const onSave = vi.fn();
    render(
      <ActivityPlanComposer
        mode="edit"
        initial={{ name: "Supporting targets", structure }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.change(intensity(), { target: { value: "225" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps[0].targets).toEqual([
      { type: "watts", intensity: 225 },
      { type: "cadence", intensity: 90 },
    ]);
  });
  it.each([
    ["run", ["time", "distance"]],
    ["bike", ["time", "distance"]],
    ["swim", ["time", "distance"]],
    ["strength", ["time", "repetitions"]],
    ["other", ["time"]],
  ])("offers only supported %s duration choices", (category, choices) => {
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: category } });
    duration();
    if (choices.length === 1) {
      expect(screen.queryByRole("combobox", { name: /completion mode/ })).toBeNull();
      expect(screen.getByText("Time")).toBeTruthy();
      expect(screen.getByRole("textbox", { name: /duration seconds$/ })).toBeTruthy();
      return;
    }
    expect(
      Array.from(
        (screen.getByRole("combobox", { name: /completion mode/ }) as HTMLSelectElement).options,
      ).map((option) => option.value),
    ).toEqual(choices);
  });

  it("keeps legacy purpose missing and untilFinished visible until explicitly repaired", async () => {
    const structure = createActivityPlanStructure();
    const segment = structure.segments[0];
    if (segment?.role !== "activity" || !segment.intervals[0]?.steps[0])
      throw new Error("Missing fixture");
    const step = segment.intervals[0].steps[0];
    delete step.purpose;
    step.name = "Warmup";
    step.duration = { type: "untilFinished" };
    const onSave = vi.fn();
    render(
      <ActivityPlanComposer
        mode="edit"
        initial={{ name: "Legacy", structure }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.getByRole("button", { name: /purpose: Choose purpose/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /duration: Until finished/ })).toBeTruthy();
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).not.toHaveBeenCalled();
    purpose("technique");
    mode("time");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps[0]).toMatchObject({
      purpose: "technique",
      duration: { type: "time" },
    });
  });

  it("retains watts and its numeric value through category and repetition changes", () => {
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "bike" } });
    metric("watts");
    fireEvent.change(intensity(), { target: { value: "250" } });
    mode("distance");
    fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "strength" } });
    expect(
      (screen.getByRole("combobox", { name: /completion mode/ }) as HTMLSelectElement).value,
    ).toBe("distance");
    mode("repetitions");
    expect(intensity().value).toBe("250");
    expect(
      (screen.getByRole("combobox", { name: /Target metric/ }) as HTMLSelectElement).value,
    ).toBe("watts");
    metric("RPE");
    expect(screen.getByText(/Existing RPE 250 needs correction/)).toBeTruthy();
  });

  it.each([
    { type: "%MaxHR", value: "101", label: "Intensity" },
    { type: "speed", value: "0", label: "Intensity" },
    { type: "cadence", value: "90", label: "Intensity" },
  ])("blocks invalid $type drafts without discarding the entered value", ({ type, value }) => {
    const onSave = vi.fn();
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Plan name"), {
      target: { value: "Invalid intensity" },
    });
    mode("distance");
    metric(type);
    fireEvent.change(intensity(), { target: { value } });
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).not.toHaveBeenCalled();
    expect(intensity().value).toBe(value);
  });
  it("authors a single-activity-category structure and exposes one plan-level activity category selector", async () => {
    const onSave = vi.fn();
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Web tempo" } });
    fireEvent.change(screen.getByLabelText("Activity category"), {
      target: { value: "bike" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: "Web tempo",
      structure: {
        version: 3,
        activity_category: "bike",
        segments: [{ role: "activity" }],
      },
    });
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("route_id");
    expect(screen.queryByRole("button", { name: "Transition" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add activity plan section" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add recovery" })).toBeNull();
  });

  it("retains incompatible targets when the activity category changes", async () => {
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={vi.fn()} />);

    metric("speed");
    fireEvent.change(screen.getByLabelText("Activity category"), {
      target: { value: "bike" },
    });
    expect((screen.getByLabelText("Activity category") as HTMLSelectElement).value).toBe("bike");
    expect(
      (screen.getByRole("combobox", { name: /Target metric/ }) as HTMLSelectElement).value,
    ).toBe("speed");
    expect(screen.getByRole("alert").textContent).toContain("not permitted");
  });

  it("does not present route selection when editing a structured plan", () => {
    const onSave = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{
          name: "Route activity",
          structure: {
            version: 3,
            activity_category: "run",
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

  it("does not offer deletion of the last activity section in a legacy plan", () => {
    render(
      <ActivityPlanComposer
        initial={{
          name: "Legacy recovery",
          structure: {
            version: 3,
            activity_category: "run",
            segments: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                role: "activity",
                name: "Run",
                intervals: [
                  {
                    id: "22222222-2222-4222-8222-222222222222",
                    name: "Main",
                    repetitions: 1,
                    steps: [
                      {
                        id: "33333333-3333-4333-8333-333333333333",
                        name: "Run",
                        duration: { type: "time", seconds: 60 },
                        targets: [{ type: "RPE", intensity: 5 }],
                      },
                    ],
                  },
                ],
              },
              {
                id: "44444444-4444-4444-8444-444444444444",
                role: "rest",
                name: "Rest",
                duration: { type: "time", seconds: 60 },
              },
            ],
          },
        }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(
      within(screen.getByTestId("activity-plan-segment-0")).queryByRole("button", {
        name: "Delete segment",
      }),
    ).toBeNull();
    expect(
      within(screen.getByTestId("activity-plan-segment-1")).getByRole("button", {
        name: "Delete segment",
      }),
    ).toBeTruthy();
  });

  it("prevents submission after removing the required interval", async () => {
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Incomplete" } });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Interval 1 actions" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete interval" }));

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
    expect((screen.getByLabelText("Plan name") as HTMLInputElement).value).toBe("Rejected");
  });

  it("blocks submission while an incomplete nested number draft remains visible", async () => {
    const onSave = vi.fn();
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Keyboard plan" } });
    fireEvent.change(screen.getByLabelText("Repeats"), { target: { value: "0" } });
    expect((screen.getByLabelText("Repeats") as HTMLInputElement).value).toBe("0");

    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Correct incomplete numeric values"),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects a target type change while retaining invalid exact text until explicit correction", async () => {
    const onSave = vi.fn();
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Target switch" } });
    metric("bpm");
    fireEvent.change(intensity(), { target: { value: "invalid" } });
    metric("speed");
    expect(
      (screen.getByRole("combobox", { name: /Target metric/ }) as HTMLSelectElement).value,
    ).toBe("bpm");
    expect(intensity().value).toBe("invalid");
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: /, Intensity$/ }));
    fireEvent.change(intensity(), { target: { value: "145" } });
    metric("speed");
    fireEvent.change(intensity(), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("does not discard invalid percentage zero when watts would permit zero", async () => {
    const onSave = vi.fn();
    render(
      <ActivityPlanComposer
        initial={{ name: "Numeric draft", structure: createActivityPlanStructure("bike") }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    metric("%MaxHR");
    const input = intensity();
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    metric("watts");
    expect(
      (screen.getByRole("combobox", { name: /Target metric/ }) as HTMLSelectElement).value,
    ).toBe("%MaxHR");
    expect(input.value).toBe("0");
    expect(document.activeElement).toBe(input);
    fireEvent.submit(screen.getByTestId("activity-plan-composer"));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "60" } });
    metric("watts");
    expect(intensity().value).toBe("60");
    fireEvent.change(intensity(), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].structure.segments[0].intervals[0].steps[0].targets).toEqual([
      { type: "watts", intensity: 0 },
    ]);
  });

  it("accepts fractional target intensity while still requiring whole repeats", async () => {
    const onSave = vi.fn();
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Speed work" } });
    metric("speed");
    fireEvent.change(intensity(), { target: { value: "14.4" } });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(
      onSave.mock.calls[0]?.[0].structure.segments[0]?.intervals[0]?.steps[0]?.targets[0],
    ).toMatchObject({ type: "speed", intensity: 14.4 });
  });

  it("fails closed rather than replacing a malformed stored structure", () => {
    render(
      <ActivityPlanComposer
        initial={{ name: "Malformed", structure: { version: 3, segments: [] } }}
        mode="edit"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByTestId("activity-plan-composer-unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("keeps the single optional plan text field behind an explicit details disclosure", () => {
    render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={vi.fn()} />);

    const details = screen.getByText("Plan details and settings").closest("details");
    expect(details?.open).toBe(false);
    fireEvent.click(screen.getByText("Plan details and settings"));
    expect(details?.open).toBe(true);
    expect(screen.getByLabelText("Description")).toBeTruthy();
    expect(screen.queryByLabelText("Coach or athlete notes")).toBeNull();
  });
});
