import type { ActivityPlanInterval } from "@repo/core";
import { within } from "@testing-library/react-native/pure";
import { createElement } from "react";
import { Alert } from "react-native";
import { act, fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";
import { StructureIntervalSheet } from "./StructureIntervalSheet";

const mockScrollTo = jest.fn();

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "00000000-0000-4000-8000-000000000099"),
}));
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));
// Model the native portal boundary, including visibility and close-on-selection.
// The sheet, fields, shared controls, RHF and validation remain mounted production code.
jest.mock("@rn-primitives/dropdown-menu", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const Menu = React.createContext({ open: false, setOpen: (_open: boolean) => {} });
  const Root = ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = React.useState(false);
    return <Menu.Provider value={{ open, setOpen }}>{children}</Menu.Provider>;
  };
  const Trigger = ({ children }: { children: React.ReactElement<{ onPress?: () => void }> }) => {
    const menu = React.useContext(Menu);
    return React.cloneElement(children, { onPress: () => menu.setOpen(!menu.open) });
  };
  const Portal = ({ children }: { children: React.ReactNode }) =>
    React.useContext(Menu).open ? children : null;
  const Host = ({ children, ...props }: { children?: React.ReactNode }) =>
    createElement("View", props, children);
  const Item = ({
    children,
    onPress,
    ...props
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
  }) => {
    const menu = React.useContext(Menu);
    return createElement(
      "Pressable",
      {
        ...props,
        onPress: () => {
          onPress?.();
          menu.setOpen(false);
        },
      },
      children,
    );
  };
  return { Root, Trigger, Portal, Content: Host, Overlay: Host, Item };
});
jest.mock("@/components/shared/AppBottomSheet", () => ({
  APP_BOTTOM_SHEET_PRESENTATIONS: { inspector: { initialSnapIndex: 0, snapPoints: ["96%"] } },
  AppBottomSheet: ({
    children,
    headerAction,
    scrollRef,
    ...props
  }: {
    children: React.ReactNode;
    headerAction: React.ReactNode;
    scrollRef: React.Ref<{ scrollTo: typeof mockScrollTo }>;
  }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useImperativeHandle(scrollRef, () => ({ scrollTo: mockScrollTo }));
    return createElement(
      "AppBottomSheet",
      { ...props, testID: "interval-sheet" },
      children,
      headerAction,
    );
  },
}));
const interval: ActivityPlanInterval = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Main set",
  repetitions: 2,
  notes: "Hold form through each repeat.",
  steps: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Steady",
      purpose: "work",
      duration: { type: "time", seconds: 300 },
      targets: [{ type: "RPE", intensity: 5 }],
    },
  ],
};
const baseStep = interval.steps[0];
if (!baseStep) throw new Error("Missing interval fixture step");

async function showPicker() {
  const modal = screen.getAllByTestId("step-picker-modal").find((node) => node.props.visible);
  if (!modal) throw new Error("Expected an open native picker");
  await act(() => modal.props.onShow());
}

