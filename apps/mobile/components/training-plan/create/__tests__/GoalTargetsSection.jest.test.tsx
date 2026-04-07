import React from "react";
import { fireEvent, renderNative } from "../../../../test/render-native";
import { GoalTargetsSection } from "../GoalTargetsSection";

jest.mock("../GoalTargetEditorModal", () => ({
  __esModule: true,
  getActivityCategoryLabel: (activityCategory: string) =>
    ({ run: "Run", bike: "Bike", swim: "Swim", other: "Other" })[activityCategory],
  getTargetTypeLabel: (targetType: string) =>
    ({
      race_performance: "Race goal",
      pace_threshold: "Pace test",
      power_threshold: "Power test",
      hr_threshold: "Heart-rate threshold",
    })[targetType],
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  Pressable: (props: any) => React.createElement("Pressable", props, props.children),
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

jest.mock("lucide-react-native", () => {
  const icon = (props: any) => React.createElement("Icon", props);
  return {
    __esModule: true,
    Flag: icon,
    Gauge: icon,
    Heart: icon,
    Pencil: icon,
    Trash2: icon,
    Zap: icon,
  };
});

const findMockNodes = (rendered: ReturnType<typeof renderNative>, type: string) =>
  (() => {
    try {
      return (rendered as any).UNSAFE_getAllByType(type);
    } catch {
      return [];
    }
  })();

describe("GoalTargetsSection", () => {
  const activeGoal = {
    id: "goal-1",
    name: "A race",
    targetDate: "2026-06-01",
    priority: 8,
    targets: [
      {
        id: "target-race",
        targetType: "race_performance" as const,
        activityCategory: "run" as const,
        distanceKm: "21.1",
        completionTimeHms: "1:35:00",
      },
      {
        id: "target-power",
        targetType: "power_threshold" as const,
        activityCategory: "bike" as const,
        targetWatts: 285,
        testDurationHms: "0:20:00",
      },
    ],
  };

  it("renders target summaries and row errors", () => {
    const rendered = renderNative(
      <GoalTargetsSection
        activeGoal={activeGoal}
        getTargetRowError={(targetIndex) =>
          targetIndex === 1 ? "Power target needs a valid test duration" : undefined
        }
        onAddTargetWithType={jest.fn()}
        onEditTarget={jest.fn()}
        onRemoveTarget={jest.fn()}
      />,
    );

    expect(rendered.getByText("Targets")).toBeTruthy();
    expect(rendered.getByText("Run - 21.1 km - 1:35:00")).toBeTruthy();
    expect(rendered.getByText("Bike - 285 W - test 0:20:00")).toBeTruthy();
    expect(rendered.getByText("Adjust")).toBeTruthy();
    expect(rendered.getByText("Power target needs a valid test duration")).toBeTruthy();
  });

  it("routes add, edit, and remove actions through callbacks", () => {
    const onAddTargetWithType = jest.fn();
    const onEditTarget = jest.fn();
    const onRemoveTarget = jest.fn();

    const rendered = renderNative(
      <GoalTargetsSection
        activeGoal={activeGoal}
        getTargetRowError={() => undefined}
        onAddTargetWithType={onAddTargetWithType}
        onEditTarget={onEditTarget}
        onRemoveTarget={onRemoveTarget}
      />,
    );

    fireEvent.press(rendered.getByLabelText("Add pace target"));
    expect(onAddTargetWithType).toHaveBeenCalledWith("pace_threshold");

    const pressables = findMockNodes(rendered, "Pressable");
    fireEvent.press(pressables[0]);
    expect(onEditTarget).toHaveBeenCalledWith("target-race");

    fireEvent.press(rendered.getAllByLabelText("Delete target")[1]);
    expect(onRemoveTarget).toHaveBeenCalledWith("target-power");
  });
});
