import React from "react";
import { Text } from "react-native";

import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const bottomSafeAreaInset = 34;
const mockDismiss = jest.fn();
const mockPresent = jest.fn();
const mockSnapToIndex = jest.fn();

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ bottom: bottomSafeAreaInset, left: 0, right: 0, top: 0 }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: mockCreateHost("View"),
}));

jest.mock("@gorhom/bottom-sheet", () => {
  type MockBottomSheetProps = React.PropsWithChildren<
    Record<string, unknown> & {
      footerComponent?: (props: { animatedFooterPosition: { value: number } }) => React.ReactNode;
      backdropComponent?: (props: Record<string, unknown>) => React.ReactNode;
    }
  >;
  type MockHostProps = React.PropsWithChildren<Record<string, unknown>>;

  const BottomSheetModal = React.forwardRef(
    ({ children, footerComponent, backdropComponent, ...props }: MockBottomSheetProps, ref) => {
      React.useImperativeHandle(ref, () => ({
        dismiss: mockDismiss,
        present: mockPresent,
        snapToIndex: mockSnapToIndex,
      }));

      return React.createElement(
        "BottomSheetModal",
        { testID: "bottom-sheet-modal", ...props },
        children,
        backdropComponent?.({ testID: "sheet-backdrop" }),
        footerComponent?.({ animatedFooterPosition: { value: 0 } }),
      );
    },
  );
  const BottomSheet = React.forwardRef(({ children, ...props }: MockBottomSheetProps, ref) => {
    React.useImperativeHandle(ref, () => ({ snapToIndex: mockSnapToIndex }));
    return React.createElement("BottomSheet", { testID: "bottom-sheet", ...props }, children);
  });

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetModal,
    BottomSheetBackdrop: mockCreateHost("BottomSheetBackdrop"),
    BottomSheetFooter: ({ children, ...props }: MockHostProps) =>
      React.createElement(
        "BottomSheetFooter",
        { testID: "bottom-sheet-footer", ...props },
        children,
      ),
    BottomSheetScrollView: ({ children, ...props }: MockHostProps) =>
      React.createElement(
        "BottomSheetScrollView",
        { testID: "bottom-sheet-scroll-view", ...props },
        children,
      ),
    BottomSheetView: mockCreateHost("BottomSheetView"),
  };
});

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ testId, ...props }: Record<string, unknown> & { testId?: string }) =>
    React.createElement("Button", { ...props, testID: testId }),
}));
jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: mockCreateHost("Text"),
}));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronLeft: mockCreateHost("ChevronLeft"),
  Pencil: mockCreateHost("Pencil"),
  X: mockCreateHost("X"),
}));
jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));
jest.mock("@/lib/theme/native-bottom-sheet", () => ({
  __esModule: true,
  getNativeBottomSheetVisualTokens: () => ({
    backgroundStyle: {},
    handleIndicatorStyle: {},
  }),
}));

const {
  APP_BOTTOM_SHEET_PRESENTATIONS,
  AppBottomSheet,
  AppBottomSheetContent,
} = require("../AppBottomSheet");

