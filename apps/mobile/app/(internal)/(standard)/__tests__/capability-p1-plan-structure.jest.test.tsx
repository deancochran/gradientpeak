import React from "react";
import { renderNative, screen } from "../../../../test/render-native";

const params = { planId: undefined as string | undefined };
const reset = jest.fn();

jest.mock("expo-router", () => ({ __esModule: true, useLocalSearchParams: () => params }));
jest.mock("@/lib/stores/activityPlanCreation", () => ({
  __esModule: true,
  useActivityPlanCreationStore: (selector: (state: { reset: jest.Mock }) => unknown) =>
    selector({ reset }),
}));
jest.mock("@/components/activity-plan/ActivityPlanComposerScreen", () => ({
  __esModule: true,
  ActivityPlanComposerScreen: (props: Record<string, unknown>) =>
    React.createElement("ActivityPlanComposerScreen", { testID: "composer", ...props }),
}));

describe("activity-plan.edit-structured-steps", () => {
  beforeEach(() => {
    params.planId = undefined;
    reset.mockClear();
  });

  it("opens the existing plan in edit mode instead of resetting its structured draft", async () => {
    params.planId = "22222222-2222-4222-8222-222222222222";
    const CreateActivityPlan = (await import("../create-activity-plan")).default;

    renderNative(<CreateActivityPlan />);

    expect(screen.getByTestId("composer").props).toMatchObject({
      mode: "edit",
      planId: params.planId,
    });
    expect(reset).not.toHaveBeenCalled();
  });
});
