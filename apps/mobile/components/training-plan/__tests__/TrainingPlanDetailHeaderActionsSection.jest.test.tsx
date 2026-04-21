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
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/EntityOwnerRow", () => ({
  __esModule: true,
  EntityOwnerRow: createHost("EntityOwnerRow"),
}));
jest.mock("../TrainingPlanSummaryHeader", () => ({
  __esModule: true,
  TrainingPlanSummaryHeader: ({ rightAccessory, ...props }: any) =>
    React.createElement("TrainingPlanSummaryHeader", props, rightAccessory),
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
  it("shows the simplified identity card with save action", () => {
    renderNative(
      <TrainingPlanDetailHeaderActionsSection
        handleToggleLike={jest.fn()}
        isLiked={false}
        likesCount={0}
        plan={{
          name: "Shared Plan",
          created_at: "2026-01-01T00:00:00.000Z",
          durationWeeks: { recommended: 8 },
          sessions_per_week_target: 4,
        }}
      />,
    );

    expect(screen.getByTestId("training-plan-like-button")).toBeTruthy();
    expect(screen.getByText("Plan snapshot")).toBeTruthy();
  });

  it("shows saved state copy when liked with count", async () => {
    renderNative(
      <TrainingPlanDetailHeaderActionsSection
        handleToggleLike={jest.fn()}
        isLiked={true}
        likesCount={3}
        plan={{ name: "Owned Plan", created_at: "2026-01-01T00:00:00.000Z" }}
      />,
    );

    expect(screen.getByText("3")).toBeTruthy();
  });
});
