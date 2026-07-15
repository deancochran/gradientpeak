import { fireEvent } from "@testing-library/react-native";
import React from "react";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { IndexFilterSheet } from "../IndexFilterSheet";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: mockCreateHost("Text"),
}));

jest.mock("../AppBottomSheet", () => ({
  __esModule: true,
  AppBottomSheet: ({
    children,
    footer,
    ...props
  }: React.PropsWithChildren<{ footer: React.ReactNode }>) =>
    React.createElement("AppBottomSheet", props, children, footer),
}));

describe("IndexFilterSheet", () => {
  it("uses the canonical sheet contract and preserves filter actions", () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    const onReset = jest.fn();

    renderNative(
      <IndexFilterSheet
        description="Refine the index."
        onApply={onApply}
        onClose={onClose}
        onReset={onReset}
        testID="index-filter-sheet"
        title="Sort & Filters"
        visible
      >
        Filter controls
      </IndexFilterSheet>,
    );

    expect(screen.getByTestId("index-filter-sheet").props).toMatchObject({
      description: "Refine the index.",
      onClose,
      snapPoints: ["78%"],
      title: "Sort & Filters",
      visible: true,
    });
    fireEvent.press(screen.getByTestId("index-filter-sheet-reset"));
    fireEvent.press(screen.getByTestId("index-filter-sheet-apply"));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("keeps disabled reset and apply actions inert", () => {
    const onApply = jest.fn();
    const onReset = jest.fn();

    renderNative(
      <IndexFilterSheet
        description="Refine the index."
        isApplyDisabled
        isResetDisabled
        onApply={onApply}
        onClose={jest.fn()}
        onReset={onReset}
        testID="index-filter-sheet"
        title="Sort & Filters"
        visible
      >
        Filter controls
      </IndexFilterSheet>,
    );

    expect(screen.getByTestId("index-filter-sheet-reset").props.disabled).toBe(true);
    expect(screen.getByTestId("index-filter-sheet-apply").props.disabled).toBe(true);
  });
});
