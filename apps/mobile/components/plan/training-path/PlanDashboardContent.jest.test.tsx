import React from "react";
import { createHost } from "../../../test/mock-components";
import { renderNative } from "../../../test/render-native";

const mockGetGoalProgress = jest.fn();
const mockGetGoalPortfolio = jest.fn();
const mockRenderOrder: string[] = [];
const captureProductAnalytics = jest.fn();
let mockGoalTrajectoryProps: {
  coherenceLabel?: string | null;
  selectedGoal?: { id: string } | null;
} | null = null;
let mockTimelineProps: {
  goalMarkers?: Array<{ id: string }>;
  onGoalPress?: (goalId: string) => void;
  primaryGoalId?: string | null;
} | null = null;

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("@/lib/api", () => ({
  api: {
    athleteIntelligence: {
      getGoalAssessment: {
        useQuery: () => ({
          data: {
            assessment: { assessmentConfidence: 0.8, readiness: 72, status: "ready" },
            computedAt: "2026-04-15T12:00:00.000Z",
            freshness: "fresh",
            stateRevision: 4,
          },
          isLoading: false,
        }),
      },
      getGoalProgress: { useQuery: (...args: unknown[]) => mockGetGoalProgress(...args) },
      getGoalPortfolio: { useQuery: (...args: unknown[]) => mockGetGoalPortfolio(...args) },
      getThresholdOverview: {
        useQuery: () => ({ data: { history: { items: [] } }, isError: false, isLoading: false }),
      },
    },
  },
}));
jest.mock("@/lib/analytics/productAnalytics", () => ({
  useProductAnalytics: () => ({ capture: captureProductAnalytics }),
}));
jest.mock("./PlanGoalTrajectory", () => ({
  PlanGoalTrajectory: (props: {
    coherenceLabel?: string | null;
    selectedGoal?: { id: string } | null;
  }) => {
    mockRenderOrder.push("goal");
    mockGoalTrajectoryProps = props;
    return React.createElement("View", { testID: "goal" });
  },
}));
jest.mock("./PlanUnifiedTrendDashboard", () => ({
  PlanUnifiedTrendDashboard: (props: {
    goalMarkers?: Array<{ id: string }>;
    onGoalPress?: (goalId: string) => void;
    primaryGoalId?: string | null;
  }) => {
    mockRenderOrder.push("charts");
    mockTimelineProps = props;
    return React.createElement("View", { testID: "charts" });
  },
}));

const { PlanDashboardContent } = require("./PlanDashboardContent");

beforeEach(() => {
  mockRenderOrder.length = 0;
  mockGoalTrajectoryProps = null;
  mockTimelineProps = null;
  mockGetGoalProgress.mockReturnValue({
    data: {
      publication: {
        computedAt: "2026-04-15T12:00:00.000Z",
        publishedRevision: 4,
        status: "available",
      },
      result: {
        goalId: "55555555-5555-4555-8555-555555555555",
        reason: "non_threshold_goal",
        status: "unsupported",
      },
    },
    isError: false,
    isLoading: false,
  });
  mockGetGoalPortfolio.mockReturnValue({
    data: {
      activeGoalCount: 1,
      computedAt: "2026-04-15T12:00:00.000Z",
      freshness: "fresh",
      planningDate: "2026-04-15",
      publishedRevision: 4,
      selectedGoal: {
        activityCategory: "run",
        id: "66666666-6666-4666-8666-666666666666",
        priority: 3,
        targetDate: "2026-05-15",
        title: "Spring 5K",
      },
      totalGoalCount: 2,
    },
    isError: false,
    isLoading: false,
  });
});

it("selects the active portfolio goal when a higher-priority marker has expired", async () => {
  const onOpenGoal = jest.fn();
  await renderNative(
    <PlanDashboardContent
      data={
        {
          dailyTrainingPathPoints: [
            { date: "2026-04-15", effectiveCompletedLoad: 30, plannedLoad: 40 },
          ],
          goalMarkers: [
            {
              activityCategory: "bike",
              id: "55555555-5555-4555-8555-555555555555",
              label: "Expired FTP",
              priority: 9,
              targetDate: "2026-04-14",
            },
            {
              activityCategory: "run",
              id: "66666666-6666-4666-8666-666666666666",
              label: "Spring 5K",
              priority: 3,
              targetDate: "2026-05-15",
            },
          ],
          handleSelectedDateChange: jest.fn(),
          selectedDate: "2026-04-15",
          trainingPath: { todayKey: "2026-04-15" },
          timelineDaysByDate: {},
        } as never
      }
      onCreateGoal={jest.fn()}
      onOpenGoal={onOpenGoal}
      onOpenGoals={jest.fn()}
      onOpenSourceActivity={jest.fn()}
      onViewDetails={jest.fn()}
    />,
  );

  expect(mockGetGoalProgress).toHaveBeenCalledWith(
    { goalId: "66666666-6666-4666-8666-666666666666" },
    { enabled: true },
  );
  expect(mockRenderOrder).toEqual(["goal", "charts"]);
  expect(mockGoalTrajectoryProps?.selectedGoal?.id).toBe("66666666-6666-4666-8666-666666666666");
  expect(mockTimelineProps?.primaryGoalId).toBe("66666666-6666-4666-8666-666666666666");
  expect(mockTimelineProps?.goalMarkers?.map((goal) => goal.id)).toEqual([
    "55555555-5555-4555-8555-555555555555",
    "66666666-6666-4666-8666-666666666666",
  ]);
  mockTimelineProps?.onGoalPress?.("66666666-6666-4666-8666-666666666666");
  expect(onOpenGoal).toHaveBeenCalledWith("66666666-6666-4666-8666-666666666666");
  expect(mockGoalTrajectoryProps?.selectedGoal?.id).toBe("66666666-6666-4666-8666-666666666666");
  expect(mockGoalTrajectoryProps?.coherenceLabel).toContain("computed 2026-04-15T12:00:00.000Z");
  expect(mockGoalTrajectoryProps?.coherenceLabel).not.toMatch(/^null\./);
});
