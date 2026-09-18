import { createEmptyGoalDraft, type GoalEditorDraft } from "@repo/core";
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

jest.mock("@repo/ui/components/bounded-number-input", () => ({
  __esModule: true,
  BoundedNumberInput: createHost("BoundedNumberInput"),
}));
jest.mock("@repo/ui/components/duration-input", () => ({
  __esModule: true,
  DurationInput: createHost("DurationInput"),
}));
jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));
jest.mock("@repo/ui/components/loading", () => ({
  __esModule: true,
  LoadingButton: createHost("LoadingButton"),
}));
jest.mock("@repo/ui/components/pace-input", () => ({
  __esModule: true,
  PaceInput: createHost("PaceInput"),
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
    expect(screen.getByTestId("goal-type-select-trigger").props.disabled).toBe(true);
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
