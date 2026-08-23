import React from "react";
import { type HostProps, createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { TrainingPlanDetailHeaderActionsSection } from "../TrainingPlanDetailHeaderActionsSection";

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("@/components/shared/EntityOwnerRow", () => ({
  __esModule: true,
  EntityOwnerRow: mockCreateHost("EntityOwnerRow"),
}));
jest.mock("../TrainingPlanSummaryHeader", () => ({
  __esModule: true,
  TrainingPlanSummaryHeader: ({
    rightAccessory,
    ...props
  }: HostProps & { rightAccessory?: React.ReactNode }) =>
    React.createElement("TrainingPlanSummaryHeader", props, rightAccessory),
}));

describe("TrainingPlanDetailHeaderActionsSection", () => {
  it("shows the simplified identity card with save action", async () => {
    await renderNative(
      <TrainingPlanDetailHeaderActionsSection
        handleToggleLike={jest.fn()}
        isLiked={false}
        likesCount={0}
        plan={{
          name: "Shared Plan",
          created_at: "2026-01-01T00:00:00.000Z",
          structure: {
            version: 1,
            durationWeeks: { recommended: 8 },
            sessions: [
              { offset_days: 0, activity_plan_id: "11111111-1111-4111-8111-111111111111" },
              { offset_days: 49, activity_plan_id: "11111111-1111-4111-8111-111111111111" },
            ],
          },
        }}
      />,
    );

    expect(screen.getByTestId("training-plan-like-button")).toBeTruthy();
    expect(screen.getByText("Plan schedule")).toBeTruthy();
    expect(screen.getByTestId("training-plan-planned-preview-detail")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-week-7")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-empty-1")).toBeTruthy();
    expect(screen.getByLabelText(/not athlete-specific training load/)).toBeTruthy();
  });

  it("shows saved state copy when liked with count", async () => {
    await renderNative(
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
