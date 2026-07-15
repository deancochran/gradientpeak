import { createEmptyGoalDraft, type GoalEditorDraft } from "@repo/core";
import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/hooks", () => ({
  __esModule: true,
  useZodForm: ({ defaultValues }: { defaultValues: Record<string, unknown> }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const valuesRef = React.useRef({ ...defaultValues });
    const subscribersRef = React.useRef(new Set<(value: Record<string, unknown>) => void>());
    const formRef = React.useRef<{
      control: Record<string, never>;
      getValues: () => Record<string, unknown>;
      reset: (value: Record<string, unknown>) => void;
      setValue: (key: string, value: unknown) => void;
      watch: (
        callback?: (value: Record<string, unknown>) => void,
      ) => Record<string, unknown> | { unsubscribe: () => void };
    } | null>(null);

    formRef.current ??= {
      control: {},
      getValues: () => valuesRef.current,
      reset: (value) => {
        valuesRef.current = { ...value };
        for (const subscriber of subscribersRef.current) {
          subscriber(valuesRef.current);
        }
      },
      setValue: (key, value) => {
        valuesRef.current = { ...valuesRef.current, [key]: value };
        for (const subscriber of subscribersRef.current) {
          subscriber(valuesRef.current);
        }
      },
      watch: (callback) => {
        if (!callback) {
          return valuesRef.current;
        }

        subscribersRef.current.add(callback);
        return { unsubscribe: () => subscribersRef.current.delete(callback) };
      },
    };

    return formRef.current;
  },
}));

jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: createHost("Form"),
  FormDateInputField: createHost("FormDateInputField"),
  FormIntegerStepperField: createHost("FormIntegerStepperField"),
  FormTextField: createHost("FormTextField"),
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
  it("fills its host by default for backwards compatibility", () => {
    renderNative(
      <GoalEditorForm
        initialValue={createEmptyGoalDraft()}
        onSubmit={jest.fn()}
        showSubmitAction={false}
      />,
    );

    expect(screen.getByTestId("goal-editor-form").props.className).toBe("flex-1 gap-3");
  });

  it("uses intrinsic height when content sizing is requested", () => {
    renderNative(
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
  it("emits the initial draft and current edits without duplicating a controlled reset", () => {
    const initialValue = {
      ...createEmptyGoalDraft(),
      title: "Initial goal",
      targetDate: "2026-09-20",
    };
    const onDraftChange = jest.fn<void, [GoalEditorDraft]>();
    const onSubmit = jest.fn();
    const { rerender } = renderNative(
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

    fireEvent.press(screen.getByLabelText("Use 10K Race preset"));

    expect(onDraftChange).toHaveBeenCalledTimes(2);
    const currentDraft = onDraftChange.mock.calls[1]?.[0];
    expect(currentDraft).toEqual(
      expect.objectContaining({
        title: "10K Race",
        goalType: "race_performance",
        raceDistanceKm: 10,
      }),
    );

    rerender(
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

  it("preserves submit behavior", () => {
    const initialValue = {
      ...createEmptyGoalDraft(),
      title: "Finish a 10K",
      targetDate: "2026-09-20",
      goalType: "completion" as const,
      raceDistanceKm: 10,
    };
    const onSubmit = jest.fn<void, [GoalEditorDraft]>();
    renderNative(<GoalEditorForm initialValue={initialValue} onSubmit={onSubmit} />);

    fireEvent.press(screen.getByText("Save Goal"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining(initialValue));
  });
});
