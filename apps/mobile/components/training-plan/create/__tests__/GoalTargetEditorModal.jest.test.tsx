import React from "react";
import { fireEvent, renderNative } from "../../../../test/render-native";
import { GoalTargetEditorModal } from "../GoalTargetEditorModal";

jest.mock("../../../../lib/training-plan-form/input-parsers", () => ({
  __esModule: true,
  parseNumberOrUndefined: (value: unknown) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  },
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Modal: (props: any) => React.createElement("Modal", props, props.children),
  ScrollView: (props: any) => React.createElement("ScrollView", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: (props: any) => React.createElement("Button", props, props.children),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

jest.mock("@repo/ui/components/label", () => ({
  __esModule: true,
  Label: (props: any) => React.createElement("Label", props, props.children),
}));

jest.mock("@repo/ui/components/select", () => ({
  __esModule: true,
  Select: (props: any) => React.createElement("Select", props, props.children),
  SelectContent: (props: any) => React.createElement("SelectContent", props, props.children),
  SelectItem: (props: any) => React.createElement("SelectItem", props, props.children),
  SelectTrigger: (props: any) => React.createElement("SelectTrigger", props, props.children),
  SelectValue: (props: any) => React.createElement("SelectValue", props),
}));

jest.mock("@repo/ui/components/bounded-number-input", () => ({
  __esModule: true,
  BoundedNumberInput: (props: any) => React.createElement("BoundedNumberInput", props),
}));

jest.mock("@repo/ui/components/duration-input", () => ({
  __esModule: true,
  DurationInput: (props: any) => React.createElement("DurationInput", props),
}));

jest.mock("@repo/ui/components/pace-input", () => ({
  __esModule: true,
  PaceInput: (props: any) => React.createElement("PaceInput", props),
}));

const findMockNodes = (rendered: ReturnType<typeof renderNative>, type: string) =>
  (() => {
    try {
      return (rendered as any).UNSAFE_getAllByType(type);
    } catch {
      return [];
    }
  })();

describe("GoalTargetEditorModal", () => {
  it("updates target type from the editing context", () => {
    const onUpdateTarget = jest.fn();

    const rendered = renderNative(
      <GoalTargetEditorModal
        editingContext={{
          goalId: "goal-1",
          goalIndex: 0,
          targetIndex: 0,
          target: {
            id: "target-1",
            targetType: "race_performance",
            activityCategory: "run",
          },
        }}
        getError={() => undefined}
        onClose={jest.fn()}
        onUpdateTarget={onUpdateTarget}
      />,
    );

    const typeSelect = findMockNodes(rendered, "Select")[0];
    fireEvent(typeSelect, "onValueChange", { value: "power_threshold", label: "Power test" });

    expect(onUpdateTarget).toHaveBeenCalledWith("goal-1", "target-1", {
      activityCategory: "run",
      targetType: "power_threshold",
    });
  });

  it("parses power input and closes from the header action", () => {
    const onClose = jest.fn();
    const onUpdateTarget = jest.fn();

    const rendered = renderNative(
      <GoalTargetEditorModal
        editingContext={{
          goalId: "goal-1",
          goalIndex: 0,
          targetIndex: 0,
          target: {
            id: "target-1",
            targetType: "power_threshold",
            activityCategory: "bike",
            targetWatts: 285,
            testDurationHms: "0:20:00",
          },
        }}
        getError={() => undefined}
        onClose={onClose}
        onUpdateTarget={onUpdateTarget}
      />,
    );

    const wattsInput = findMockNodes(rendered, "BoundedNumberInput").find(
      (node: any) => node.props.id === "editor-power-watts",
    );
    fireEvent(wattsInput, "onChange", "300");

    expect(onUpdateTarget).toHaveBeenCalledWith("goal-1", "target-1", {
      targetWatts: 300,
    });

    const doneButton = findMockNodes(rendered, "Button").find(
      (node: any) => node.props.size === "sm",
    );
    fireEvent.press(doneButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
