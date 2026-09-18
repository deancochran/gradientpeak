import type {
  ActivityPlanInterval,
  ActivityPlanIntervalStep,
  CanonicalActivityCategory,
} from "@repo/core";
import { createElement, type ReactNode } from "react";
import { Alert, BackHandler, Pressable, Text } from "react-native";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import { act, fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";
import { ActivityPlanComposerScreen } from "../ActivityPlanComposerScreen";

const mockSubmit = jest.fn();
jest.mock("expo-crypto", () => {
  let uuid = 100;
  return {
    randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`),
  };
});
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => "1"), setItem: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useNavigation: () => ({}),
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock("react-native-draggable-flatlist", () => ({
  NestableScrollContainer: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/lib/api", () => ({
  api: { athleteIntelligence: { getReadModel: { useQuery: () => ({ data: undefined }) } } },
}));
jest.mock("@/components/activity-plan/ActivityPlanBasicsSection", () => ({
  ActivityPlanBasicsSection: () => null,
}));
jest.mock("@/components/activity-plan/useActivityPlanBasicsForm", () => ({
  useActivityPlanBasicsForm: () => ({}),
}));
jest.mock("@/components/activity-plan/useActivityPlanComposerProcess", () => ({
  useActivityPlanComposerProcess: jest.fn(),
}));
jest.mock("@/components/activity-plan/structure/StructureBuilderCard", () => ({
  StructureBuilderCard: ({
    intervals,
    onTimelineIntervalPress,
    onAddInterval,
    onDeleteInterval,
    onReorderIntervals,
  }: {
    intervals: ActivityPlanInterval[];
    onTimelineIntervalPress: (id: string) => void;
    onAddInterval: () => void;
    onDeleteInterval: (id: string) => void;
    onReorderIntervals: (intervals: ActivityPlanInterval[]) => void;
  }) =>
    createElement(
      "View",
      null,
      ...intervals.map((interval) =>
        createElement(
          Pressable,
          { key: interval.id, onPress: () => onTimelineIntervalPress(interval.id) },
          createElement(Text, null, `Open ${interval.name}`),
        ),
      ),
      ...intervals.map((interval) =>
        createElement(
          Pressable,
          { key: `delete-${interval.id}`, onPress: () => onDeleteInterval(interval.id) },
          createElement(Text, null, `Delete ${interval.name}`),
        ),
      ),
      createElement(
        Pressable,
        { onPress: () => onReorderIntervals([...intervals].reverse()) },
        createElement(Text, null, "Reverse intervals"),
      ),
      createElement(
        Pressable,
        { onPress: onAddInterval },
        createElement(Text, null, "Add interval"),
      ),
    ),
}));
jest.mock("@/components/shared/AppBottomSheet", () => ({
  APP_BOTTOM_SHEET_PRESENTATIONS: { inspector: { initialSnapIndex: 0, snapPoints: ["96%"] } },
  AppBottomSheet: ({
    children,
    headerAction,
    ...props
  }: {
    children: ReactNode;
    headerAction: ReactNode;
  }) =>
    createElement("AppBottomSheet", { ...props, testID: "interval-sheet" }, children, headerAction),
}));
jest.mock("@/lib/hooks/forms/useActivityPlanForm", () => ({
  useActivityPlanForm: () => {
    const store = useActivityPlanCreationStore();
    return {
      form: store,
      setName: store.setName,
      setDescription: store.setDescription,
      setActivityCategory: store.setActivityCategory,
      submit: mockSubmit,
      validation: { errors: {} },
      canSubmit: true,
      isSubmitting: false,
      isLoading: false,
      isEditBlocked: false,
      hydrationVersion: 0,
    };
  },
}));

const originalUpdate = useActivityPlanCreationStore.getState().updateInterval;
const update = jest.fn(originalUpdate);
const step: ActivityPlanIntervalStep = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Work",
  purpose: "work",
  duration: { type: "time", seconds: 300 },
  targets: [
    { type: "RPE", intensity: 5 },
    { type: "bpm", intensity: 145 },
  ],
  notes: "Keep cadence",
};
function seed(
  category: CanonicalActivityCategory = "run",
  steps = [
    step,
    {
      ...step,
      id: "00000000-0000-4000-8000-000000000004",
      name: "Easy",
      purpose: "recovery" as const,
    },
  ],
) {
  useActivityPlanCreationStore.setState({
    activityCategory: category,
    name: "Intervals",
    updateInterval: update,
    structure: {
      version: 3,
      activity_category: category,
      segments: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Activity",
          role: "activity",
          intervals: [
            { id: "00000000-0000-4000-8000-000000000002", name: "Main", repetitions: 2, steps },
          ],
        },
      ],
    },
  });
}
function savedInterval() {
  const segment = useActivityPlanCreationStore.getState().structure.segments[0];
  if (segment?.role !== "activity" || !segment.intervals[0])
    throw new Error("Missing fixture interval");
  return segment.intervals[0];
}
async function open() {
  await renderNative(<ActivityPlanComposerScreen mode="create" />);
  await fireEvent.press(screen.getByText("Open Main"));
}
function controlAt(testId: string, index: number) {
  const control = screen.getAllByTestId(testId)[index];
  if (!control) throw new Error(`Missing ${testId} at ${index}`);
  return control;
}
function seedUndoStructure() {
  const state = useActivityPlanCreationStore.getState();
  state.setStructure({
    ...state.structure,
    segments: [
      ...state.structure.segments.map((segment) =>
        segment.role === "activity"
          ? {
              ...segment,
              intervals: [
                ...segment.intervals,
                {
                  id: "00000000-0000-4000-8000-000000000005",
                  name: "Remaining",
                  repetitions: 1,
                  steps: [{ ...step, id: "00000000-0000-4000-8000-000000000006" }],
                },
                {
                  id: "00000000-0000-4000-8000-000000000008",
                  name: "Last",
                  repetitions: 1,
                  steps: [{ ...step, id: "00000000-0000-4000-8000-000000000009" }],
                },
              ],
            }
          : segment,
      ),
      {
        id: "00000000-0000-4000-8000-000000000010",
        role: "rest",
        name: "Break",
        duration: { type: "time", seconds: 60 },
      },
    ],
  });
}
async function deleteFromComposer(
  deleted: "interval" | "section",
  alert: jest.SpyInstance<void, Parameters<typeof Alert.alert>>,
) {
  if (deleted === "interval") {
    await fireEvent.press(screen.getByText("Delete Main"));
    await act(() =>
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((action) => action.text === "Delete")
        ?.onPress?.(),
    );
  } else {
    await fireEvent.press(screen.getByText("Section details"));
    await fireEvent.press(screen.getByText("Remove section"));
  }
}
beforeEach(() => {
  update.mockClear();
  mockSubmit.mockClear();
  seed();
});

describe("Composer inline interval editing (real fields and draft store)", () => {
  it("edits 3 to 4 minutes, keeps one contextual editor across work/recovery, and reopens unresolved input on Done", async () => {
    seed("bike", [
      {
        ...step,
        duration: { type: "time", seconds: 180 },
        targets: [
          { type: "watts", intensity: 250.12345 },
          { type: "RPE", intensity: 5 },
        ],
      },
      {
        ...step,
        id: "00000000-0000-4000-8000-000000000004",
        purpose: "recovery",
        duration: { type: "time", seconds: 61 },
        targets: [{ type: "watts", intensity: 100 }],
      },
    ]);
    const before = savedInterval();
    await open();
    expect(screen.queryByLabelText("Duration minutes")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Duration: 3 min"));
    await fireEvent(screen.getByLabelText("Duration minutes"), "valueChange", 4);
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByLabelText("Target 1 value: 250.12345 watts"));
    const modal = screen.getAllByTestId("step-picker-modal").find((node) => node.props.visible);
    if (!modal) throw new Error("Expected native picker");
    await fireEvent(modal, "show");
    await waitFor(() => expect(screen.getByLabelText("Target 1 value exact value")).toBeTruthy());
    expect(screen.queryByLabelText("Duration minutes")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Target 1 value exact value"), "bad");
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByLabelText("Duration: 1 min 1 sec"));
    expect(screen.getAllByTestId("Duration minutes-picker")).toHaveLength(1);
    expect(screen.queryByLabelText("Target 1 value exact value")).toBeNull();
    expect(screen.getByLabelText("Target 1 value: unresolved edit")).toBeTruthy();
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 2);
    const recoveryPicker = screen.getByTestId("Duration seconds-picker");
    const staleRecovery = recoveryPicker.props.onValueChange;
    await fireEvent(recoveryPicker, "valueChange", 3);
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByLabelText("Duration: 4 min"));
    await act(() => staleRecovery(40));
    expect(screen.getByLabelText("Duration: 1 min 3 sec")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Close editor"));
    expect(screen.queryByLabelText("Duration minutes")).toBeNull();
    await fireEvent.press(screen.getByText("Done"));
    expect(update).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("Target 1 value exact value").props.value).toBe("bad"),
    );
    expect(screen.getAllByLabelText("Close editor")).toHaveLength(1);
    await fireEvent.changeText(screen.getByLabelText("Target 1 value exact value"), "251.1234567");
    await fireEvent.press(screen.getByText("Done"));
    expect(savedInterval()).toMatchObject({
      id: before.id,
      steps: [
        {
          id: before.steps[0]?.id,
          duration: { type: "time", seconds: 240 },
          targets: [
            { type: "watts", intensity: 251.1234567 },
            { type: "RPE", intensity: 5 },
          ],
        },
        {
          id: before.steps[1]?.id,
          duration: { type: "time", seconds: 63 },
          targets: [{ type: "watts", intensity: 100 }],
        },
      ],
    });
  });
  it.each([
    "time",
    "repetitions",
  ] as const)("refuses a %s type switch while exact input is invalid and keeps Done blocked", async (type) => {
    seed(type === "time" ? "run" : "strength", [
      {
        ...step,
        duration:
          type === "time" ? { type: "time", seconds: 300 } : { type: "repetitions", count: 8 },
        targets: [{ type: "RPE", intensity: 5 }],
      },
    ]);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await open();
    await fireEvent.press(screen.getByTestId("step-duration-value-current-value"));
    const label = type === "time" ? "Duration minutes" : "Reps";
    const raw = type === "time" ? "invalid" : "1.5";
    if (type === "time") await fireEvent.press(screen.getByLabelText("Enter exact duration"));
    await fireEvent.changeText(screen.getByLabelText(label), raw);
    await fireEvent(screen.getByLabelText(label), "blur");
    await fireEvent(
      screen.getByLabelText("Completion mode and unit"),
      "valueChange",
      type === "time" ? "distance:km" : "time",
    );
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label).props.value).toBe(raw);
    await fireEvent.press(screen.getByText("Done"));
    expect(update).not.toHaveBeenCalled();
    expect(savedInterval().steps[0]?.duration.type).toBe(type);
    await fireEvent.changeText(screen.getByLabelText(label), type === "time" ? "6" : "9");
    await fireEvent(
      screen.getByLabelText("Completion mode and unit"),
      "valueChange",
      type === "time" ? "distance:km" : "time",
    );
    expect(alert).toHaveBeenCalledWith(
      "Change duration type?",
      expect.any(String),
      expect.any(Array),
    );
    alert.mockRestore();
  });

  it.each([
    ["interval", "add"],
    ["interval", "edit"],
    ["interval", "reorder"],
    ["section", "add"],
    ["section", "edit"],
    ["section", "reorder"],
  ] as const)("expires %s deletion Undo after %s without overwriting subsequent structure changes", async (deleted, change) => {
    seedUndoStructure();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await renderNative(<ActivityPlanComposerScreen mode="create" />);
    await deleteFromComposer(deleted, alert);
    if (change === "add") {
      await fireEvent.press(screen.getByText("Add interval"));
      await fireEvent(screen.getByTestId("interval-sheet"), "close");
    } else if (change === "edit") {
      await fireEvent.press(screen.getByText("Open Remaining"));
      await fireEvent.changeText(screen.getByLabelText("Interval name"), "Later edit");
      await fireEvent.press(screen.getByText("Done"));
    } else {
      await fireEvent.press(screen.getByText("Reverse intervals"));
    }
    const subsequent = useActivityPlanCreationStore.getState().structure;
    await fireEvent.press(screen.getByLabelText("Undo"));
    expect(useActivityPlanCreationStore.getState().structure).toBe(subsequent);
    expect(alert).toHaveBeenLastCalledWith(
      "Undo expired",
      expect.stringContaining("later changes"),
    );
    expect(screen.queryByLabelText("Undo")).toBeNull();
    alert.mockRestore();
  });

  it.each([
    "interval",
    "section",
  ] as const)("still restores %s deletion when only plan metadata changed", async (deleted) => {
    seedUndoStructure();
    const before = useActivityPlanCreationStore.getState().structure;
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await renderNative(<ActivityPlanComposerScreen mode="create" />);
    await deleteFromComposer(deleted, alert);
    await act(() => useActivityPlanCreationStore.getState().setName("Later metadata"));
    await fireEvent.press(screen.getByLabelText("Undo"));
    expect(useActivityPlanCreationStore.getState().structure).toEqual(before);
    expect(useActivityPlanCreationStore.getState().name).toBe("Later metadata");
    expect(alert.mock.calls.some(([title]) => title === "Undo expired")).toBe(false);
    alert.mockRestore();
  });

  it("checks the latest structure even when an old Undo callback runs before React rerenders", async () => {
    seedUndoStructure();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await renderNative(<ActivityPlanComposerScreen mode="create" />);
    await deleteFromComposer("interval", alert);
    const undo = screen.getByLabelText("Undo").props.onPress as () => void;
    await act(() => {
      const current = useActivityPlanCreationStore.getState();
      current.updateInterval(savedInterval().id, { ...savedInterval(), name: "Same-turn edit" });
      const latest = useActivityPlanCreationStore.getState().structure;
      undo();
      expect(useActivityPlanCreationStore.getState().structure).toBe(latest);
    });
    expect(savedInterval().name).toBe("Same-turn edit");
    expect(alert).toHaveBeenLastCalledWith("Undo expired", expect.any(String));
    alert.mockRestore();
  });
  it("applies multiple inline edits with one Done and retains all identities and supporting targets", async () => {
    const before = savedInterval();
    await open();
    expect(screen.queryByTestId("step-editor-modal")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Interval name"), "Edited interval");
    await fireEvent.changeText(screen.getByLabelText("Repeats"), "3");
    await fireEvent.press(controlAt("step-duration-value-current-value", 0));
    await fireEvent(screen.getByLabelText("Duration minutes"), "valueChange", 6);
    await fireEvent.press(screen.getByText(/Step details: Easy/));
    await fireEvent.press(screen.getByTestId("target-value-0-current-value"));
    await fireEvent(screen.getByLabelText("RPE"), "valueChange", 4);
    expect(update).not.toHaveBeenCalled();
    expect(savedInterval()).toEqual(before);
    await fireEvent.press(screen.getByLabelText("Done editing interval"));
    expect(update).toHaveBeenCalledTimes(1);
    expect(savedInterval()).toMatchObject({
      id: before.id,
      name: "Edited interval",
      repetitions: 3,
      steps: [
        {
          id: before.steps[0]?.id,
          duration: { type: "time", seconds: 360 },
          targets: before.steps[0]?.targets,
          notes: "Keep cadence",
        },
        {
          id: before.steps[1]?.id,
          targets: [
            { type: "RPE", intensity: 4 },
            { type: "bpm", intensity: 145 },
          ],
        },
      ],
    });
    expect(screen.queryByTestId("interval-sheet")).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("rolls back valid and invalid edits only after discard, including on Back", async () => {
    const before = savedInterval();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await open();
    await fireEvent.changeText(screen.getByLabelText("Interval name"), "Local");
    await act(() => {
      expect(
        jest
          .mocked(BackHandler.addEventListener)
          .mock.calls.at(-1)?.[1]({ type: "hardwareBackPress", timeStamp: 1 }),
      ).toBe(true);
    });
    expect(alert).toHaveBeenLastCalledWith(
      "Discard changes?",
      expect.any(String),
      expect.any(Array),
      { cancelable: true, onDismiss: expect.any(Function) },
    );
    await act(() =>
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((item) => item.text === "Keep editing")
        ?.onPress?.(),
    );
    expect(screen.getByLabelText("Interval name").props.value).toBe("Local");
    await fireEvent.changeText(screen.getByLabelText("Repeats"), "bad");
    await fireEvent(screen.getByTestId("interval-sheet"), "close");
    await act(() =>
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((item) => item.text === "Discard")
        ?.onPress?.(),
    );
    expect(update).not.toHaveBeenCalled();
    expect(savedInterval()).toEqual(before);
    await fireEvent.press(screen.getByText("Open Main"));
    expect(screen.getByLabelText("Repeats").props.value).toBe("2");
    expect(screen.getByLabelText("Interval name").props.value).toBe("Main");
    alert.mockRestore();
  });

  it("blocks raw invalid repeats and step counts without publishing a previous valid dose", async () => {
    seed("strength", [
      {
        ...step,
        duration: { type: "repetitions", count: 8 },
        targets: [{ type: "RPE", intensity: 5 }],
      },
    ]);
    await open();
    await fireEvent.changeText(screen.getByLabelText("Repeats"), "1.5");
    await fireEvent.press(screen.getByTestId("step-duration-value-current-value"));
    await fireEvent.changeText(screen.getByLabelText("Reps"), "2.5");
    await fireEvent.press(screen.getByText("Done"));
    expect(update).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Repeats"), "2");
    await fireEvent.press(screen.getByText("Done"));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Reps").props.value).toBe("2.5");
    await fireEvent.changeText(screen.getByLabelText("Reps"), "9");
    await fireEvent.press(screen.getByText("Done"));
    expect(savedInterval().steps[0]?.duration).toEqual({ type: "repetitions", count: 9 });
  });

  it("duplicates current edits under new IDs and keeps step removal local and reversible", async () => {
    const before = savedInterval();
    await open();
    await fireEvent.press(screen.getByText(/Step details: Work/));
    await fireEvent.press(screen.getByTestId("target-value-0-current-value"));
    await fireEvent(screen.getByLabelText("RPE"), "valueChange", 6);
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByLabelText("Step 1 actions"));
    await fireEvent.press(screen.getByLabelText("Duplicate step 1"));
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByLabelText("Step 1 actions"));
    await fireEvent.press(screen.getByLabelText("Delete step 1"));
    await fireEvent.press(screen.getByText("Undo step removal"));
    await fireEvent.press(screen.getByLabelText("Step 3 actions"));
    await fireEvent.press(screen.getByLabelText("Delete step 3"));
    expect(update).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Done"));
    const after = savedInterval();
    expect(after.steps).toHaveLength(2);
    expect(after.steps[0]?.id).toBe(before.steps[0]?.id);
    expect(after.steps[1]?.id).not.toBe(before.steps[0]?.id);
    expect(after.steps[1]?.id).not.toBe(before.steps[1]?.id);
    expect(after.steps[1]?.targets).toEqual([
      { type: "RPE", intensity: 6 },
      { type: "bpm", intensity: 145 },
    ]);
  });

  it("retains category-incompatible legacy values until explicit inline correction", async () => {
    seed("run", [{ ...step, purpose: undefined, targets: [{ type: "watts", intensity: 150 }] }]);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await open();
    await fireEvent.press(screen.getByText("Done"));
    expect(update).not.toHaveBeenCalled();
    expect(savedInterval().steps[0]?.targets).toEqual([{ type: "watts", intensity: 150 }]);
    await fireEvent(screen.getByLabelText("Target 1 type"), "valueChange", "bpm");
    await act(() =>
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((item) => item.text === "Change")
        ?.onPress?.(),
    );
    await fireEvent.press(screen.getByText("Done"));
    expect(update).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Choose step purpose"), "valueChange", "work");
    await fireEvent.press(screen.getByText("Done"));
    expect(savedInterval().steps[0]).toMatchObject({
      id: step.id,
      purpose: "work",
      targets: [{ type: "bpm", intensity: 150 }],
    });
    alert.mockRestore();
  });

  it("auto-opens a new interval, adds recovery inline, and focuses its dose", async () => {
    await renderNative(<ActivityPlanComposerScreen mode="create" />);
    await fireEvent.press(screen.getByText("Add interval"));
    expect(screen.getByTestId("interval-sheet")).toBeTruthy();
    expect(screen.getByLabelText("Interval name").props.value).toBe("Interval 2");
    await fireEvent.press(screen.getByText("Add recovery"));
    expect(screen.getByTestId("Duration minutes-picker")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Close editor"));
    expect(screen.getAllByLabelText("Step purpose")).toHaveLength(2);
    await fireEvent.press(screen.getByText("Done"));
    const next = update.mock.calls[0]?.[1];
    expect(next?.steps.map((item) => item.purpose)).toEqual(["work", "recovery"]);
    expect(new Set(next?.steps.map((item) => item.id)).size).toBe(2);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
