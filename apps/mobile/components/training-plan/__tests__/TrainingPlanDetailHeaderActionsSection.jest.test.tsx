import React from "react";
import { type HostProps, createHost as mockCreateHost } from "../../../test/mock-components";
import { act, fireEvent, renderNative, screen } from "../../../test/render-native";
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
        handleShare={jest.fn()}
        commentCount={0}
        isLiked={false}
        likesCount={0}
        onCommentsPress={jest.fn()}
        plan={{
          name: "Shared Plan",
          created_at: "2026-01-01T00:00:00.000Z",
          structure: {
            version: 1,
            plan_preferences: {
              weekly_session_count: 2,
              target_weekly_duration_minutes: 120,
              maximum_session_duration_minutes: 90,
              preferred_weekdays: [1, 4],
              rest_days: [0, 2, 3, 5, 6],
              progression_style: "balanced",
              recovery_priority: "balanced",
            },
            durationWeeks: { recommended: 8 },
            sessions: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                offset_days: 0,
                activity_plan_id: "11111111-1111-4111-8111-111111111111",
                demand: {
                  activity_category: "run",
                  training_intent: "aerobic_base",
                  target_duration_minutes: 60,
                  target_common_load: 40,
                  importance: "normal",
                },
              },
              {
                id: "33333333-3333-4333-8333-333333333333",
                offset_days: 49,
                activity_plan_id: "11111111-1111-4111-8111-111111111111",
                demand: {
                  activity_category: "run",
                  training_intent: "aerobic_base",
                  target_duration_minutes: 60,
                  target_common_load: 40,
                  importance: "normal",
                },
              },
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
        handleShare={jest.fn()}
        commentCount={0}
        isLiked={true}
        likesCount={3}
        onCommentsPress={jest.fn()}
        plan={{ name: "Owned Plan", created_at: "2026-01-01T00:00:00.000Z" }}
      />,
    );

    expect(screen.getByText("3")).toBeTruthy();
  });

  it("disables the like control until an in-flight toggle settles", async () => {
    let resolveToggle: (() => void) | undefined;
    const handleToggleLike = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveToggle = resolve;
        }),
    );
    await renderNative(
      <TrainingPlanDetailHeaderActionsSection
        handleToggleLike={handleToggleLike}
        handleShare={jest.fn()}
        commentCount={0}
        isLiked={false}
        likesCount={0}
        onCommentsPress={jest.fn()}
        plan={{ name: "Owned Plan", created_at: "2026-01-01T00:00:00.000Z" }}
      />,
    );

    await fireEvent.press(screen.getByTestId("training-plan-like-button"));
    expect(screen.getByTestId("training-plan-like-button").props.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId("training-plan-like-button"));
    expect(handleToggleLike).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveToggle?.();
    });
  });

  it("keeps Share present but disabled while visibility is updating", async () => {
    await renderNative(
      <TrainingPlanDetailHeaderActionsSection
        handleToggleLike={jest.fn()}
        handleShare={jest.fn()}
        shareDisabled
        commentCount={0}
        isLiked={false}
        likesCount={0}
        onCommentsPress={jest.fn()}
        plan={{ name: "Owned Plan", created_at: "2026-01-01T00:00:00.000Z" }}
      />,
    );

    expect(screen.getByTestId("training-plan-share-button").props.disabled).toBe(true);
  });

  it("describes a scheduled program without global active-plan language", async () => {
    await renderNative(
      <TrainingPlanDetailHeaderActionsSection
        handleToggleLike={jest.fn()}
        handleShare={jest.fn()}
        commentCount={0}
        isLiked={false}
        isScheduledPlan
        likesCount={0}
        onCommentsPress={jest.fn()}
        plan={{ name: "Build Base", created_at: "2026-01-01T00:00:00.000Z" }}
      />,
    );

    expect(screen.getByText("This program has future sessions on your calendar.")).toBeTruthy();
    expect(screen.queryByText("Current scheduled plan")).toBeNull();
  });
});
