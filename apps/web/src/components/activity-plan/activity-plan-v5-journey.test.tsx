// @vitest-environment jsdom
import { compileActivityPlan } from "@repo/core/activity-plan";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { type ActivityPlanAuthoringValues, ActivityPlanComposer } from "./activity-plan-composer";

afterEach(cleanup);

it("authors root and repeated steps, moves across boundaries, duplicates and ungroups without changing dose, and reopens", async () => {
  let saved: ActivityPlanAuthoringValues | undefined;
  const onSave = vi.fn((value: ActivityPlanAuthoringValues) => {
    saved = value;
  });
  const view = render(<ActivityPlanComposer mode="create" onCancel={vi.fn()} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "V5 journey" } });
  fireEvent.change(screen.getByLabelText("Activity category"), { target: { value: "run" } });
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  fireEvent.click(screen.getByRole("button", { name: "Add name" }));
  fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "Work" } });
  fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "distance" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "800" } });
  fireEvent.click(screen.getByRole("button", { name: "Add target" }));
  fireEvent.change(screen.getByLabelText("Target intensity 1"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Add repeat" }));
  const repeatId = screen.getByRole("option", { name: "Repeat 2" }).getAttribute("value");
  if (!repeatId) throw new Error("Expected repeat destination");
  fireEvent.change(screen.getByLabelText("Move Work to"), { target: { value: repeatId } });
  fireEvent.change(screen.getByLabelText("Repeat count"), { target: { value: "3" } });
  fireEvent.click(
    within(screen.getByTestId("activity-plan-item-0")).getByRole("button", { name: "Add step" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add name" }));
  fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "Recovery" } });
  fireEvent.change(screen.getByLabelText("Completion"), { target: { value: "time" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "60" } });
  fireEvent.change(screen.getByLabelText("Move Work to"), { target: { value: "root" } });
  const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
  fireEvent.dragStart(screen.getByRole("button", { name: "Drag step 2" }), { dataTransfer });
  fireEvent.drop(screen.getByRole("button", { name: "Drop before item 1" }), { dataTransfer });
  expect(within(screen.getByTestId("activity-plan-item-0")).getByText("Work")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Duplicate item" }));
  const firstUngroup = screen.getAllByRole("button", { name: "Ungroup repeat" })[0];
  if (!firstUngroup) throw new Error("Expected repeat ungroup control");
  fireEvent.click(firstUngroup);
  fireEvent.submit(screen.getByTestId("activity-plan-composer"));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  if (!saved) throw new Error("Expected saved V5 plan");
  const persisted = saved;
  expect(persisted.structure.items).toHaveLength(5);
  expect(persisted.structure.items[0]).toMatchObject({
    type: "step",
    name: "Work",
    duration: { type: "distance", meters: 800 },
  });
  expect(persisted.structure.items[4]).toMatchObject({ type: "repeat", count: 3 });
  expect(compileActivityPlan(persisted.structure).occurrences).toHaveLength(7);
  view.unmount();
  const reopenedSave = vi.fn();
  render(
    <ActivityPlanComposer
      mode="edit"
      initial={persisted}
      onCancel={vi.fn()}
      onSave={reopenedSave}
    />,
  );
  fireEvent.submit(screen.getByTestId("activity-plan-composer"));
  await waitFor(() =>
    expect(reopenedSave).toHaveBeenCalledWith(
      expect.objectContaining({ structure: persisted.structure }),
    ),
  );
}, 10_000);
