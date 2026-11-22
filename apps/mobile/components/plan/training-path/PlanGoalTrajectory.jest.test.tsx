import { fireEvent } from "@testing-library/react-native";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));

const { PlanGoalTrajectory } = require("./PlanGoalTrajectory");

it("renders a trajectory-first priority summary with matching decision accessibility", async () => {
  const onOpenGoal = jest.fn();
  const onOpenGoals = jest.fn();
  await renderNative(
    <PlanGoalTrajectory
      onOpenGoal={onOpenGoal}
      onOpenGoals={onOpenGoals}
      onCreateGoal={jest.fn()}
      markersTruncated
      portfolioError={false}
      portfolioLoading={false}
      progress={{
        assessedAt: "2026-04-15T12:00:00.000Z",
        baseline: null,
        current: {
          activityCategory: "bike",
          confidence: 0.82,
          effectiveAt: "2026-04-10T12:00:00.000Z",
          freshness: "fresh",
          metric: "power",
          sourceActivityIds: ["activity-1"],
          thresholdId: "threshold-1",
          unit: "watts",
          value: 240,
        },
        deadlineAt: "2026-11-15T23:59:59.000Z",
        evidence: { observationCount: 3, observedSpanDays: 90 },
        goalId: "goal-1",
        metrics: {
          changeFromBaseline: 20,
          observedRatePerDay: 0.2,
          progressPercent: 67,
          progressRatio: 0.67,
          remainingGap: 10,
          requiredRatePerDay: 0.05,
          targetGap: 30,
        },
        reason: "observed_rate_meets_required_rate",
        status: "on_track",
        target: {
          achievementValue: 250,
          activityCategory: "bike",
          metric: "power",
          targetValue: 250,
          unit: "watts",
        },
      }}
      progressError={false}
      progressLoading={false}
      selectedGoal={{
        activityCategory: "bike",
        id: "goal-1",
        priority: 9,
        targetDate: "2026-11-15",
        title: "250 W FTP",
      }}
      totalGoalCount={2}
    />,
  );

  expect(screen.getByText("250 W FTP")).toBeTruthy();
  expect(screen.getByText("Priority active goal")).toBeTruthy();
  expect(screen.getByText("Target date: 2026-11-15")).toBeTruthy();
  expect(screen.getByText("On track for the selected goal")).toBeTruthy();
  expect(screen.getByText("Readiness: unavailable")).toBeTruthy();
  expect(
    screen.getByText("Continue the planned progression and reassess after key sessions."),
  ).toBeTruthy();
  expect(
    screen.getByLabelText(
      /Priority active goal 250 W FTP\. Target date 2026-11-15\. On track for the selected goal\. Readiness unavailable\./,
    ),
  ).toBeTruthy();
  expect(screen.getByText("More goals exist. Open Goals to view the full list.")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("plan-selected-goal"));
  await fireEvent.press(screen.getByTestId("plan-view-goals"));
  expect(onOpenGoal).toHaveBeenCalledWith("goal-1");
  expect(onOpenGoals).toHaveBeenCalledTimes(1);
});

it.each([
  ["loading", true, false, "Goal portfolio loading"],
  ["error", false, true, "Goal portfolio unavailable"],
] as const)("announces portfolio %s state and keeps the Goals destination available", async (_state, portfolioLoading, portfolioError, label) => {
  const onOpenGoals = jest.fn();
  await renderNative(
    <PlanGoalTrajectory
      coherenceLabel={null}
      onCreateGoal={jest.fn()}
      onOpenGoal={jest.fn()}
      onOpenGoals={onOpenGoals}
      portfolioError={portfolioError}
      portfolioLoading={portfolioLoading}
      progress={null}
      progressError={false}
      progressLoading={false}
      selectedGoal={null}
      totalGoalCount={null}
    />,
  );

  expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByTestId("plan-view-goals"));
  expect(onOpenGoals).toHaveBeenCalledTimes(1);
});

it("only exposes Add for a confirmed empty portfolio", async () => {
  const onCreateGoal = jest.fn();
  await renderNative(
    <PlanGoalTrajectory
      coherenceLabel={null}
      onCreateGoal={onCreateGoal}
      onOpenGoal={jest.fn()}
      onOpenGoals={jest.fn()}
      portfolioError={false}
      portfolioLoading={false}
      progress={null}
      progressError={false}
      progressLoading={false}
      selectedGoal={null}
      totalGoalCount={0}
    />,
  );

  expect(screen.getByText("Add")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("plan-view-goals"));
  expect(onCreateGoal).toHaveBeenCalledTimes(1);
});

it("shows readiness as checking while the assessment is loading", async () => {
  await renderNative(
    <PlanGoalTrajectory
      coherenceLabel={null}
      onCreateGoal={jest.fn()}
      onOpenGoal={jest.fn()}
      onOpenGoals={jest.fn()}
      portfolioError={false}
      portfolioLoading={false}
      progress={null}
      progressError={false}
      progressLoading
      readinessLoading
      selectedGoal={{
        activityCategory: "run",
        id: "goal-1",
        priority: 1,
        targetDate: "2026-11-15",
        title: "Run goal",
      }}
      totalGoalCount={1}
    />,
  );

  expect(screen.getByText("Readiness: checking")).toBeTruthy();
  expect(screen.queryByText("Readiness: unavailable")).toBeNull();
});
