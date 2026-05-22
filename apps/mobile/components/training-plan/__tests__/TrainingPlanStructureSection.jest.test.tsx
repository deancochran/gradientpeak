import { act } from "@testing-library/react-native";
import React from "react";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { TrainingPlanStructureSection } from "../TrainingPlanStructureSection";

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/dialog", () => ({
  __esModule: true,
  Dialog: createHost("Dialog"),
  DialogClose: createHost("DialogClose"),
  DialogContent: createHost("DialogContent"),
  DialogDescription: createHost("DialogDescription"),
  DialogFooter: createHost("DialogFooter"),
  DialogHeader: createHost("DialogHeader"),
  DialogTitle: createHost("DialogTitle"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

const getAllByTypeOrEmpty = (type: string) => {
  try {
    return (screen as any).UNSAFE_getAllByType(type);
  } catch {
    return [];
  }
};

const getNodeText = (children: any): string => {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(getNodeText).join("");
  if (children?.props?.children !== undefined) return getNodeText(children.props.children);
  return "";
};

const findTouchableByText = (text: string) =>
  getAllByTypeOrEmpty("TouchableOpacity").find((node: any) => {
    if (typeof node.props?.onPress !== "function") {
      return false;
    }

    return node.findAll((child: any) => getNodeText(child.props?.children) === text).length > 0;
  });

describe("TrainingPlanStructureSection", () => {
  it("renders the session-view empty state", () => {
    renderNative(
      <TrainingPlanStructureSection
        activityPlanItems={[]}
        activityPlanNameById={new Map()}
        formatCompactDayLabel={() => "Mon · Day 1"}
        groupedStructureSessions={[]}
        isLoadingActivityPlans={false}
        isOwnedByUser={false}
        onActivityPickerOpenChange={jest.fn()}
        onOpenActivityPickerForSession={jest.fn()}
        onRefreshActivityPlans={jest.fn()}
        onRemoveActivityFromSession={jest.fn()}
        onSelectActivityForSession={jest.fn()}
        selectedSessionRow={null}
        showActivityPicker={false}
        updatePlanStructurePending={false}
      />,
    );

    expect(screen.getByText(/No structured sessions found in this template yet./)).toBeTruthy();
  });

  it("delegates picker close events back to the route owner", () => {
    const onActivityPickerOpenChange = jest.fn();

    renderNative(
      <TrainingPlanStructureSection
        activityPlanItems={[]}
        activityPlanNameById={new Map()}
        formatCompactDayLabel={() => "Mon · Day 1"}
        groupedStructureSessions={[]}
        isLoadingActivityPlans={false}
        isOwnedByUser={false}
        onActivityPickerOpenChange={onActivityPickerOpenChange}
        onOpenActivityPickerForSession={jest.fn()}
        onRefreshActivityPlans={jest.fn()}
        onRemoveActivityFromSession={jest.fn()}
        onSelectActivityForSession={jest.fn()}
        selectedSessionRow={null}
        showActivityPicker={true}
        updatePlanStructurePending={false}
      />,
    );

    const closeButton = getAllByTypeOrEmpty("Button").find(
      (node: any) => getNodeText(node.props?.children) === "Close",
    );
    act(() => {
      closeButton.props.onPress();
    });

    expect(onActivityPickerOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens the activity picker for an owned session", () => {
    const onOpenActivityPickerForSession = jest.fn();

    renderNative(
      <TrainingPlanStructureSection
        activityPlanItems={[]}
        activityPlanNameById={new Map([["activity-1", "Activity"]])}
        formatCompactDayLabel={() => "Mon · Day 1"}
        groupedStructureSessions={[
          {
            microcycle: 1,
            days: [
              {
                dayOffset: 0,
                sessions: [
                  {
                    key: "session-1",
                    title: "Activity",
                    activityPlanId: "activity-1",
                    dayOffset: 0,
                    sourcePath: [],
                  },
                ],
              },
            ],
          },
        ]}
        isLoadingActivityPlans={false}
        isOwnedByUser={true}
        onActivityPickerOpenChange={jest.fn()}
        onOpenActivityPickerForSession={onOpenActivityPickerForSession}
        onRefreshActivityPlans={jest.fn()}
        onRemoveActivityFromSession={jest.fn()}
        onSelectActivityForSession={jest.fn()}
        selectedSessionRow={null}
        showActivityPicker={false}
        updatePlanStructurePending={false}
      />,
    );

    const trigger = findTouchableByText("Change");
    act(() => {
      trigger.props.onPress();
    });

    expect(onOpenActivityPickerForSession).toHaveBeenCalledWith(
      expect.objectContaining({ key: "session-1" }),
    );
  });
});
