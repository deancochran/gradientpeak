import React from "react";
import type { ReactTestInstance } from "react-test-renderer";
import type { HostProps } from "../../../../test/mock-components";
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
  Modal: (props: HostProps) => React.createElement("Modal", props, props.children),
  ScrollView: (props: HostProps) => React.createElement("ScrollView", props, props.children),
  View: (props: HostProps) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: (props: HostProps) => React.createElement("Button", props, props.children),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: HostProps) => React.createElement("Text", props, props.children),
}));

jest.mock("@repo/ui/components/label", () => ({
  __esModule: true,
  Label: (props: HostProps) => React.createElement("Label", props, props.children),
}));

jest.mock("@repo/ui/components/select", () => ({
  __esModule: true,
  Select: (props: HostProps) => React.createElement("Select", props, props.children),
  SelectContent: (props: HostProps) => React.createElement("SelectContent", props, props.children),
  SelectItem: (props: HostProps) => React.createElement("SelectItem", props, props.children),
  SelectTrigger: (props: HostProps) => React.createElement("SelectTrigger", props, props.children),
  SelectValue: (props: HostProps) => React.createElement("SelectValue", props),
}));

jest.mock("@repo/ui/components/bounded-number-input", () => ({
  __esModule: true,
  BoundedNumberInput: (props: HostProps) => React.createElement("BoundedNumberInput", props),
}));

jest.mock("@repo/ui/components/duration-input", () => ({
  __esModule: true,
  DurationInput: (props: HostProps) => React.createElement("DurationInput", props),
}));

jest.mock("@repo/ui/components/pace-input", () => ({
  __esModule: true,
  PaceInput: (props: HostProps) => React.createElement("PaceInput", props),
}));

const findMockNodes = (rendered: ReturnType<typeof renderNative>, type: string) =>
  rendered.UNSAFE_root.findAll((node: ReactTestInstance) => node.type === type);

function requireNode(node: ReactTestInstance | undefined): ReactTestInstance {
  if (!node) throw new Error("Expected mock node");
  return node;
}

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
    if (!typeSelect) {
      throw new Error("Expected the goal target type select");
    }
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
      (node: ReactTestInstance) => node.props.id === "editor-power-watts",
    );
    fireEvent(requireNode(wattsInput), "onChange", "300");

    expect(onUpdateTarget).toHaveBeenCalledWith("goal-1", "target-1", {
      targetWatts: 300,
    });

    const doneButton = findMockNodes(rendered, "Button").find(
      (node: ReactTestInstance) => node.props.size === "sm",
    );
    fireEvent.press(requireNode(doneButton));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
