import React from "react";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { ChartRangeModal } from "../ChartRangeModal";

type MockProps = Record<string, unknown> & { children?: React.ReactNode };

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Modal: (props: MockProps) => React.createElement("Modal", props, props.children),
  ScrollView: (props: MockProps) => React.createElement("ScrollView", props, props.children),
  TouchableOpacity: (props: MockProps) =>
    React.createElement("TouchableOpacity", props, props.children),
  View: (props: MockProps) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: MockProps) => React.createElement("Text", props, props.children),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  X: (props: MockProps) => React.createElement("X", props),
}));

describe("ChartRangeModal", () => {
  const rangeOptions = [
    { value: "7d", label: "7D", accessibilityLabel: "Last 7 days" },
    { value: "30d", label: "30D", accessibilityLabel: "Last 30 days" },
  ] as const;

  it("exposes modal controls and updates its typed range", () => {
    const onClose = jest.fn();

    renderNative(
      <ChartRangeModal
        visible
        title="Training load"
        onClose={onClose}
        defaultRange="7d"
        rangeOptions={rangeOptions}
      >
        {(range) => React.createElement("Text", { testID: "selected-range" }, range)}
      </ChartRangeModal>,
    );

    expect(screen.getByRole("header", { name: "Training load" })).toBeTruthy();
    expect(screen.getByLabelText("Last 7 days range").props.accessibilityState).toEqual({
      selected: true,
    });

    fireEvent.press(screen.getByLabelText("Last 30 days range"));
    expect(screen.getByTestId("selected-range").props.children).toBe("30d");

    fireEvent.press(screen.getByLabelText("Close chart details"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets to a new default and never retains a removed option", () => {
    const { rerender } = renderNative(
      <ChartRangeModal
        visible
        title="Training load"
        onClose={jest.fn()}
        defaultRange="7d"
        rangeOptions={rangeOptions}
      >
        {(range) => React.createElement("Text", { testID: "selected-range" }, range)}
      </ChartRangeModal>,
    );

    fireEvent.press(screen.getByLabelText("Last 30 days range"));
    expect(screen.getByTestId("selected-range").props.children).toBe("30d");

    rerender(
      <ChartRangeModal
        visible
        title="Training load"
        onClose={jest.fn()}
        defaultRange="7d"
        rangeOptions={[rangeOptions[0]]}
      >
        {(range) => React.createElement("Text", { testID: "selected-range" }, range)}
      </ChartRangeModal>,
    );
    expect(screen.getByTestId("selected-range").props.children).toBe("7d");

    rerender(
      <ChartRangeModal
        visible
        title="Training load"
        onClose={jest.fn()}
        defaultRange="30d"
        rangeOptions={rangeOptions}
      >
        {(range) => React.createElement("Text", { testID: "selected-range" }, range)}
      </ChartRangeModal>,
    );
    expect(screen.getByTestId("selected-range").props.children).toBe("30d");
  });
});
