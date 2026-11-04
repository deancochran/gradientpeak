import { createEmptyGoalDraft } from "@repo/core";
import { fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import { INITIAL_ONBOARDING_DATA } from "../onboarding-data";
import type { OnboardingData } from "../types";

jest.mock("@/components/athlete-baseline", () => ({ AthleteBaselineFields: () => null }));
jest.mock("./GroupsAndPeopleStep", () => ({ GroupsAndPeopleStep: () => null }));
jest.mock("@/components/goals", () => ({
  GoalEditorForm: (props: {
    initialValue: { title: string };
    onDraftChange: (value: unknown) => void;
  }) => {
    const React = jest.requireActual("react");
    return React.createElement("GoalEditor", { ...props, testID: "goal-editor" });
  },
}));

import { GoalsPreferencesStep, SummaryStep } from ".";

function Harness({ accountIdentity = "a" }: { accountIdentity?: string }) {
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
  return (
    <GoalsPreferencesStep
      accountIdentity={accountIdentity}
      data={data}
      updateData={(updates) => setData((current) => ({ ...current, ...updates }))}
    />
  );
}

describe("optional onboarding goal drafts", () => {
  it.each([
    0, 23,
  ])("does not label a complete same-calendar-day goal as skipped at hour %s", async (hour) => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "setTimeout"] });
    jest.setSystemTime(new Date(2026, 2, 8, hour, 30));
    try {
      const data = {
        ...INITIAL_ONBOARDING_DATA,
        should_create_goal: true,
        goal_draft: {
          ...createEmptyGoalDraft(),
          title: "Same-day goal",
          targetDate: "2026-03-08",
          targetDuration: "30:00",
        },
      };
      const view = await render(<SummaryStep data={data} />);
      expect(view.getByText("Create Same-day goal")).toBeTruthy();
      expect(view.queryByText("Skip incomplete goal")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
  it("does not auto-select a goal and starts fresh after explicitly skipping the goal", async () => {
    const view = await render(<Harness />);
    expect(view.queryByTestId("goal-editor")).toBeNull();
    expect(view.getByText("Initial goal (optional)")).toBeTruthy();
    await fireEvent.press(view.getByTestId("onboarding-add-goal"));
    const draft = { ...createEmptyGoalDraft(), title: "My unfinished goal" };
    await fireEvent(view.getByTestId("goal-editor"), "draftChange", draft);
    await fireEvent.press(view.getByTestId("onboarding-skip-goal"));
    expect(view.queryByTestId("goal-editor")).toBeNull();
    await fireEvent.press(view.getByTestId("onboarding-add-goal"));
    expect(view.getByTestId("goal-editor").props.initialValue.title).toBe("");
  });
  it("keeps the current editor seed across same-account refresh and takes only the new account seed on identity change", async () => {
    const updateData = jest.fn();
    const draft = { ...createEmptyGoalDraft(), title: "Account A goal" };
    const data = { ...INITIAL_ONBOARDING_DATA, goal_draft: draft, should_create_goal: true };
    const view = await render(
      <GoalsPreferencesStep accountIdentity="a" data={data} updateData={updateData} />,
    );
    await view.rerender(
      <GoalsPreferencesStep
        accountIdentity="a"
        data={{ ...data, goal_draft: { ...draft, title: "Server refresh" } }}
        updateData={updateData}
      />,
    );
    expect(view.getByTestId("goal-editor").props.initialValue.title).toBe("Account A goal");
    await view.rerender(
      <GoalsPreferencesStep
        accountIdentity="b"
        data={{ ...data, goal_draft: { ...draft, title: "Account B goal" } }}
        updateData={updateData}
      />,
    );
    expect(view.getByTestId("goal-editor").props.initialValue.title).toBe("Account B goal");
    expect(updateData).not.toHaveBeenCalled();
  });
});
