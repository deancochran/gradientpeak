import {
  buildGoalDraftFromGoal,
  buildGoalUpdatePayload,
  type CanonicalGoalObjective,
  createEmptyGoalDraft,
  type GoalEditorDraft,
  type ProfileGoal,
} from "@repo/core";
import { act } from "@testing-library/react-native";
import { createRef } from "react";
import { Alert } from "react-native";
import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
  Alert: { alert: jest.fn() },
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));
jest.mock("@repo/ui/components/loading", () => ({
  __esModule: true,
  LoadingButton: createHost("LoadingButton"),
}));
jest.mock("@repo/ui/components/select", () => ({
  __esModule: true,
  NativeSelectScrollView: createHost("NativeSelectScrollView"),
  Select: createHost("Select"),
  SelectContent: createHost("SelectContent"),
  SelectItem: createHost("SelectItem"),
  SelectTrigger: createHost("SelectTrigger"),
  SelectValue: createHost("SelectValue"),
}));
jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));
jest.mock("lucide-react-native", () => ({
  CalendarDays: createHost("CalendarDays"),
  Dumbbell: createHost("Dumbbell"),
  Flag: createHost("Flag"),
  Gauge: createHost("Gauge"),
  Target: createHost("Target"),
  Trophy: createHost("Trophy"),
}));
jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: createHost("AppFormModal"),
}));

const { GoalEditorForm } = require("../GoalEditorModal");

function persistedGoal(objective: CanonicalGoalObjective): ProfileGoal {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    profile_id: "11111111-1111-4111-8111-111111111111",
    title: "Original goal",
    target_date: "2026-11-01",
    priority: 7,
    activity_category:
      "activity_category" in objective && objective.activity_category
        ? objective.activity_category
        : "run",
    objective,
  };
}

