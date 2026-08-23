import { fireEvent } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
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
  APP_BOTTOM_SHEET_PRESENTATIONS: {
    filter: { initialSnapIndex: 0, snapPoints: ["78%"] },
  },
  AppBottomSheet: ({
    children,
    footer,
    ...props
  }: React.PropsWithChildren<{ footer: React.ReactNode }>) =>
    React.createElement("AppBottomSheet", props, children, footer),
}));

describe("IndexFilterSheet", () => {
  it("uses the canonical sheet contract and preserves filter actions", async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    const onReset = jest.fn();

    await renderNative(
      <IndexFilterSheet
        description="Refine the index."
        onApply={onApply}
        onClose={onClose}
        onReset={onReset}
        testID="index-filter-sheet"
        title="Sort & Filters"
        visible
      >
        <Text>Filter controls</Text>
      </IndexFilterSheet>,
    );

    expect(screen.getByTestId("index-filter-sheet").props).toMatchObject({
      description: "Refine the index.",
      initialSnapIndex: 0,
      onClose,
      snapPoints: ["78%"],
      title: "Sort & Filters",
      visible: true,
    });
    expect(screen.getByText("Clear filters")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("index-filter-sheet-reset"));
    await fireEvent.press(screen.getByTestId("index-filter-sheet-apply"));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("keeps disabled reset and apply actions inert", async () => {
    const onApply = jest.fn();
    const onReset = jest.fn();

    await renderNative(
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
        <Text>Filter controls</Text>
      </IndexFilterSheet>,
    );

    expect(screen.getByTestId("index-filter-sheet-reset").props.disabled).toBe(true);
    expect(screen.getByTestId("index-filter-sheet-apply").props.disabled).toBe(true);
  });
});
