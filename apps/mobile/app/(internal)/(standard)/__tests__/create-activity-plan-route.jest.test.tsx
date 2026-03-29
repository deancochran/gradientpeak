import React from "react";

import { renderNative, screen } from "../../../../test/render-native";

const resetMock = jest.fn();
const paramsRef = { planId: undefined as string | undefined };

(globalThis as any).React = React;

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => paramsRef,
}));

jest.mock("@/lib/stores/activityPlanCreation", () => ({
  __esModule: true,
  useActivityPlanCreationStore: (selector: any) =>
    selector({
      reset: resetMock,
    }),
}));

jest.mock("@/components/activity-plan/ActivityPlanComposerScreen", () => ({
  __esModule: true,
  ActivityPlanComposerScreen: (props: any) =>
    React.createElement("ActivityPlanComposerScreen", {
      testID: "activity-plan-composer",
      ...props,
    }),
}));

describe("create-activity-plan route", () => {
  beforeEach(() => {
    paramsRef.planId = undefined;
    resetMock.mockClear();
  });

  it("uses the same composer in create mode and resets draft state", async () => {
    const CreateActivityPlanRoute = (await import("../create-activity-plan")).default;

    renderNative(<CreateActivityPlanRoute />);

    expect(screen.getByTestId("activity-plan-composer").props).toMatchObject({ mode: "create" });
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("uses the same composer in edit mode when planId exists", async () => {
    const CreateActivityPlanRoute = (await import("../create-activity-plan")).default;

    paramsRef.planId = "plan-42";

    renderNative(<CreateActivityPlanRoute />);

    expect(screen.getByTestId("activity-plan-composer").props).toMatchObject({
      mode: "edit",
      planId: "plan-42",
    });
    expect(resetMock).not.toHaveBeenCalled();
  });
});
