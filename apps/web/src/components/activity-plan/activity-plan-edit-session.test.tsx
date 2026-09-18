/** @vitest-environment jsdom */

import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  createActivityPlanStep,
  createActivityPlanStructure,
} from "../../lib/activity-plan-authoring";
import { ActivityPlanEditSession } from "./activity-plan-edit-session";

vi.mock("../../lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    guardedCancel: (fn: () => void) => fn(),
    markSaved: vi.fn(),
  }),
}));
afterEach(cleanup);

it("sends the editing snapshot revision after background refresh and preserves drafts on conflict", async () => {
  const structure = createActivityPlanStructure();
  const segment = structure.segments[0];
  const interval = segment?.role === "activity" ? segment.intervals[0] : undefined;
  if (!segment || !interval) throw new Error("Missing fixture interval");
  interval.steps.push(createActivityPlanStep("Recovery", "recovery"));
  const adaptation = {
    controls: [
      {
        id: crypto.randomUUID(),
        key: "repeats",
        label: "Repeats",
        kind: "interval_repetitions" as const,
        range: { minimum: 1, default: 1, maximum: 3, increment: 1 },
        targets: [
          {
            type: "interval_repetitions" as const,
            activitySegmentId: segment.id,
            intervalId: interval.id,
          },
        ],
      },
    ],
  };
  const edit = {
    id: "plan",
    name: "Original",
    description: null,
    notes: null,
    structure: activityPlanStructureSchema.parse(structure),
    structureHash: `v1:sha256:${"a".repeat(64)}`,
    activityPlanRevision: 7,
    gpsRecordingEnabled: true,
    contentVisibility: "private" as const,
    trainingIntent: "general_maintenance" as const,
    adaptation,
  };
  const update = vi.fn().mockRejectedValue(new Error("STALE_ACTIVITY_PLAN_REVISION"));
  const { rerender } = render(
    <ActivityPlanEditSession edit={edit} onCancel={vi.fn()} onUpdate={update} pending={false} />,
  );
  fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Keep draft" } });
  const first = within(screen.getByRole("group", { name: "Interval 1, step 1" }));
  const second = within(screen.getByRole("group", { name: "Interval 1, step 2" }));
  fireEvent.click(first.getByRole("button", { name: /, duration:/ }));
  fireEvent.change(first.getByRole("textbox", { name: /duration minutes$/ }), {
    target: { value: "12" },
  });
  fireEvent.click(second.getByRole("button", { name: /, duration:/ }));
  fireEvent.change(second.getByRole("textbox", { name: /duration minutes$/ }), {
    target: { value: "2" },
  });
  rerender(
    <ActivityPlanEditSession
      edit={{
        ...edit,
        activityPlanRevision: 8,
        adaptation: null,
        structureHash: `v1:sha256:${"b".repeat(64)}`,
      }}
      onCancel={vi.fn()}
      onUpdate={update}
      pending={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Keep draft",
        expectedRevision: 7,
        expectedStructureHash: edit.structureHash,
        adaptation,
        training_intent: edit.trainingIntent,
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Your changes are kept"),
  );
  expect((screen.getByLabelText("Plan name") as HTMLInputElement).value).toBe("Keep draft");
  expect(first.getByRole("button", { name: /duration: 12 min/ })).toBeTruthy();
  expect(second.getByRole("button", { name: /duration: 2 min/ })).toBeTruthy();
  expect(update.mock.calls[0]?.[0].structure.segments[0].intervals[0]).toMatchObject({
    id: interval.id,
    steps: interval.steps.map((step, index) => ({
      id: step.id,
      duration: { type: "time", seconds: index === 0 ? 720 : 120 },
    })),
  });

  // The optional navigation callback is omitted; a successful retry still completes.
  update.mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => {
    expect(update).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Save changes" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
