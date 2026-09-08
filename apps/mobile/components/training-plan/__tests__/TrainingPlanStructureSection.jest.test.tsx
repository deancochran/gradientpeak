import { act } from "@testing-library/react-native";
import { isValidElement, type ReactNode } from "react";
import type { TestInstance as ReactTestInstance } from "test-renderer";
import { createActivityPlanSummary } from "../../../test/activity-plan-projection-fixture";
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
jest.mock("@/components/shared/ActivityPlanCard", () => ({
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

const getAllByTypeOrEmpty = (type: string) =>
  screen.container.queryAll((node: ReactTestInstance) => node.type === type);

const getNodeText = (children: ReactNode): string => {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(getNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(children))
    return getNodeText(children.props.children);
  return "";
};

const findTouchableByText = (text: string) =>
  getAllByTypeOrEmpty("TouchableOpacity").find((node: ReactTestInstance) => {
    if (typeof node.props?.onPress !== "function") {
      return false;
    }

    return (
      node.queryAll((child: ReactTestInstance) => getNodeText(child.props.children) === text)
        .length > 0
    );
  });

describe("TrainingPlanStructureSection", () => {
  it("renders the session-view empty state", async () => {
    await renderNative(
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

  it("delegates picker close events back to the route owner", async () => {
    const onActivityPickerOpenChange = jest.fn();

    await renderNative(
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
      (node: ReactTestInstance) => getNodeText(node.props.children) === "Close",
    );
    if (!closeButton) throw new Error("Expected a Close button");
    await act(() => {
      closeButton.props.onPress();
    });

    expect(onActivityPickerOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders activity-plan choices with the canonical card and preserves selection", async () => {
    const activityPlan = createActivityPlanSummary({
      id: "activity-plan-1",
      name: "Tempo Builder",
    });
    const onSelectActivityForSession = jest.fn();

    await renderNative(
      <TrainingPlanStructureSection
        activityPlanItems={[activityPlan]}
        activityPlanNameById={new Map()}
        formatCompactDayLabel={() => "Mon · Day 1"}
        groupedStructureSessions={[]}
        isLoadingActivityPlans={false}
        isOwnedByUser={true}
        onActivityPickerOpenChange={jest.fn()}
        onOpenActivityPickerForSession={jest.fn()}
        onRefreshActivityPlans={jest.fn()}
        onRemoveActivityFromSession={jest.fn()}
        onSelectActivityForSession={onSelectActivityForSession}
        selectedSessionRow={null}
        showActivityPicker={true}
        updatePlanStructurePending={false}
      />,
    );

    const card = screen.getByTestId("training-plan-activity-picker-option-activity-plan-1");
    expect(card.props.plan).toBe(activityPlan);
    expect(card.props.variant).toBe("compact");
    await act(() => card.props.onPress());
    expect(onSelectActivityForSession).toHaveBeenCalledWith(activityPlan);
  });

  it("opens the activity picker for an owned session", async () => {
    const onOpenActivityPickerForSession = jest.fn();

    await renderNative(
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
    if (!trigger) throw new Error("Expected a Change control");
    await act(() => {
      trigger.props.onPress();
    });

    expect(onOpenActivityPickerForSession).toHaveBeenCalledWith(
      expect.objectContaining({ key: "session-1" }),
    );
  });
});
