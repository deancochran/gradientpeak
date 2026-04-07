import { act } from "@testing-library/react-native";
import React from "react";
import { renderNative, screen } from "../../../test/render-native";
import { TrainingPlanStructureSection } from "../TrainingPlanStructureSection";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

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

describe("TrainingPlanStructureSection", () => {
  it("sanitizes non-finite linked activity metrics to 0", () => {
    renderNative(
      <TrainingPlanStructureSection
        activityPlanItems={[]}
        activityPlanNameById={new Map()}
        formatCompactDayLabel={() => "Mon · Day 1"}
        groupedStructureSessions={[]}
        hasIntervals={() => false}
        isLoadingActivityPlans={false}
        isLoadingLinkedPlans={false}
        isOwnedByUser={false}
        linkedActivityPlanItems={[]}
        maxWeeklyLoad={1}
        onActivityPickerOpenChange={jest.fn()}
        onEditStructure={jest.fn()}
        onOpenActivityPickerForSession={jest.fn()}
        onRefreshActivityPlans={jest.fn()}
        onRemoveActivityFromSession={jest.fn()}
        onSelectActivityForSession={jest.fn()}
        planStructure={{}}
        selectedSessionRow={null}
        showActivityPicker={false}
        uniqueLinkedActivityPlans={[
          {
            id: "activity-1",
            name: "Workout",
            activity_category: "run",
            estimated_tss: Number.NaN,
            estimated_duration: Number.NaN,
          },
        ]}
        updatePlanStructurePending={false}
        weeklyLoadSummary={[]}
      />,
    );

    expect(screen.getByText(/RUN · 0 TSS · 0 min/)).toBeTruthy();
  });

  it("delegates picker close events back to the route owner", () => {
    const onActivityPickerOpenChange = jest.fn();

    renderNative(
      <TrainingPlanStructureSection
        activityPlanItems={[]}
        activityPlanNameById={new Map()}
        formatCompactDayLabel={() => "Mon · Day 1"}
        groupedStructureSessions={[]}
        hasIntervals={() => false}
        isLoadingActivityPlans={false}
        isLoadingLinkedPlans={false}
        isOwnedByUser={false}
        linkedActivityPlanItems={[]}
        maxWeeklyLoad={1}
        onActivityPickerOpenChange={onActivityPickerOpenChange}
        onEditStructure={jest.fn()}
        onOpenActivityPickerForSession={jest.fn()}
        onRefreshActivityPlans={jest.fn()}
        onRemoveActivityFromSession={jest.fn()}
        onSelectActivityForSession={jest.fn()}
        planStructure={{}}
        selectedSessionRow={null}
        showActivityPicker={true}
        uniqueLinkedActivityPlans={[]}
        updatePlanStructurePending={false}
        weeklyLoadSummary={[]}
      />,
    );

    const dialog = getAllByTypeOrEmpty("Dialog")[0];
    act(() => {
      dialog.props.onOpenChange(false);
    });

    expect(onActivityPickerOpenChange).toHaveBeenCalledWith(false);
  });
});
