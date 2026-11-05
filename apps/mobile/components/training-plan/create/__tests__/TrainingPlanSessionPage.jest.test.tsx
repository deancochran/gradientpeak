import { useState } from "react";
import type { TrainingPlanBuilderSession } from "@/lib/training-plan-creation/types";
import { createActivityPlanSummary } from "../../../../test/activity-plan-projection-fixture";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import { TrainingPlanSessionPage } from "../TrainingPlanSessionPage";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const plan = createActivityPlanSummary({ name: "Easy run" });
const session: TrainingPlanBuilderSession = {
  id: "11111111-1111-4111-8111-111111111111",
  localId: "11111111-1111-4111-8111-111111111111",
  offsetDays: 0,
  activityPlan: {
    id: plan.id,
    name: plan.name,
    accessible: true,
    published: true,
    prescriptionQuantification: null,
  },
  demand: {
    activity_category: "run",
    training_intent: "aerobic_base",
    importance: "normal",
    target_duration_minutes: 45,
    target_common_load: 30,
  },
};

describe("TrainingPlanSessionPage", () => {
  it("keeps the server exclusion reason visible when inspecting an unresolved session", async () => {
    await renderNative(
      <TrainingPlanSessionPage
        session={session}
        activityPlan={plan}
        projectionMetrics={[]}
        forecastExplanation="The selected activity does not match this session's training intent."
        onChange={jest.fn()}
        onChangeActivity={jest.fn()}
      />,
    );
    expect(screen.getByTestId("session-forecast-explanation").props.children).toBe(
      "The selected activity does not match this session's training intent.",
    );
    expect(screen.queryByText("Estimates aren’t available for this activity yet.")).toBeNull();
    expect(screen.queryByTestId("activity-plan-load-explanation")).toBeNull();
  });
  it("shows the current viewer intensity and load instead of the generic summary", async () => {
    await renderNative(
      <TrainingPlanSessionPage
        session={session}
        activityPlan={plan}
        onChange={jest.fn()}
        onChangeActivity={jest.fn()}
        projectionMetrics={[
          {
            key: "common_load",
            label: "Common Load",
            status: "available",
            value: 64,
            unit: "score",
            reason: null,
            provenance: "estimated",
          },
          {
            key: "objective_intensity",
            label: "Intensity",
            status: "available",
            value: 0.8,
            unit: "ratio",
            reason: null,
            provenance: "estimated",
          },
        ]}
      />,
    );
    expect(screen.getByText("~64")).toBeTruthy();
    expect(screen.getByText("~0.80")).toBeTruthy();
  });
  it("shows only canonical available estimates and never rewrites session demand", async () => {
    const onChange = jest.fn();
    const withDuration = createActivityPlanSummary({
      ...plan,
      metrics: [
        {
          key: "elapsed_duration",
          label: "Duration",
          status: "available",
          value: 1800,
          unit: "seconds",
          reason: null,
          provenance: "authored",
        },
      ],
    });
    await renderNative(
      <TrainingPlanSessionPage
        session={session}
        activityPlan={withDuration}
        onChange={onChange}
        onChangeActivity={jest.fn()}
      />,
    );
    expect(screen.getByText("30m")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-load-explanation")).toBeTruthy();
    expect(screen.queryByLabelText("Planned duration")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Day 7"));
    expect(onChange).toHaveBeenLastCalledWith({ ...session, offsetDays: 6 });
    expect(screen.getByLabelText("Previous week").props.accessibilityState.disabled).toBe(true);
  });

  it("keeps unknown estimates explicit and retains saved overrides while rescheduling", async () => {
    const onChange = jest.fn();
    const existing = { ...session, eventOverrides: { title: "Saved title", start_time: "08:30" } };
    await renderNative(
      <TrainingPlanSessionPage
        session={existing}
        activityPlan={plan}
        onChange={onChange}
        onChangeActivity={jest.fn()}
      />,
    );
    expect(screen.getByText("Estimates aren’t available for this activity yet.")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-estimates")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-load-explanation")).toBeTruthy();
    expect(screen.getByLabelText("Custom title").props.value).toBe("Saved title");
    await fireEvent.press(screen.getByLabelText("Next week"));
    expect(onChange).toHaveBeenLastCalledWith({ ...existing, offsetDays: 7 });
  });

  it("makes a custom title optional and reversible without duplicating activity identity", async () => {
    function Harness() {
      const [draft, setDraft] = useState(session);
      return (
        <TrainingPlanSessionPage
          session={draft}
          activityPlan={plan}
          onChange={setDraft}
          onChangeActivity={jest.fn()}
        />
      );
    }
    await renderNative(<Harness />);
    expect(screen.getAllByText("Easy run")).toHaveLength(1);
    expect(screen.queryByLabelText("Custom title")).toBeNull();
    await fireEvent.press(screen.getByText("Optional details"));
    await fireEvent.changeText(screen.getByLabelText("Custom title"), "Personal label");
    expect(screen.getByLabelText("Custom title").props.value).toBe("Personal label");
    await fireEvent.changeText(screen.getByLabelText("Custom title"), "");
    expect(screen.getByLabelText("Custom title").props.value).toBe("");
  });
});
