import React from "react";

import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const bottomSafeAreaInset = 34;

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
    }
  >;
  type MockHostProps = React.PropsWithChildren<Record<string, unknown>>;

  const BottomSheet = React.forwardRef(
    ({ children, footerComponent, ...props }: MockBottomSheetProps, _ref) =>
      React.createElement(
        "BottomSheet",
        props,
        children,
        footerComponent?.({ animatedFooterPosition: { value: 0 } }),
      ),
  );

  return {
    __esModule: true,
    default: BottomSheet,
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

const { AppBottomSheet, AppBottomSheetContent } = require("../AppBottomSheet");

describe("AppBottomSheet safe-area spacing", () => {
  it("adds the bottom safe-area inset to explicit scroll content padding", () => {
    renderNative(<AppBottomSheetContent paddingBottom={24}>Content</AppBottomSheetContent>);

    expect(screen.getByTestId("bottom-sheet-scroll-view").props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 58 })]),
    );
  });

  it("positions a fixed footer above the bottom safe area and clears scroll content", () => {
    renderNative(
      <AppBottomSheet
        contentPaddingBottom={40}
        footer="Footer"
        onClose={jest.fn()}
        title="Safe sheet"
        visible
      >
        Content
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

  it("provides a labeled, stable back action", () => {
    const onBack = jest.fn();
    renderNative(
      <AppBottomSheet onBack={onBack} onClose={jest.fn()} title="Filters" visible>
        Content
      </AppBottomSheet>,
    );

    const backButton = screen.getByTestId("app-bottom-sheet-back");
    expect(backButton.props.accessibilityLabel).toBe("Back from Filters");
    expect(backButton.props).toMatchObject({
      accessibilityState: { disabled: false },
      role: "button",
      size: "icon",
    });
    fireEvent.press(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
