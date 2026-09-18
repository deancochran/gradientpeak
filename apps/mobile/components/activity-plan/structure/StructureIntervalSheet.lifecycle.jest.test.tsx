import type { ActivityPlanInterval } from "@repo/core";
import { within } from "@testing-library/react-native/pure";
import mockReact from "react";
import { act, fireEvent, renderNative, screen } from "../../../test/render-native";

const mockDismissals: (() => void)[] = [];

// Deterministic OS-boundary model, not a native renderer: invisible modal children
// unmount immediately, while dismiss notifications remain deliverable in any order.
// There is deliberately no stale-session filtering in this host.
jest.mock("react-native", () => {
  const React = mockReact;
  const native = jest.requireActual("@repo/ui/test/react-native");
  let nextHandle = 1;
  const Pressable = ({
    ref,
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>> & { ref?: React.Ref<{ tag: number }> }) => {
    const handle = React.useRef({ tag: nextHandle++ });
    React.useImperativeHandle(ref, () => handle.current);
    return React.createElement("Pressable", props, children);
  };
  const Modal = ({
    children,
    visible,
    onDismiss,
    onShow,
    ...props
  }: {
    children?: React.ReactNode;
    visible: boolean;
    onDismiss?: () => void;
    onShow?: () => void;
  }) => {
    const wasVisible = React.useRef(false);
    const latestDismiss = React.useRef(onDismiss);
    latestDismiss.current = onDismiss;
    React.useEffect(() => {
      const previous = wasVisible.current;
      wasVisible.current = visible;
      if (previous && !visible && onDismiss) mockDismissals.push(onDismiss);
      if (!previous && visible) onShow?.();
    }, [visible, onDismiss, onShow]);
    React.useEffect(
      () => () => {
        if (wasVisible.current && latestDismiss.current) mockDismissals.push(latestDismiss.current);
      },
      [],
    );
    return React.createElement(
      "ModalLifecycleHost",
      { ...props, visible, onDismiss, onShow },
      visible ? children : null,
    );
  };
  return {
    ...native,
    Pressable,
    Modal,
    findNodeHandle: (node: { tag: number }) => node.tag,
    AccessibilityInfo: { setAccessibilityFocus: jest.fn() },
  };
});
jest.mock("@/components/shared/AppBottomSheet", () => ({
  APP_BOTTOM_SHEET_PRESENTATIONS: { inspector: { initialSnapIndex: 0, snapPoints: ["96%"] } },
  AppBottomSheet: ({
    children,
    headerAction,
    ...props
  }: {
    children?: React.ReactNode;
    headerAction?: React.ReactNode;
  }) => (
    <View {...props} testID="interval-sheet">
      {headerAction}
      {children}
    </View>
  ),
}));
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));

// The global harness has already cached its lightweight RN hosts. Isolate this
// composition to exercise the lifecycle host above, sharing the renderer's React.
function loadLifecycleComposition() {
  jest.resetModules();
  let loaded:
    | ({
        StructureIntervalSheet: typeof import("./StructureIntervalSheet").StructureIntervalSheet;
      } & Pick<typeof import("react-native"), "Alert" | "AccessibilityInfo" | "View">)
    | undefined;
  jest.isolateModules(() => {
    jest.doMock("react", () => mockReact);
    loaded = {
      ...require("./StructureIntervalSheet"),
      ...require("react-native"),
    };
  });
  if (!loaded) throw new Error("Lifecycle composition was not loaded");
  return loaded;
}
const { StructureIntervalSheet, Alert, AccessibilityInfo, View } = loadLifecycleComposition();

const interval: ActivityPlanInterval = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Main",
  repetitions: 2,
  steps: [1, 2].map((number) => ({
    id: `00000000-0000-4000-8000-00000000000${number + 1}`,
    name: `Step ${number}`,
    purpose: "work",
    duration: { type: "time", seconds: number * 300 },
    targets: [{ type: "watts", intensity: 250 }],
  })),
};
const renderInterval = (onClose = jest.fn()) =>
  renderNative(
    <StructureIntervalSheet
      interval={interval}
      activityCategory="bike"
      onClose={onClose}
      onCommit={jest.fn()}
    />,
  );
function takeDismissal() {
  const callback = mockDismissals.shift();
  if (!callback) throw new Error("Expected delayed host dismissal");
  return callback;
}
beforeEach(() => {
  mockDismissals.length = 0;
});

