import React from "react";

import { renderNative, screen } from "../../../../test/render-native";

const resetMock = jest.fn();
const composerRenderMock = jest.fn();
const paramsRef = {
  activityCategory: undefined as string | undefined,
  activity_category: undefined as string | undefined,
  planId: undefined as string | undefined,
};
let pathname = "/create-activity-plan";
let focused = true;
jest.mock("expo-router/react-navigation", () => ({ useIsFocused: () => focused }));

type ActivityPlanCreationState = {
  reset: () => void;
};

type ActivityPlanComposerScreenProps = {
  initialActivityCategory?: string;
  mode?: "create" | "edit";
  planId?: string;
  testID?: string;
};

(globalThis as typeof globalThis & { React: typeof React }).React = React;

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => paramsRef,
  usePathname: () => pathname,
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
    getState: () => ({ index: 0, routes: [] }),
  }),
}));

jest.mock("@/lib/stores/activityPlanCreation", () => ({
  __esModule: true,
  useActivityPlanCreationStore: <T,>(selector: (state: ActivityPlanCreationState) => T) =>
    selector({
      reset: resetMock,
    }),
}));

jest.mock("@/components/activity-plan/ActivityPlanComposerScreen", () => ({
  __esModule: true,
  ActivityPlanComposerScreen: (props: ActivityPlanComposerScreenProps) => {
    composerRenderMock(props);
    return React.createElement("ActivityPlanComposerScreen", {
      testID: "activity-plan-composer",
      ...props,
    });
  },
}));

describe("create-activity-plan route", () => {
  beforeEach(() => {
    paramsRef.planId = undefined;
    paramsRef.activityCategory = undefined;
    paramsRef.activity_category = undefined;
    pathname = "/create-activity-plan";
    focused = true;
    resetMock.mockClear();
    composerRenderMock.mockClear();
  });

  it("uses the same composer in create mode and resets draft state", async () => {
    const CreateActivityPlanRoute = (await import("../create-activity-plan")).default;

    await renderNative(<CreateActivityPlanRoute />);

    expect(screen.getByTestId("activity-plan-composer").props).toMatchObject({ mode: "create" });
    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(resetMock.mock.invocationCallOrder[0]).toBeLessThan(
      composerRenderMock.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("uses the same composer in edit mode when planId exists", async () => {
    const CreateActivityPlanRoute = (await import("../create-activity-plan")).default;

    paramsRef.planId = "plan-42";

    await renderNative(<CreateActivityPlanRoute />);

    expect(screen.getByTestId("activity-plan-composer").props).toMatchObject({
      mode: "edit",
      planId: "plan-42",
    });
    expect(resetMock).toHaveBeenCalled();
  });

  it("passes an explicit valid launch category to a new composer", async () => {
    const CreateActivityPlanRoute = (await import("../create-activity-plan")).default;
    paramsRef.activity_category = "run";

    await renderNative(<CreateActivityPlanRoute />);

    expect(screen.getByTestId("activity-plan-composer").props).toMatchObject({
      initialActivityCategory: "run",
      mode: "create",
    });
  });

  it("discards on a real route exit and resets again on return, not on an unchanged background render", async () => {
    const Route = (await import("../create-activity-plan")).default;
    const view = await renderNative(<Route />);
    const resets = resetMock.mock.calls.length;
    await view.rerender(<Route />);
    expect(resetMock).toHaveBeenCalledTimes(resets);
    focused = false;
    pathname = "/profile";
    await view.rerender(<Route />);
    expect(screen.queryByTestId("activity-plan-composer")).toBeNull();
    expect(resetMock.mock.calls.length).toBeGreaterThan(resets);
    focused = true;
    pathname = "/create-activity-plan";
    await view.rerender(<Route />);
    expect(screen.getByTestId("activity-plan-composer")).toBeTruthy();
    expect(resetMock.mock.calls.length).toBeGreaterThan(resets + 1);
  });
});
