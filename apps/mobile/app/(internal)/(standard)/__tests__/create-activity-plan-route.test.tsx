import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resetMock, paramsRef } = vi.hoisted(() => ({
  resetMock: vi.fn(),
  paramsRef: { planId: undefined as string | undefined },
}));

(globalThis as any).React = React;

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => paramsRef,
}));

vi.mock("@/lib/stores/activityPlanCreation", () => ({
  useActivityPlanCreationStore: (selector: any) =>
    selector({
      reset: resetMock,
    }),
}));

vi.mock("@/components/activity-plan/ActivityPlanComposerScreen", () => ({
  ActivityPlanComposerScreen: (props: any) =>
    React.createElement("ActivityPlanComposerScreen", props),
}));

describe("create-activity-plan route", () => {
  beforeEach(() => {
    paramsRef.planId = undefined;
    resetMock.mockClear();
  });

  it("uses the same composer in create mode and resets draft state", async () => {
    const CreateActivityPlanRoute = (await import("../create-activity-plan"))
      .default;

    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CreateActivityPlanRoute />);
    });

    const composer = renderer.root.find(
      (node: any) => node.type === "ActivityPlanComposerScreen",
    );

    expect(composer.props).toMatchObject({ mode: "create" });
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("uses the same composer in edit mode when planId exists", async () => {
    const CreateActivityPlanRoute = (await import("../create-activity-plan"))
      .default;

    paramsRef.planId = "plan-42";

    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CreateActivityPlanRoute />);
    });

    const composer = renderer.root.find(
      (node: any) => node.type === "ActivityPlanComposerScreen",
    );

    expect(composer.props).toMatchObject({ mode: "edit", planId: "plan-42" });
    expect(resetMock).not.toHaveBeenCalled();
  });
});