describe("AppBottomSheet safe-area spacing", () => {
  it("routes a guarded backdrop close request to the owner before dismissal", async () => {
    const close = jest.fn();
    const attempt = jest.fn();
    const view = await renderNative(
      <AppBottomSheet guardedClose onAttemptClose={attempt} onClose={close} title="Draft" visible>
        <Text>Draft retained</Text>
      </AppBottomSheet>,
    );
    expect(screen.getByTestId("bottom-sheet-modal").props.enablePanDownToClose).toBe(false);
    expect(screen.getByTestId("sheet-backdrop").props.pressBehavior).toBe("none");
    expect(screen.getByTestId("bottom-sheet-modal").props.enableDismissOnClose).toBe(false);
    await fireEvent.press(screen.getByTestId("guarded-sheet-backdrop"));
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(screen.getByText("Draft retained")).toBeTruthy();
    await view.rerender(
      <AppBottomSheet guardedClose onClose={close} title="Draft" visible={false}>
        <Text>Draft retained</Text>
      </AppBottomSheet>,
    );
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });
  beforeEach(() => {
    mockDismiss.mockClear();
    mockPresent.mockClear();
    mockSnapToIndex.mockClear();
  });

  it("restores a rejected modal pan and permits another distinct close attempt", async () => {
    const attempt = jest.fn();
    const change = jest.fn();
    await renderNative(
      <AppBottomSheet
        guardedClose
        guardedPanDownToClose
        onAttemptClose={attempt}
        onClose={jest.fn()}
        onChange={change}
        title="Interval"
        visible
      >
        <Text>Retained edits</Text>
      </AppBottomSheet>,
    );
    const sheet = screen.getByTestId("bottom-sheet-modal");
    expect(sheet.props.enableDismissOnClose).toBe(false);
    await fireEvent(sheet, "animate", 0, -1);
    await fireEvent(sheet, "animate", 0, -1);
    await fireEvent(sheet, "change", -1);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockSnapToIndex).toHaveBeenLastCalledWith(0);
    expect(change).not.toHaveBeenCalledWith(-1);
    await fireEvent(sheet, "change", 0);
    await fireEvent(sheet, "animate", 0, -1);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not intercept or restore an accepted parent-controlled modal close", async () => {
    const attempt = jest.fn();
    const view = await renderNative(
      <AppBottomSheet
        guardedClose
        guardedPanDownToClose
        onAttemptClose={attempt}
        onClose={jest.fn()}
        title="Interval"
        visible
      >
        <Text>Edits</Text>
      </AppBottomSheet>,
    );
    await view.rerender(
      <AppBottomSheet
        guardedClose
        guardedPanDownToClose
        onAttemptClose={attempt}
        onClose={jest.fn()}
        title="Interval"
        visible={false}
      >
        <Text>Edits</Text>
      </AppBottomSheet>,
    );
    const sheet = screen.getByTestId("bottom-sheet-modal");
    await fireEvent(sheet, "animate", 0, -1);
    await fireEvent(sheet, "change", -1);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(attempt).not.toHaveBeenCalled();
    expect(mockSnapToIndex).not.toHaveBeenCalled();
  });

  it("retains onClose as the guarded scrim fallback for existing consumers", async () => {
    const close = jest.fn();
    await renderNative(
      <AppBottomSheet guardedClose onClose={close} title="Draft" visible>
        <Text>Edits</Text>
      </AppBottomSheet>,
    );
    await fireEvent.press(screen.getByTestId("guarded-sheet-backdrop"));
    expect(close).toHaveBeenCalledTimes(1);
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("uses the global modal layer with replacement stacking", async () => {
    await renderNative(
      <AppBottomSheet onClose={jest.fn()} title="Global sheet" visible>
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    expect(screen.getByTestId("bottom-sheet-modal").props.stackBehavior).toBe("replace");
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });

  it("routes one guarded inspector pan-close attempt through its owner and snaps back", async () => {
    const onAttemptClose = jest.fn();
    const onChange = jest.fn();
    await renderNative(
      <AppBottomSheet
        guardedClose
        initialSnapIndex={1}
        onAttemptClose={onAttemptClose}
        onChange={onChange}
        onClose={jest.fn()}
        presentation="inspector"
        title="Interval"
        visible
      >
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    const nativeSheet = screen.getByTestId("bottom-sheet");
    expect(nativeSheet.props.enablePanDownToClose).toBe(true);
    await fireEvent(nativeSheet, "animate", 1, -1);
    await fireEvent(nativeSheet, "animate", 1, -1);
    expect(onAttemptClose).toHaveBeenCalledTimes(1);
    expect(mockSnapToIndex).toHaveBeenCalledWith(1);

    await fireEvent(nativeSheet, "change", 1);
    expect(onChange).toHaveBeenCalledWith(1);
    await fireEvent(nativeSheet, "animate", 0, -1);
    expect(onAttemptClose).toHaveBeenCalledTimes(2);
    expect(mockSnapToIndex).toHaveBeenLastCalledWith(0);
  });

  it("suppresses an intercepted -1 change before forwarding the snap-back settlement", async () => {
    const onAttemptClose = jest.fn();
    const onChange = jest.fn();
    await renderNative(
      <AppBottomSheet
        guardedClose
        initialSnapIndex={1}
        onAttemptClose={onAttemptClose}
        onChange={onChange}
        onClose={jest.fn()}
        presentation="inspector"
        title="Interval"
        visible
      >
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    const nativeSheet = screen.getByTestId("bottom-sheet");
    await fireEvent(nativeSheet, "animate", 1, -1);
    await fireEvent(nativeSheet, "change", -1);
    await fireEvent(nativeSheet, "change", 1);

    expect(onAttemptClose).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("executes a nonce-controlled inspector snap request through the native ref", async () => {
    const onAnimate = jest.fn();
    const onChange = jest.fn();
    const rendered = await renderNative(
      <AppBottomSheet
        onAnimate={onAnimate}
        onChange={onChange}
        onClose={jest.fn()}
        presentation="inspector"
        title="Interval"
        visible
      >
        <Text>Content</Text>
      </AppBottomSheet>,
    );
    const nativeSheet = screen.getByTestId("bottom-sheet");
    await fireEvent(nativeSheet, "animate", 1, 0);
    await fireEvent(nativeSheet, "change", 0);
    expect(onAnimate).toHaveBeenCalledWith(1, 0);
    expect(onChange).toHaveBeenCalledWith(0);

    await rendered.rerender(
      <AppBottomSheet
        onClose={jest.fn()}
        presentation="inspector"
        snapRequest={{ index: 1, nonce: 1 }}
        title="Interval"
        visible
      >
        <Text>Content</Text>
      </AppBottomSheet>,
    );
    expect(mockSnapToIndex).toHaveBeenCalledWith(1);

    await rendered.rerender(
      <AppBottomSheet
        onClose={jest.fn()}
        presentation="inspector"
        snapRequest={{ index: 0, nonce: 1 }}
        title="Interval"
        visible
      >
        <Text>Content</Text>
      </AppBottomSheet>,
    );
    expect(mockSnapToIndex).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss an unopened modal before presenting it", async () => {
    const rendered = await renderNative(
      <AppBottomSheet onClose={jest.fn()} title="Comments" visible={false}>
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    expect(mockDismiss).not.toHaveBeenCalled();

    await rendered.rerender(
      <AppBottomSheet onClose={jest.fn()} title="Comments" visible>
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    expect(mockPresent).toHaveBeenCalledTimes(1);
  });

  it("exports stable presentation presets", () => {
    expect(APP_BOTTOM_SHEET_PRESENTATIONS).toEqual({
      filter: { initialSnapIndex: 0, snapPoints: ["78%"] },
      inspector: { initialSnapIndex: 0, snapPoints: ["82%", "96%"] },
      browser: { initialSnapIndex: 1, snapPoints: ["88%", "96%"] },
    });
  });

  it("adds the bottom safe-area inset to explicit scroll content padding", async () => {
    await renderNative(
      <AppBottomSheetContent paddingBottom={24}>
        <Text>Content</Text>
      </AppBottomSheetContent>,
    );

    expect(screen.getByTestId("bottom-sheet-scroll-view").props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 58 })]),
    );
  });

  it("positions a fixed footer above the bottom safe area and clears scroll content", async () => {
    await renderNative(
      <AppBottomSheet
        contentPaddingBottom={40}
        footer="Footer"
        onClose={jest.fn()}
        title="Safe sheet"
        visible
      >
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    expect(screen.getByTestId("bottom-sheet-footer").props.bottomInset).toBe(bottomSafeAreaInset);
    expect(screen.getByTestId("bottom-sheet-scroll-view").props).toMatchObject({
      enableFooterMarginAdjustment: true,
    });
    expect(screen.getByTestId("bottom-sheet-scroll-view").props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 74 })]),
    );
  });

  it("provides a labeled, stable back action", async () => {
    const onBack = jest.fn();
    await renderNative(
      <AppBottomSheet onBack={onBack} onClose={jest.fn()} title="Filters" visible>
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    const backButton = screen.getByTestId("app-bottom-sheet-back");
    expect(backButton.props.accessibilityLabel).toBe("Back from Filters");
    expect(backButton.props).toMatchObject({
      accessibilityState: { disabled: false },
      role: "button",
      size: "icon",
    });
    await fireEvent.press(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("keeps Close opt-in and marks the title as a header", async () => {
    await renderNative(
      <AppBottomSheet onClose={jest.fn()} title="Default sheet" visible>
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    expect(screen.queryByTestId("app-bottom-sheet-close")).toBeNull();
    expect(screen.getByText("Default sheet").props.accessibilityRole).toBe("header");
  });

  it("supports an explicit neutral Cancel action without changing back callback ownership", async () => {
    const onBack = jest.fn();
    const onClose = jest.fn();
    await renderNative(
      <AppBottomSheet
        backLabel="Cancel"
        headerLayout="centered"
        headerAction={<Text>Done</Text>}
        onBack={onBack}
        onClose={onClose}
        title="Duration"
        visible
      >
        <Text>Field editor</Text>
      </AppBottomSheet>,
    );
    expect(screen.getByText("Cancel").props.className).toContain("text-foreground");
    await fireEvent.press(screen.getByLabelText("Cancel editor"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("provides an explicit opt-in Close action and can place a custom header in normal layout", async () => {
    const onClose = jest.fn();
    await renderNative(
      <AppBottomSheet
        contentMode="custom"
        customHeaderInLayout
        onClose={onClose}
        showCloseAction
        title="Activity"
        visible
      >
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    await fireEvent.press(screen.getByTestId("app-bottom-sheet-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("app-bottom-sheet").props.style).toEqual({ flex: 1 });
  });

  it("can opt into a centered editor header with one right-side action", async () => {
    await renderNative(
      <AppBottomSheet
        headerAction={<Text>Done</Text>}
        headerLayout="centered"
        onBack={jest.fn()}
        onClose={jest.fn()}
        title="Edit interval"
        visible
      >
        <Text>Content</Text>
      </AppBottomSheet>,
    );

    expect(screen.getByText("Edit interval").props.className).toContain("text-center");
    expect(screen.getByText("Done")).toBeTruthy();
  });
});