describe("StructureIntervalSheet transaction", () => {
  it("composes only selected controls under the RN Modal prop boundary in the source model, retaining the row and interval", async () => {
    const commit = jest.fn();
    const close = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={commit}
        onClose={close}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Interval name"), "Local interval draft");
    const row = screen.getByTestId(`step-resting-row-${baseStep.id}`);
    const rowStyle = row.props.className;
    expect(
      within(row).queryByLabelText("Duration minutes", { includeHiddenElements: true }),
    ).toBeNull();
    await fireEvent.press(screen.getByLabelText("Duration: 5 min"));
    const modal = screen.getByTestId("step-picker-modal");
    expect(modal.type).toBe("Modal");
    expect(modal.props).toMatchObject({
      visible: true,
      transparent: true,
      presentationStyle: "overFullScreen",
    });
    expect(within(modal).getByTestId("Duration minutes-picker").type).toBe("NativePicker");
    expect(
      within(row).queryByTestId("Duration minutes-picker", { includeHiddenElements: true }),
    ).toBeNull();
    expect(
      within(row).queryByLabelText("Close editor", { includeHiddenElements: true }),
    ).toBeNull();
    expect(
      screen.getByTestId(`step-resting-row-${baseStep.id}`, { includeHiddenElements: true }).props
        .className,
    ).toBe(rowStyle);
    expect(screen.getByTestId("step-picker-root").props.accessibilityViewIsModal).toBe(true);
    expect(screen.getAllByLabelText("Close editor")).toHaveLength(1);
    expect(screen.queryByTestId("RPE-picker")).toBeNull();
    expect(mockScrollTo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Enter exact duration"));
    await fireEvent.changeText(screen.getByLabelText("Duration seconds"), "bad");
    await fireEvent(modal, "requestClose");
    expect(close).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Duration seconds")).toBeNull();
    expect(screen.getByLabelText("Interval name").props.value).toBe("Local interval draft");
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Duration seconds").props.value).toBe("bad");
    await fireEvent.changeText(screen.getByLabelText("Duration seconds"), "17");
    await fireEvent.press(screen.getByTestId("step-picker-scrim"));
    expect(screen.getByLabelText("Duration: 5 min 17 sec")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Duration: 5 min 17 sec"));
    await fireEvent.press(screen.getByLabelText("Enter exact duration"));
    expect(screen.getByLabelText("Duration seconds").props.value).toBe("17");
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Local interval draft",
        steps: [expect.objectContaining({ duration: { type: "time", seconds: 317 } })],
      }),
    );
  });

  it("retains invalid repetition text across modal teardown and reopens it on interval Done", async () => {
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={{
          ...interval,
          steps: [{ ...baseStep, duration: { type: "repetitions", count: 8 } }],
        }}
        activityCategory="strength"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Duration: 8 reps"));
    await fireEvent.changeText(screen.getByLabelText("Reps"), "2.5");
    await fireEvent.press(screen.getByTestId("step-picker-scrim"));
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Reps").props.value).toBe("2.5");
    await fireEvent.changeText(screen.getByLabelText("Reps"), "9");
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByText("Done"));
    expect(commit.mock.calls[0]?.[0].steps[0].duration).toEqual({ type: "repetitions", count: 9 });
  });
  it("chooses purpose directly and keeps it inside the interval transaction until Done", async () => {
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Step purpose"));
    await fireEvent(screen.getByLabelText("Choose step purpose"), "valueChange", "recovery");
    expect(screen.getByLabelText("Choose step purpose").props.selectedValue).toBe("recovery");
    expect(commit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Done"));
    expect(commit.mock.calls[0]?.[0].steps[0].purpose).toBe("recovery");
  });
  it("rejects native RPE and metric callbacks after removing their RHF target", async () => {
    const commit = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await renderNative(
      <StructureIntervalSheet
        interval={{
          ...interval,
          steps: [
            {
              ...baseStep,
              targets: [
                { type: "RPE", intensity: 5 },
                { type: "watts", intensity: 250 },
              ],
            },
          ],
        }}
        activityCategory="bike"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Step details"));
    await fireEvent.press(screen.getByLabelText("Target 1 value: 5 RPE"));
    const staleSelection = screen.getByLabelText("RPE").props.onValueChange;
    const staleMetric = screen.getByLabelText("Target 1 type").props.onValueChange;
    await fireEvent(screen.getByLabelText("Target 1 type"), "valueChange", "bpm", 4);
    const pendingConfirmation = alert.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === "Change");
    expect(pendingConfirmation).toBeDefined();
    await fireEvent.press(screen.getByLabelText("Remove target 1"));
    await fireEvent.press(screen.getByLabelText("Target 1 value: 250 watts"));
    await act(() => {
      staleSelection(9, 16);
      staleMetric("bpm", 4);
      pendingConfirmation?.onPress?.();
    });
    expect(screen.getByLabelText("Target 1 value exact value").props.value).toBe("250");
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByText("Done"));
    expect(commit.mock.calls[0]?.[0].steps[0].targets).toEqual([{ type: "watts", intensity: 250 }]);
    alert.mockRestore();
  });
  it("keeps native duration selections on switch and rejects late callbacks after reopening and Done", async () => {
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId("interval-sheet").props.contentPanningGestureEnabled).toBe(false);
    await fireEvent.press(screen.getByLabelText("Duration: 5 min"));
    const picker = screen.getByTestId("Duration minutes-picker");
    const late = picker.props.onValueChange;
    await fireEvent(picker, "valueChange", 6);
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByLabelText("Target 1 value: 5 RPE"));
    await fireEvent.press(screen.getByLabelText("Close editor"));
    expect(screen.getByLabelText("Duration: 6 min")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Duration: 6 min"));
    await act(() => late(21));
    expect(screen.getByLabelText("Duration minutes").props.selectedValue).toBe(6);
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[0].steps[0].duration).toEqual({ type: "time", seconds: 360 });
    await act(() => late(31));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Duration: 6 min")).toBeTruthy();
  });
  it("keeps native RPE on Done and duration on Back without accepting closed callbacks", async () => {
    const commit = jest.fn();
    const close = jest.fn();
    const view = await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={commit}
        onClose={close}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Target 1 value: 5 RPE"));
    const picker = screen.getByTestId("RPE-picker");
    const late = picker.props.onValueChange;
    await fireEvent(picker, "valueChange", 7.5);
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByText("Done"));
    expect(commit.mock.calls[0]?.[0].steps[0].targets).toEqual([{ type: "RPE", intensity: 7.5 }]);
    await act(() => late(10));
    expect(screen.getByLabelText("Target 1 value: 7.5 RPE")).toBeTruthy();
    await view.unmount();
    commit.mockClear();
    await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={commit}
        onClose={close}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Duration: 5 min"));
    const duration = screen.getByTestId("Duration minutes-picker");
    const stale = duration.props.onValueChange;
    await fireEvent(duration, "valueChange", 9);
    await fireEvent(screen.getByTestId("interval-sheet"), "back");
    await act(() => stale(10));
    expect(close).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Duration: 9 min")).toBeTruthy();
  });
  it("keeps a mounted valid duration pristine when closing the interval", async () => {
    const close = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={jest.fn()}
        onClose={close}
      />,
    );
    await fireEvent(screen.getByTestId("interval-sheet"), "close");
    expect(alert).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
  it.each([
    true,
    false,
  ])("prefers watts over RPE with rpeFirst=%s without reordering the saved targets", async (rpeFirst) => {
    const rpe = { type: "RPE" as const, intensity: 5 };
    const watts = { type: "watts" as const, intensity: 250 };
    const targets = rpeFirst ? [rpe, watts] : [watts, rpe];
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={{ ...interval, steps: [{ ...baseStep, targets }] }}
        activityCategory="bike"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    const objectiveNumber = rpeFirst ? 2 : 1;
    mockScrollTo.mockClear();
    expect(screen.getByLabelText(`Target ${objectiveNumber} value: 250 watts`)).toBeTruthy();
    expect(screen.queryByLabelText(`Target ${rpeFirst ? 1 : 2} value: 5 RPE`)).toBeNull();
    expect(screen.getByText(/Step details:.*5 RPE/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(`Target ${objectiveNumber} value: 250 watts`));
    expect(screen.getByLabelText(`Target ${objectiveNumber} value exact value`)).toBeTruthy();
    expect(mockScrollTo).not.toHaveBeenCalled();
    await showPicker();
    await waitFor(() =>
      expect(screen.getByLabelText(`Target ${objectiveNumber} value exact value`)).toBeTruthy(),
    );
    expect(mockScrollTo).not.toHaveBeenCalled();
    await fireEvent.changeText(
      screen.getByLabelText(`Target ${objectiveNumber} value exact value`),
      "275",
    );
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            targets: rpeFirst
              ? [rpe, { ...watts, intensity: 275 }]
              : [{ ...watts, intensity: 275 }, rpe],
          }),
        ],
      }),
    );
  });
  it("keeps invalid exact repeats on blur and blocks the transaction", async () => {
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Repeats"), "1.5");
    await fireEvent(screen.getByLabelText("Repeats"), "blur");
    await fireEvent.press(screen.getByText("Done"));
    expect(screen.getByLabelText("Repeats").props.value).toBe("1.5");
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByText("Enter whole repeats from 1 to 50.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Repeats"), "3");
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ repetitions: 3 }));
  });

  it("keeps populated instructions discoverable and clearing local through collapse", async () => {
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText("Interval instructions")).toBeNull();
    await fireEvent.press(
      screen.getByText("Interval instructions: Hold form through each repeat."),
    );
    await fireEvent.changeText(screen.getByLabelText("Interval instructions"), "");
    await fireEvent.press(screen.getByText("Hide interval instructions"));
    expect(commit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ notes: "" }));
  });

  it("retains an invalid step through removal/undo and same-ID parent refresh", async () => {
    const commit = jest.fn();
    const view = await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId("step-duration-value-current-value"));
    await fireEvent.press(screen.getByLabelText("Enter exact duration"));
    await fireEvent.changeText(screen.getByLabelText("Duration minutes"), "bad");
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByLabelText("Step 1 actions"));
    await fireEvent.press(screen.getByLabelText("Delete step 1"));
    await fireEvent.press(screen.getByText("Undo step removal"));
    await view.rerender(
      <StructureIntervalSheet
        interval={{ ...interval, name: "Server refresh" }}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Duration: unresolved edit")).toBeTruthy();
    expect(screen.getByLabelText("Interval name").props.value).toBe("Main set");
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Duration minutes").props.value).toBe("bad");
  });

  it("guards closing valid metadata edits and invalid raw entries", async () => {
    const close = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={jest.fn()}
        onClose={close}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Interval name"), "Local");
    await fireEvent(screen.getByTestId("interval-sheet"), "back");
    expect(close).not.toHaveBeenCalled();
    await act(() =>
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((item) => item.text === "Keep editing")
        ?.onPress?.(),
    );
    await fireEvent.changeText(screen.getByLabelText("Repeats"), "bad");
    await fireEvent(screen.getByTestId("interval-sheet"), "close");
    await act(() =>
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((item) => item.text === "Discard")
        ?.onPress?.(),
    );
    expect(close).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it("offers one add step action for an empty interval and prevents empty completion", async () => {
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={{ ...interval, steps: [] }}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getAllByText("Add step")).toHaveLength(1);
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
  });

  it("exposes a compact accessible main path and a single step action menu", async () => {
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={interval}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText("Purpose")).toBeNull();
    expect(screen.getByLabelText("Step purpose")).toBeTruthy();
    expect(screen.queryByLabelText("Completion mode and unit")).toBeNull();
    expect(screen.getByLabelText("Duration: 5 min")).toBeTruthy();
    expect(screen.getByLabelText("Target 1 value: 5 RPE")).toBeTruthy();
    expect(screen.queryAllByTestId(/-slider$/)).toHaveLength(0);
    expect(screen.queryAllByLabelText(/^(Increase|Decrease) /)).toHaveLength(0);
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByText("Add target")).toBeNull();
    expect(screen.queryByLabelText("Remove target 1")).toBeNull();
    expect(screen.queryByLabelText("Duplicate step 1")).toBeNull();
    expect(screen.queryByLabelText("Delete step 1")).toBeNull();
    expect(screen.getAllByLabelText("Step 1 actions")).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText("Step 1 actions"));
    await fireEvent.press(screen.getByLabelText("Duplicate step 1"));
    await fireEvent.press(screen.getByLabelText("Close editor"));
    expect(screen.queryByLabelText("Duplicate step 1")).toBeNull();
    expect(screen.getAllByLabelText("Step purpose")).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText("Step 2 actions"));
    await fireEvent.press(screen.getByLabelText("Delete step 2"));
    expect(screen.getAllByLabelText("Step purpose")).toHaveLength(1);
    expect(commit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Done editing interval"));
    expect(commit).toHaveBeenCalledWith({
      ...interval,
      steps: interval.steps.map((step) => ({ ...step, notes: "", description: undefined })),
    });
  });

  it("summarizes supporting targets and instructions, preserves hidden invalid text and opens it on Done", async () => {
    const commit = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const original = baseStep;
    const populated: ActivityPlanInterval = {
      ...interval,
      steps: [
        {
          ...original,
          notes: "Relax shoulders",
          targets: [
            { type: "cadence", intensity: 87.25 },
            { type: "bpm", intensity: 145 },
          ],
        },
      ],
    };
    await renderNative(
      <StructureIntervalSheet
        interval={populated}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    expect(
      screen.getByText(/Step details: Steady · 87.25 rpm · Instructions: Relax shoulders/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Target 1 value: 87.25 rpm")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Step details"));
    expect(screen.getByLabelText("Name").props.value).toBe("Steady");
    expect(screen.getByLabelText("Instructions").props.value).toBe("Relax shoulders");
    expect(screen.getByText("Add target")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Target 1 value: 87.25 rpm"));
    await showPicker();
    await waitFor(() => expect(screen.getByLabelText("Target 1 value exact value")).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText("Target 1 value exact value"), "invalid");
    await fireEvent.press(screen.getByLabelText("Close editor"));
    expect(screen.queryByLabelText("Target 1 value exact value")).toBeNull();
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("Target 1 value exact value").props.value).toBe("invalid"),
    );
    expect(screen.getByText("Finish or correct the exact value before saving.")).toBeTruthy();
    await fireEvent(screen.getByLabelText("Target 1 type"), "valueChange", "bpm");
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Target 1 value exact value").props.value).toBe("invalid");
    expect(
      screen.getByText("Correct the exact value before changing its target type."),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Target 1 value exact value"), "87.12567");
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            notes: "Relax shoulders",
            targets: [
              { type: "cadence", intensity: 87.12567 },
              { type: "bpm", intensity: 145 },
            ],
          }),
        ],
      }),
    );
    alert.mockRestore();
  });

  it("uses all native half-point RPE choices for strength reps and requires explicit historical correction", async () => {
    const commit = jest.fn();
    const strength: ActivityPlanInterval = {
      ...interval,
      steps: [
        {
          ...baseStep,
          duration: { type: "repetitions", count: 8 },
          targets: [{ type: "RPE", intensity: 5.25 }],
        },
      ],
    };
    await renderNative(
      <StructureIntervalSheet
        interval={strength}
        activityCategory="strength"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText("Target 1 type")).toBeNull();
    await fireEvent.press(screen.getByTestId("step-duration-value-current-value"));
    await showPicker();
    expect(mockScrollTo).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Reps").props.value).toBe("8");
    expect(screen.queryAllByTestId(/-slider$/)).toHaveLength(0);
    expect(screen.queryAllByLabelText(/^(Increase|Decrease) /)).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText("Close editor"));
    await fireEvent.press(screen.getByLabelText("Target 1 value: 5.25 RPE"));
    const picker = screen.getByTestId("RPE-picker");
    expect(picker.type).toBe("NativePicker");
    const oldSessionSelection = picker.props.onValueChange;
    expect(picker.props.selectedValue).toBe(5.25);
    expect(
      picker.children.map((child) => (typeof child === "string" ? child : child.props.value)),
    ).toEqual([5.25, ...Array.from({ length: 19 }, (_, index) => 1 + index / 2)]);
    expect(screen.queryByLabelText("Target 1 value exact value")).toBeNull();
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByText(/Existing RPE 5.25 needs correction/)).toBeTruthy();
    // Done reopens the same editor under a new generation without unmounting its picker.
    await act(() => oldSessionSelection(6));
    expect(screen.getByLabelText("RPE").props.selectedValue).toBe(5.25);
    await fireEvent(screen.getByLabelText("RPE"), "valueChange", 5.5);
    expect(screen.getByLabelText("RPE").props.selectedValue).toBe(5.5);
    await fireEvent(screen.getByLabelText("RPE"), "valueChange", 1);
    expect(screen.getByLabelText("RPE").props.selectedValue).toBe(1);
    await fireEvent(screen.getByLabelText("RPE"), "valueChange", 10);
    expect(screen.getByLabelText("RPE").props.selectedValue).toBe(10);
    await fireEvent(screen.getByLabelText("RPE"), "valueChange", 5.5);
    await fireEvent.press(screen.getByLabelText("Close editor"));
    expect(screen.getByLabelText("Target 1 value: 5.5 RPE")).toBeTruthy();
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.objectContaining({ targets: [{ type: "RPE", intensity: 5.5 }] })],
      }),
    );
  });

  it.each([
    1, 61, 3661, 86400,
  ])("preserves exact %i-second durations through semantic segments and rejects fractional seconds", async (seconds) => {
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={{
          ...interval,
          steps: [{ ...baseStep, duration: { type: "time", seconds } }],
        }}
        activityCategory="run"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId("step-duration-value-current-value"));
    await fireEvent.press(screen.getByLabelText("Enter exact duration"));
    expect(screen.getByLabelText("Duration minutes").props.value).toBe(
      String(Math.floor((seconds % 3600) / 60)),
    );
    expect(screen.getByLabelText("Duration seconds").props.value).toBe(String(seconds % 60));
    if (seconds >= 3600)
      expect(screen.getByLabelText("Duration hours").props.value).toBe(
        String(Math.floor(seconds / 3600)),
      );
    await fireEvent.changeText(screen.getByLabelText("Duration seconds"), "1.5");
    await fireEvent(
      screen.getByLabelText("Completion mode and unit"),
      "valueChange",
      "distance:km",
    );
    expect(screen.getByLabelText("Duration seconds").props.value).toBe("1.5");
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Duration seconds"), String(seconds % 60));
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.objectContaining({ duration: { type: "time", seconds } })],
      }),
    );
  });

  it("accepts large schema-valid counts and max repeats, but retains zero and oversized drafts for repair", async () => {
    const commit = jest.fn();
    await renderNative(
      <StructureIntervalSheet
        interval={{
          ...interval,
          steps: [{ ...baseStep, duration: { type: "repetitions", count: 4321 } }],
        }}
        activityCategory="strength"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Duration: 4321 reps"));
    expect(screen.getByLabelText("Reps").props.value).toBe("4321");
    for (const raw of ["0", "10001", ""]) {
      await fireEvent.changeText(screen.getByLabelText("Reps"), raw);
      await fireEvent.press(screen.getByText("Done"));
      expect(commit).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Reps").props.value).toBe(raw);
    }
    await fireEvent.changeText(screen.getByLabelText("Reps"), "10000");
    await fireEvent.changeText(screen.getByLabelText("Repeats"), "51");
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Repeats"), "50");
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        repetitions: 50,
        steps: [expect.objectContaining({ duration: { type: "repetitions", count: 10000 } })],
      }),
    );
  });

  it("prioritizes objective effort visually without reordering or dropping supporting-first targets", async () => {
    const commit = jest.fn();
    const targets = [
      { type: "cadence" as const, intensity: 87.25 },
      { type: "watts" as const, intensity: 2500 },
    ];
    const bike: ActivityPlanInterval = {
      ...interval,
      steps: [{ ...baseStep, duration: { type: "distance", meters: 1234 }, targets }],
    };
    await renderNative(
      <StructureIntervalSheet
        interval={bike}
        activityCategory="bike"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Target 2 value: 2500 watts")).toBeTruthy();
    expect(screen.queryByLabelText("Target 1 value: 87.25 rpm")).toBeNull();
    expect(screen.getByText(/Step details: Steady · 87.25 rpm/)).toBeTruthy();
    expect(screen.queryAllByTestId(/-slider$/)).toHaveLength(0);
    expect(screen.queryAllByLabelText(/^(Increase|Decrease) /)).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("step-duration-value-current-value"));
    await showPicker();
    await waitFor(() => expect(screen.getByLabelText("Duration exact value")).toBeTruthy());
    expect(screen.getByLabelText("Duration exact value").props.value).toBe("1.234");
    await fireEvent(
      screen.getByLabelText("Completion mode and unit"),
      "valueChange",
      "distance:meters",
    );
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.objectContaining({ duration: { type: "distance", meters: 1234 }, targets })],
      }),
    );
  });

  it("retains a single-option legacy correction select until explicitly repaired", async () => {
    const commit = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const strength: ActivityPlanInterval = {
      ...interval,
      steps: [
        {
          ...baseStep,
          duration: { type: "repetitions", count: 8 },
          targets: [{ type: "bpm", intensity: 120 }],
        },
      ],
    };
    await renderNative(
      <StructureIntervalSheet
        interval={strength}
        activityCategory="strength"
        onCommit={commit}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Target 1 value: 120 bpm"));
    expect(screen.getByLabelText("Target 1 type")).toBeTruthy();
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Target 1 type"), "valueChange", "RPE");
    await act(() =>
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((item) => item.text === "Change")
        ?.onPress?.(),
    );
    expect(screen.queryByLabelText("Target 1 type")).toBeNull();
    expect(screen.getByText(/Existing RPE 120 needs correction/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("RPE"), "valueChange", 5);
    await fireEvent.press(screen.getByText("Done"));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.objectContaining({ targets: [{ type: "RPE", intensity: 5 }] })],
      }),
    );
    alert.mockRestore();
  });
});
