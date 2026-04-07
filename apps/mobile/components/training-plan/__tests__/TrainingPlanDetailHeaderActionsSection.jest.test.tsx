import { act } from "@testing-library/react-native";
import React from "react";
import { renderNative, screen } from "../../../test/render-native";
import { TrainingPlanDetailHeaderActionsSection } from "../TrainingPlanDetailHeaderActionsSection";

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
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/switch", () => ({ __esModule: true, Switch: createHost("Switch") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("../TrainingPlanSummaryHeader", () => ({
  __esModule: true,
  TrainingPlanSummaryHeader: ({ rightAccessory, ...props }: any) =>
    React.createElement("TrainingPlanSummaryHeader", props, rightAccessory),
}));
jest.mock("../TrainingPlanTemplateSchedulingDialog", () => ({
  __esModule: true,
  TrainingPlanTemplateSchedulingDialog: createHost("TrainingPlanTemplateSchedulingDialog"),
}));

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
  if (Array.isArray(children)) return children.map((child) => getNodeText(child)).join("");
  if (children?.props?.children !== undefined) return getNodeText(children.props.children);
  return "";
};

describe("TrainingPlanDetailHeaderActionsSection", () => {
  it("shows duplicate copy CTA for shared plans", () => {
    renderNative(
      <TrainingPlanDetailHeaderActionsSection
        duplicatePending={false}
        handleDuplicate={jest.fn()}
        handleEditStructure={jest.fn()}
        handleToggleLike={jest.fn()}
        handleTogglePrivacy={jest.fn()}
        isLiked={false}
        isOwnedByUser={false}
        isPublic={false}
        likesCount={0}
        onOpenCalendar={jest.fn()}
        plan={{
          name: "Shared Plan",
          created_at: "2026-01-01T00:00:00.000Z",
          durationWeeks: { recommended: 8 },
          sessions_per_week_target: 4,
        }}
        schedulingDialogProps={{} as any}
        visibilityPending={false}
      />,
    );

    expect(
      getAllByTypeOrEmpty("Button").some((node: any) =>
        getNodeText(node.props.children).includes("Make Editable Copy"),
      ),
    ).toBe(true);
  });

  it("delegates privacy toggle to the passed handler", async () => {
    const handleTogglePrivacy = jest.fn();

    renderNative(
      <TrainingPlanDetailHeaderActionsSection
        duplicatePending={false}
        handleDuplicate={jest.fn()}
        handleEditStructure={jest.fn()}
        handleToggleLike={jest.fn()}
        handleTogglePrivacy={handleTogglePrivacy}
        isLiked={false}
        isOwnedByUser={true}
        isPublic={false}
        likesCount={0}
        onOpenCalendar={jest.fn()}
        plan={{ name: "Owned Plan", created_at: "2026-01-01T00:00:00.000Z" }}
        schedulingDialogProps={{} as any}
        visibilityPending={false}
      />,
    );

    const switches = getAllByTypeOrEmpty("Switch");
    await act(async () => {
      switches[0].props.onCheckedChange(true);
    });

    expect(handleTogglePrivacy).toHaveBeenCalledWith(true);
  });
});