describe("GoalEditorForm canonical submission", () => {
  it("authors power as whole watts without rewriting a precise historical goal", async () => {
    const objective = {
      type: "threshold",
      metric: "power",
      value: 250.125,
    } satisfies CanonicalGoalObjective;
    await renderNative(
      <GoalEditorForm initialValue={buildGoalDraftFromGoal({ goal: persistedGoal(objective) })} />,
    );

    expect(screen.getByLabelText("Watts").props.accessibilityValue).toEqual({ text: "250.125" });
    await fireEvent.press(screen.getByLabelText("Watts"));
    expect(screen.queryByLabelText("Watts Fractional W")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Done Watts"));
  });

  it("configures long threshold test time as MS without discarding hours or altering its objective", async () => {
    const objective = {
      type: "threshold",
      metric: "power",
      value: 250.125,
      test_duration_s: 90001,
    } satisfies CanonicalGoalObjective;
    const onSubmit = jest.fn<void, [GoalEditorDraft]>();
    await renderNative(
      <GoalEditorForm
        initialValue={buildGoalDraftFromGoal({ goal: persistedGoal(objective) })}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.press(screen.getByTestId("goal-power-duration"));
    expect(screen.queryByLabelText("Test time hours")).toBeNull();
    expect(screen.getByLabelText("Test time minutes").props.selectedValue).toBe(1500);
    expect(screen.getByLabelText("Test time seconds").props.selectedValue).toBe(1);
    await fireEvent.press(screen.getByLabelText("Done Test time"));
    await fireEvent.press(screen.getByText("Save Goal"));
    const submitted = onSubmit.mock.calls[0]?.[0];
    if (!submitted) throw new Error("Expected unchanged long test-time submission.");
    expect(buildGoalUpdatePayload({ draft: submitted }).target_payload).toStrictEqual(objective);
  });
  it.each([
    {
      objective: { type: "completion", distance_m: 42195.123 },
      testId: "goal-duration",
      expected: { duration_s: 1800 },
    },
    {
      objective: {
        type: "threshold",
        metric: "pace",
        activity_category: "swim",
        value: 1.123456,
        tolerance_pct: 0.03,
      },
      testId: "goal-threshold-pace-duration",
      expected: { test_duration_s: 1800 },
    },
  ] satisfies {
    objective: CanonicalGoalObjective;
    testId: string;
    expected: object;
  }[])("retains other precise fields when editing one duration %#", async ({
    objective,
    testId,
    expected,
  }) => {
    const onSubmit = jest.fn<void, [GoalEditorDraft]>();
    await renderNative(
      <GoalEditorForm
        initialValue={buildGoalDraftFromGoal({ goal: persistedGoal(objective) })}
        onSubmit={onSubmit}
      />,
    );
    const label = screen.getByTestId(testId).props.accessibilityLabel;
    await fireEvent.press(screen.getByTestId(testId));
    await fireEvent(screen.getByTestId(`${testId}-minutes`), "valueChange", 30);
    await fireEvent.press(screen.getByLabelText(`Done ${label}`));
    await fireEvent.press(screen.getByText("Save Goal"));
    const submitted = onSubmit.mock.calls[0]?.[0];
    if (!submitted) throw new Error("Expected submitted draft");
    expect(buildGoalUpdatePayload({ draft: submitted }).target_payload).toStrictEqual({
      ...objective,
      ...expected,
    });
  });

  it.each([
    {
      type: "event_performance",
      activity_category: "run",
      distance_m: 42195,
      target_time_s: 14400,
    },
    { type: "completion", distance_m: 42195 },
    { type: "completion", duration_s: 90001 },
    { type: "consistency", target_weeks: 6 },
    { type: "threshold", metric: "pace", activity_category: "swim", value: 1.123456 },
    { type: "threshold", metric: "power", activity_category: "run", value: 250.125 },
    { type: "threshold", metric: "hr", value: 170.125 },
  ] satisfies CanonicalGoalObjective[])("retains the snapshot through real title editing and submission %#", async (objective) => {
    const goal = persistedGoal(objective);
    const onSubmit = jest.fn<void, [GoalEditorDraft]>();
    await renderNative(
      <GoalEditorForm initialValue={buildGoalDraftFromGoal({ goal })} onSubmit={onSubmit} />,
    );
    await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Renamed goal");
    await fireEvent.press(screen.getByText("Save Goal"));
    const submitted = onSubmit.mock.calls[0]?.[0];
    expect(submitted?.originalGoal).toEqual(goal);
    if (!submitted) throw new Error("Expected submitted draft");
    expect(buildGoalUpdatePayload({ draft: submitted }).target_payload).toStrictEqual(objective);
    expect(submitted.title).toBe("Renamed goal");
  });

  it.each([
    { objective: { type: "completion", distance_m: 42195.123 }, testId: "goal-duration" },
    {
      objective: { type: "threshold", metric: "power", value: 250.125 },
      testId: "goal-power-duration",
    },
  ] satisfies {
    objective: CanonicalGoalObjective;
    testId: string;
  }[])("clears an optional zero duration without invalidating a legacy goal %#", async ({
    objective,
    testId,
  }) => {
    const onSubmit = jest.fn<void, [GoalEditorDraft]>();
    await renderNative(
      <GoalEditorForm
        initialValue={buildGoalDraftFromGoal({ goal: persistedGoal(objective) })}
        onSubmit={onSubmit}
      />,
    );
    const label = screen.getByTestId(testId).props.accessibilityLabel;
    await fireEvent.press(screen.getByTestId(testId));
    await fireEvent(screen.getByLabelText(`${label} seconds`), "valueChange", 0);
    await fireEvent.press(screen.getByLabelText(`Done ${label}`));
    await fireEvent.press(screen.getByText("Save Goal"));
    const submitted = onSubmit.mock.calls[0]?.[0];
    if (!submitted) throw new Error("Expected cleared optional duration draft");
    expect(buildGoalUpdatePayload({ draft: submitted }).target_payload).toStrictEqual(objective);
  });
});

describe("GoalEditorForm layout", () => {
  it("fills its host by default for backwards compatibility", async () => {
    await renderNative(
      <GoalEditorForm
        initialValue={createEmptyGoalDraft()}
        onSubmit={jest.fn()}
        showSubmitAction={false}
      />,
    );

    expect(screen.getByTestId("goal-editor-form").props.className).toBe("flex-1 gap-3");
  });

  it("uses intrinsic height when content sizing is requested", async () => {
    await renderNative(
      <GoalEditorForm
        contentSizing="intrinsic"
        initialValue={createEmptyGoalDraft()}
        onSubmit={jest.fn()}
        showSubmitAction={false}
      />,
    );

    expect(screen.getByTestId("goal-editor-form").props.className).toBe("gap-3");
  });
});

describe("GoalEditorForm draft observation", () => {
  it("emits the initial draft and current edits without duplicating a controlled reset", async () => {
    const initialValue = {
      ...createEmptyGoalDraft(),
      title: "Initial goal",
      targetDate: "2026-09-20",
    };
    const onDraftChange = jest.fn<void, [GoalEditorDraft]>();
    const onSubmit = jest.fn();
    const { rerender } = await renderNative(
      <GoalEditorForm
        contentSizing="intrinsic"
        initialValue={initialValue}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        showSubmitAction={false}
      />,
    );

    expect(onDraftChange).toHaveBeenCalledTimes(1);
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining(initialValue));

    await fireEvent.press(screen.getByLabelText("Use 10K Race preset"));
    await act(() => confirmation("Replace")?.onPress?.());

    expect(onDraftChange).toHaveBeenCalledTimes(2);
    const currentDraft = onDraftChange.mock.calls[1]?.[0];
    expect(currentDraft).toEqual(
      expect.objectContaining({
        title: "10K Race",
        goalType: "race_performance",
        raceDistanceKm: 10,
      }),
    );

    await rerender(
      <GoalEditorForm
        contentSizing="intrinsic"
        initialValue={currentDraft ?? initialValue}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        showSubmitAction={false}
      />,
    );

    expect(onDraftChange).toHaveBeenCalledTimes(2);
  });

  it("preserves submit behavior", async () => {
    const initialValue = {
      ...createEmptyGoalDraft(),
      title: "Finish a 10K",
      targetDate: "2026-09-20",
      goalType: "completion" as const,
      raceDistanceKm: 10,
    };
    const onSubmit = jest.fn<void, [GoalEditorDraft]>();
    await renderNative(<GoalEditorForm initialValue={initialValue} onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByText("Save Goal"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining(initialValue));
  });

  it("uses shared choices for activity and numeric priority and ignores a closed picker callback", async () => {
    const onSubmit = jest.fn<void, [GoalEditorDraft]>();
    await renderNative(
      <GoalEditorForm
        initialValue={{
          ...createEmptyGoalDraft(),
          title: "Choice goal",
          targetDate: "2026-10-20",
          goalType: "completion",
          raceDistanceKm: 10,
        }}
        onSubmit={onSubmit}
      />,
    );
    const picker = screen.getByTestId("goal-activity-select-trigger-picker");
    await fireEvent(picker, "valueChange", "bike");
    expect(screen.queryByLabelText("Close Activity")).toBeNull();
    await fireEvent.press(screen.getByTestId("goal-importance-select-trigger"));
    const priority = screen.getByTestId("goal-importance-select-trigger-picker");
    const expired = priority.props.onValueChange;
    await fireEvent(priority, "valueChange", 8);
    expect(screen.queryByLabelText("Close Priority")).toBeNull();
    expired(9);
    await fireEvent.press(screen.getByText("Save Goal"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ activityCategory: "bike", importance: 8 }),
    );
  });
  it("exposes the target-style pair immediately without an intermediate fullscreen picker", async () => {
    await renderNative(
      <GoalEditorForm
        initialValue={{
          ...createEmptyGoalDraft(),
          goalType: "race_performance",
          raceTargetMode: "time",
        }}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByTestId("goal-target-style-select-trigger-picker")).toBeTruthy();
    expect(screen.queryByLabelText("Close Target style")).toBeNull();
  });

  it("announces why an invalid header-style submission cannot continue", async () => {
    const onSubmit = jest.fn<void, [GoalEditorDraft]>();
    await renderNative(
      <GoalEditorForm initialValue={createEmptyGoalDraft()} onSubmit={onSubmit} />,
    );

    await fireEvent.press(screen.getByText("Save Goal"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("goal-submit-feedback").props.accessibilityRole).toBe("alert");
  });
});

function confirmation(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  return buttons?.find((button) => button.text === text);
}

describe("GoalEditorForm real draft lifecycle", () => {
  const initialValue = {
    ...createEmptyGoalDraft(),
    title: "Existing goal",
    targetDate: "2026-10-20",
    goalType: "completion" as const,
    raceDistanceKm: 10,
  };

  it("hydrates the current goal even when mounted pending", async () => {
    await renderNative(
      <GoalEditorForm initialValue={initialValue} isSubmitting onSubmit={jest.fn()} />,
    );
    expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Existing goal");
  });

  it("keeps a dirty goal during parent refresh and resets only when the owner changes its key", async () => {
    const onDirtyChange = jest.fn();
    const onSubmit = jest.fn();
    const view = await renderNative(
      <GoalEditorForm
        key="goal-a"
        initialValue={initialValue}
        onDirtyChange={onDirtyChange}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Local goal title");
    await view.rerender(
      <GoalEditorForm
        key="goal-a"
        initialValue={{ ...initialValue, title: "Refreshed title" }}
        onDirtyChange={onDirtyChange}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Local goal title");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await view.rerender(
      <GoalEditorForm
        key="goal-b"
        initialValue={{ ...initialValue, title: "Another goal" }}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Another goal");
  });

  it("requires preset confirmation, preserves a canceled draft, and keeps an accepted preset dirty", async () => {
    const dirty = jest.fn();
    await renderNative(
      <GoalEditorForm initialValue={initialValue} onDirtyChange={dirty} onSubmit={jest.fn()} />,
    );
    await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Keep me");
    await fireEvent.press(screen.getByLabelText("Use 10K Race preset"));
    expect(confirmation("Keep editing")).toBeTruthy();
    expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Keep me");
    await act(() => confirmation("Keep editing")?.onPress?.());
    expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Keep me");
    await fireEvent.press(screen.getByLabelText("Use 10K Race preset"));
    await act(() => confirmation("Replace")?.onPress?.());
    expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("10K Race");
    expect(dirty).toHaveBeenLastCalledWith(true);
  });

  it("freezes options, suppresses duplicate commits and preserves failed edits for retry", async () => {
    let reject!: (error: Error) => void;
    const onSubmit = jest
      .fn()
      .mockReturnValueOnce(
        new Promise<void>((_done, fail) => {
          reject = fail;
        }),
      )
      .mockResolvedValue(undefined);
    const ref = createRef<{ submit: () => void }>();
    const view = await renderNative(
      <GoalEditorForm ref={ref} initialValue={initialValue} onSubmit={onSubmit} />,
    );
    await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Local goal");
    await act(() => {
      ref.current?.submit();
      ref.current?.submit();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("goal-editor-title-input").props.editable).toBe(false);
    expect(screen.getByTestId("goal-type-select-trigger-picker").props.enabled).toBe(false);
    expect(screen.getByLabelText("Use 10K Race preset").props.disabled).toBe(true);
    await view.rerender(
      <GoalEditorForm
        ref={ref}
        initialValue={{ ...initialValue, title: "Server refresh" }}
        onSubmit={onSubmit}
      />,
    );
    await act(async () => reject(new Error("Save unavailable")));
    expect(screen.getByTestId("goal-submit-feedback").props.children).toBe("Save unavailable");
    expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Local goal");
    await act(async () => ref.current?.submit());
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]?.[0]).toEqual(onSubmit.mock.calls[0]?.[0]);
  });
});