describe("interval source composition and modeled modal lifecycle contract", () => {
  it("coalesces close requests, unlocks on cancellation, and latches a successful close", async () => {
    const close = jest.fn();
    await renderInterval(close);
    await fireEvent.changeText(screen.getByLabelText("Interval name"), "Dirty");
    const sheet = screen.getByTestId("interval-sheet");
    await act(() => {
      sheet.props.onBack();
      sheet.props.onClose();
      sheet.props.onBack();
    });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const cancel = jest
      .mocked(Alert.alert)
      .mock.calls[0]?.[2]?.find((button) => button.text === "Keep editing");
    await act(() => cancel?.onPress?.());
    await fireEvent(sheet, "close");
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    const discard = jest
      .mocked(Alert.alert)
      .mock.calls[1]?.[2]?.find((button) => button.text === "Discard");
    await act(() => {
      discard?.onPress?.();
      discard?.onPress?.();
      sheet.props.onBack();
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledTimes(2);
  });

  it("unlocks an Android-cancelled prompt and ignores its callbacks after interval unmount", async () => {
    const close = jest.fn();
    const view = await renderInterval(close);
    await fireEvent.changeText(screen.getByLabelText("Interval name"), "Dirty");
    await fireEvent(screen.getByTestId("interval-sheet"), "back");
    const prompt = jest.mocked(Alert.alert).mock.calls[0];
    expect(prompt?.[3]?.cancelable).toBe(true);
    await act(() => prompt?.[3]?.onDismiss?.());
    await fireEvent(screen.getByTestId("interval-sheet"), "back");
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    const discard = jest
      .mocked(Alert.alert)
      .mock.calls[1]?.[2]?.find((button) => button.text === "Discard");
    await view.unmount();
    await act(() => discard?.onPress?.());
    expect(close).not.toHaveBeenCalled();
  });

  it("closes pristine intervals once and permits a fresh mounted interval to close", async () => {
    const close = jest.fn();
    const view = await renderInterval(close);
    const sheet = screen.getByTestId("interval-sheet");
    await act(() => {
      sheet.props.onBack();
      sheet.props.onClose();
    });
    expect(close).toHaveBeenCalledTimes(1);
    await view.unmount();
    await renderInterval(close);
    await fireEvent(screen.getByTestId("interval-sheet"), "back");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it.each([
    "same row",
    "other row",
  ])("rejects delayed dismissal after reopening %s, even after that newer picker closes", async (row) => {
    await renderInterval();
    await fireEvent.press(screen.getByLabelText("Duration: 5 min"));
    expect(screen.getAllByTestId("step-picker-modal")[0]?.type).toBe("ModalLifecycleHost");
    const oldModal = screen.getAllByTestId("step-picker-modal")[0];
    const staleClose = oldModal?.props.onRequestClose;
    const staleShow = oldModal?.props.onShow;
    await fireEvent.press(screen.getByLabelText("Close editor"));
    const stale = takeDismissal();
    await fireEvent.press(
      screen.getByLabelText(row === "same row" ? "Duration: 5 min" : "Duration: 10 min"),
    );
    await act(() => {
      stale();
      staleClose();
      staleShow();
    });
    expect(screen.getAllByTestId("step-picker-root")).toHaveLength(1);
    expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Close editor"));
    const latest = takeDismissal();
    await act(stale);
    expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
    await act(latest);
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledTimes(1);
    await act(latest);
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledTimes(1);
  });

  it("ignores a queued dismissal after the interval unmounts", async () => {
    const view = await renderInterval();
    await fireEvent.press(screen.getByLabelText("Duration: 5 min"));
    await fireEvent.press(screen.getByLabelText("Close editor"));
    const stale = takeDismissal();
    await view.unmount();
    await act(stale);
    expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
  });

  it("ignores an earlier cancelled alert's callbacks during a newer close attempt", async () => {
    const close = jest.fn();
    await renderInterval(close);
    await fireEvent.changeText(screen.getByLabelText("Interval name"), "Dirty");
    await fireEvent(screen.getByTestId("interval-sheet"), "close");
    const oldPrompt = jest.mocked(Alert.alert).mock.calls[0];
    await act(() => oldPrompt?.[3]?.onDismiss?.());
    await fireEvent(screen.getByTestId("interval-sheet"), "back");
    await act(() => {
      oldPrompt?.[3]?.onDismiss?.();
      oldPrompt?.[2]?.find((button) => button.text === "Discard")?.onPress?.();
    });
    await fireEvent(screen.getByTestId("interval-sheet"), "close");
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();
    await act(() =>
      jest
        .mocked(Alert.alert)
        .mock.calls[1]?.[2]?.find((button) => button.text === "Discard")
        ?.onPress?.(),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not restore picker focus after a successful interval close before unmount", async () => {
    const close = jest.fn();
    await renderInterval(close);
    await fireEvent.press(screen.getByLabelText("Duration: 5 min"));
    await fireEvent.press(screen.getByLabelText("Close editor"));
    const stale = takeDismissal();
    await fireEvent(screen.getByTestId("interval-sheet"), "close");
    expect(close).toHaveBeenCalledTimes(1);
    await act(stale);
    expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
  });

  it("models child teardown with the native metric picker inside the modal and retains raw drafts", async () => {
    await renderInterval();
    const target = screen.getAllByLabelText("Target 1 value: 250 watts")[0];
    if (!target) throw new Error("Expected first step's effort trigger");
    await fireEvent.press(target);
    const modal = screen.getAllByTestId("step-picker-modal").find((node) => node.props.visible);
    if (!modal) throw new Error("Expected modeled modal host");
    expect(modal.type).toBe("ModalLifecycleHost");
    expect(modal.props).toMatchObject({ transparent: true, presentationStyle: "overFullScreen" });
    expect(within(modal).getByLabelText("Target 1 type").type).toBe("NativePicker");
    expect(within(modal).getByTestId("step-picker-root").props.accessibilityViewIsModal).toBe(true);
    await fireEvent.changeText(screen.getByLabelText("Target 1 value exact value"), "bad");
    await fireEvent(modal, "requestClose");
    expect(
      screen.queryByLabelText("Target 1 value exact value", { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.queryByLabelText("Target 1 type", { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(screen.getByText("Done"));
    expect(screen.getByLabelText("Target 1 value exact value").props.value).toBe("bad");
  });
});
