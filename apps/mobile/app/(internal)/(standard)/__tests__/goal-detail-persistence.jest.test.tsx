import React from "react";

import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { act, fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const navigateMock = jest.fn();
const goalUseQueryMock = jest.fn();
const assessmentUseQueryMock = jest.fn(
  (): Record<string, unknown> => ({
    data: undefined,
    isLoading: false,
    refetch: jest.fn(async () => undefined),
  }),
);
const progressUseQueryMock = jest.fn();
const thresholdUseQueryMock = jest.fn();
const mockRecordedMount = jest.fn();
const mockScaffoldProps = jest.fn();
const mockProgressInsightProps = jest.fn();
let mergedStackOptions: NonNullable<StackScreenProps["options"]> = {};
let mockGoalObjective: Record<string, unknown> = {};
let mockGoalId = "goal-1";
let mockAuthProfile: { id: string; planning_timezone: string } | null = {
  id: "22222222-2222-4222-8222-222222222222",
  planning_timezone: "America/Los_Angeles",
};
const originalDateTimeFormat = Intl.DateTimeFormat;

type StackScreenProps = {
  options?: { headerRight?: () => React.ReactNode };
  [key: string]: unknown;
};

type GoalDraft = {
  activityCategory?: string;
  importance?: number;
  targetDate?: string;
  title?: string;
};

type GoalReadinessPoint = {
  date: string;
  state_readiness?: number;
};

type GoalReadinessTrajectoryArgs = {
  points: GoalReadinessPoint[];
  currentGoalReadiness?: number | null;
};

type ReadinessViewModelArgs = {
  value: number | null;
};

type HostProps = {
  children?: React.ReactNode;
  [key: string]: unknown;
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: mockCreateHost("ActivityIndicator"),
  Alert: { alert: jest.fn() },
  ScrollView: mockCreateHost("ScrollView"),
  View: mockCreateHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: StackScreenProps) => {
      mergedStackOptions = { ...mergedStackOptions, ...props.options };
      return React.createElement(
        "StackScreen",
        props,
        typeof mergedStackOptions.headerRight === "function"
          ? mergedStackOptions.headerRight()
          : null,
      );
    },
  },
  useLocalSearchParams: () => ({ id: mockGoalId }),
  useRouter: () => ({ back: jest.fn(), navigate: navigateMock }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  createEmptyGoalDraft: jest.fn(() => ({ title: "", objective: null })),
  buildGoalDraftFromGoal: jest.fn(() => ({ title: "Spring 5K" })),
  parseProfileGoalRecord: jest.fn((goal: Record<string, unknown>) => ({
    ...goal,
    objective: goal.target_payload,
  })),
  buildGoalUpdatePayload: jest.fn(({ draft }: { draft: GoalDraft }) => ({
    target_date: draft.targetDate,
    title: draft.title,
    priority: draft.importance,
    activity_category: draft.activityCategory,
    target_payload: {
      type: "event_performance",
      target_time_s: 1450,
      distance_m: 5000,
    },
  })),
  buildGoalIntelligence: jest.fn(() => ({
    goalId: "goal-1",
    status: "uncertain",
    readinessScore: null,
    projectedOutcome: {
      type: "completion",
      value: null,
      unit: "unknown",
      displayValue: "Projection unavailable",
    },
    targetOutcome: {
      value: 1500,
      unit: "seconds",
      displayValue: "25:00",
    },
    summary:
      "More training data is needed before Spring 5K can produce a reliable performance projection.",
    explanation:
      "Goal intelligence needs completed training, readiness, or forecast inputs before it can estimate a reliable outcome.",
    keyDrivers: [
      {
        metric: "goal_target",
        direction: "neutral",
        label: "Goal time",
        description: "25:00 is the target this projection is measured against.",
        impact: "medium",
      },
    ],
    updatedAt: "2026-05-01T00:00:00.000Z",
  })),
  buildGoalReadinessTrajectory: jest.fn(
    ({ points, currentGoalReadiness }: GoalReadinessTrajectoryArgs) =>
      points.map((point, index) => ({
        date: point.date,
        goal_readiness:
          index === points.length - 1 ? 100 : (currentGoalReadiness ?? point.state_readiness),
        low: 88,
        high: 100,
      })),
  ),
  resolveGoalReadinessTarget: jest.fn(() => 100),
  resolveGoalReadinessViewModel: jest.fn(({ value }: ReadinessViewModelArgs) => ({
    value,
    target: 100,
    band: "building_toward_target",
    label: "Building toward target",
  })),
  formatGoalTypeLabel: jest.fn(() => "Race"),
  buildCenteredPlanAnalysisWindow: jest.fn(() => ({
    endDate: "2026-08-15",
    startDate: "2026-02-15",
  })),
  getGoalDistanceBadge: jest.fn(() => null),
  getGoalMetricSummary: jest.fn(() => null),
  getGoalObjectiveSummary: jest.fn(() => "5K target"),
  getManualBaselineLongTermLoadWarning: jest.fn((value: number | null | undefined) =>
    typeof value === "number" && value > 120
      ? "Manual Fitness above 120 is very high and can make estimated readiness look flat or inflated without completed activity history."
      : null,
  ),
  getProfileGoalLifecycleStatus: jest.fn(() => ({
    status: "in_progress",
    label: "In progress",
    message: "This goal is active in your planning window.",
    missing: [],
    canGuidePlan: true,
  })),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
  CardTitle: mockCreateHost("CardTitle"),
}));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: mockCreateHost("DropdownMenu"),
  DropdownMenuContent: mockCreateHost("DropdownMenuContent"),
  DropdownMenuItem: mockCreateHost("DropdownMenuItem"),
  DropdownMenuTrigger: mockCreateHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: mockCreateHost("Svg"),
  Circle: mockCreateHost("Circle"),
}));

jest.mock("@/components/charts/PlanReadinessComparisonChart", () => ({
  __esModule: true,
  PlanReadinessComparisonChart: (props: HostProps) =>
    React.createElement("PlanReadinessComparisonChart", props, props.children),
}));
jest.mock("@/components/plan/insights/PlanProgressInsight", () => ({
  __esModule: true,
  formatGoalTimeLeft: () => "47 days left",
  PlanProgressInsight: (props: HostProps) => {
    mockProgressInsightProps(props);
    return React.createElement("PlanProgressInsight", props);
  },
}));
jest.mock("@repo/api/client", () => ({
  selectPublishedGoalProgressHistory: jest.requireActual("@repo/api/goal-progress-client")
    .selectPublishedGoalProgressHistory,
}));
jest.mock("@/components/plan/training-path/planDashboardPresentation", () => ({
  __esModule: true,
  buildComparableThresholdTrend: jest.fn(() => null),
  buildGoalTrajectoryAnswer: jest.fn(() => ({
    body: "Evidence is unavailable.",
    headline: "Trajectory unavailable",
  })),
  mergeGoalProgressThresholdEvidence: jest.fn(() => []),
}));
jest.mock("@/components/goals/RecordedGoalHistory", () => ({
  RecordedGoalHistory: (props: HostProps) => {
    React.useEffect(() => {
      mockRecordedMount();
    }, []);
    return React.createElement(mockCreateHost("RecordedGoalHistory"), {
      ...props,
      testID: "recorded-goal-history",
    });
  },
}));
jest.mock("@/components/goals/GoalIntelligenceCard", () => ({
  GoalIntelligenceCard: (props: HostProps) =>
    React.createElement(mockCreateHost("GoalIntelligenceCard"), props),
}));
jest.mock("@/components/shared/detail", () => {
  const actual = jest.requireActual("@/components/shared/detail");
  return {
    ...actual,
    DetailScaffold: (props: HostProps) => {
      mockScaffoldProps(props);
      return React.createElement(actual.DetailScaffold, props);
    },
  };
});
jest.mock("@/components/plan/training-path/trainingPathPlanningTime", () => ({
  getTrainingPathTodayKey: () => "2026-04-15",
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));
jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: mockAuthProfile }),
}));

jest.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  __esModule: true,
  useTrainingPlanSnapshot: () => ({
    insightTimeline: {
      projection_dashboard: {
        goal_forecasts: [
          {
            profile_goal_id: "goal-1",
            readiness_score: 72,
          },
        ],
      },
      readiness_forecast: {
        current_readiness: 68,
        confidence_reason_codes: ["missing_recent_history", "projection_fallback_baseline"],
        series: {
          actual: { points: [{ date: "2026-05-15", readiness: 68 }] },
          scheduled: { points: [{ date: "2026-06-01", readiness: 70 }] },
          recommended: { points: [{ date: "2026-06-01", readiness: 74 }] },
        },
      },
    },
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  getSafeApiErrorDiagnostic: (
    error: { name?: string; data?: { code?: string; httpStatus?: number } } | undefined,
  ) => ({
    applicationErrorCode: null,
    errorClass: error?.name === "TRPCClientError" ? "TRPCClientError" : "UnknownError",
    httpStatus: error?.data?.httpStatus ?? null,
    trpcCode: error?.data?.code ?? null,
  }),
  isTrustedNonJson503TransportError: (error: { trustedNonJson503?: boolean } | undefined) =>
    error?.trustedNonJson503 === true,
  api: {
    useUtils: () => ({
      goals: { list: { invalidate: jest.fn() }, getById: { invalidate: jest.fn() } },
    }),
    goals: {
      getById: {
        useQuery: () => goalUseQueryMock(),
      },
      delete: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
    },
    trainingPlans: {
      getPlanTabProjection: {
        useQuery: () => ({ data: { currentScheduledPlan: { id: "plan-1" } } }),
      },
    },
    athleteIntelligence: {
      getGoalAssessment: { useQuery: assessmentUseQueryMock },
      getGoalProgress: { useQuery: progressUseQueryMock },
      getThresholdOverview: {
        useQuery: thresholdUseQueryMock,
      },
    },
  },
}));

const GoalDetailScreen = require("../goal-detail").default;

describe("goal detail persistence", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mockGoalId = "goal-1";
    mergedStackOptions = {};
    mockAuthProfile = {
      id: "22222222-2222-4222-8222-222222222222",
      planning_timezone: "America/Los_Angeles",
    };
    mockGoalObjective = { type: "threshold", metric: "pace", value: 4, activity_category: "run" };
    goalUseQueryMock.mockImplementation(() => ({
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      isError: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    }));
    assessmentUseQueryMock.mockClear();
    progressUseQueryMock.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });
    thresholdUseQueryMock.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });
    mockRecordedMount.mockClear();
    mockScaffoldProps.mockClear();
    mockProgressInsightProps.mockClear();
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      value: function DateTimeFormat() {
        return {
          format: () => "",
          resolvedOptions: () => ({ timeZone: "America/Los_Angeles" }),
        };
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      value: originalDateTimeFormat,
    });
    jest.restoreAllMocks();
  });

  it("routes editing through the dedicated goal edit screen", async () => {
    await renderNative(<GoalDetailScreen />);

    await fireEvent.press(screen.getByTestId("goal-detail-options-trigger"));
    await fireEvent.press(screen.getByTestId("goal-detail-options-edit"));

    expect(navigateMock).toHaveBeenCalledWith("/goal-edit?id=goal-1");
  });

  it("queries the canonical goal assessment", async () => {
    await renderNative(<GoalDetailScreen />);

    expect(assessmentUseQueryMock).toHaveBeenLastCalledWith(
      { goalId: "goal-1" },
      { enabled: true },
    );
  });

  it("hands the athlete planning day to Advanced analysis", async () => {
    progressUseQueryMock.mockReturnValue({
      data: {
        result: {
          status: "insufficient",
          target: { activityCategory: "bike", metric: "power", unit: "watts" },
          deadlineAt: "2026-06-01T00:00:00Z",
        },
      },
      isLoading: false,
      isError: false,
    });
    await renderNative(<GoalDetailScreen />);

    await fireEvent.press(screen.getByTestId("goal-detail-analyze"));

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ anchorDate: "2026-04-15" }) }),
    );
  });

  it("does not claim aligned revisions when evidence publications are unavailable", async () => {
    await renderNative(<GoalDetailScreen />);

    expect(screen.queryByText(/Signals aligned at revision/)).toBeNull();
    expect(screen.getByText(/Some signals are stale or unavailable/)).toBeTruthy();
  });

  it("does not render legacy readiness or outcome forecast claims", async () => {
    await renderNative(<GoalDetailScreen />);

    expect(screen.queryByText(/forecast/i)).toBeNull();
    expect(screen.queryByText(/completion likelihood|finish prediction|medical|risk/i)).toBeNull();
    expect(screen.queryByText("72%")).toBeNull();
    expect(screen.queryByText(/\b(?:[0-9]|[1-9][0-9]|100)\s*\/\s*100\b/)).toBeNull();
    expect(
      screen.queryByText(
        /What influences your assessment|Your approach|Next step|Evidence and assumptions/,
      ),
    ).toBeNull();
  });

  it("shows an unsupported state rather than another activity category's threshold history", async () => {
    mockGoalObjective = { type: "threshold", metric: "hr", value: 170 };
    const presentation = require("@/components/plan/training-path/planDashboardPresentation");
    presentation.buildComparableThresholdTrend.mockClear();
    progressUseQueryMock.mockReturnValue({
      data: { result: { status: "unsupported", reason: "non_threshold_goal" } },
      isLoading: false,
      isError: false,
    });
    await renderNative(<GoalDetailScreen />);
    expect(screen.getByText("Progress charts are not available for this goal type.")).toBeTruthy();
    const {
      buildComparableThresholdTrend,
    } = require("@/components/plan/training-path/planDashboardPresentation");
    expect(buildComparableThresholdTrend).not.toHaveBeenCalled();
    expect(screen.queryByTestId("goal-detail-analyze")).toBeNull();
  });

  it.each([
    { type: "event_performance", activity_category: "run", distance_m: 5000, target_time_s: 1500 },
    { type: "completion", distance_m: 10000, duration_s: 3600 },
    { type: "consistency", target_sessions_per_week: 3, target_weeks: 8 },
  ])("routes $type goals to recorded history with the athlete timezone", async (objective) => {
    mockGoalObjective = objective;
    await renderNative(<GoalDetailScreen />);
    const history = screen.getByTestId("recorded-goal-history");
    expect(history.props.goal.objective).toEqual(objective);
    expect(history.props.timezone).toBe("America/Los_Angeles");
    expect(screen.queryByTestId("goal-detail-progress")).toBeNull();
  });

  it("refreshes the recorded-history window on pull to refresh", async () => {
    mockGoalObjective = { type: "consistency", target_sessions_per_week: 3 };
    await renderNative(<GoalDetailScreen />);
    expect(mockRecordedMount).toHaveBeenCalledTimes(1);
    // The host ScrollView fixture does not mount its native refresh-control prop.
    await act(async () => {
      mockScaffoldProps.mock.calls.at(-1)?.[0].refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(mockRecordedMount).toHaveBeenCalledTimes(2));
  });

  it("distinguishes loading and failed progress", async () => {
    progressUseQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const view = await renderNative(<GoalDetailScreen />);
    expect(screen.getByText("Loading threshold evidence…")).toBeTruthy();
    progressUseQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    await view.rerender(<GoalDetailScreen />);
    expect(screen.getByText("Goal progress could not be loaded.")).toBeTruthy();
    expect(screen.getByText("Retry progress")).toBeTruthy();
  });

  it("keeps a cached progress snapshot visible and retries after refresh failure", async () => {
    const retry = jest.fn(async () => undefined);
    progressUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: 4 },
        result: {
          status: "current",
          target: { activityCategory: "bike", metric: "power", unit: "watts" },
          deadlineAt: "2026-06-01T00:00:00Z",
          current: { value: 285, unit: "watts" },
        },
      },
      isError: true,
      isLoading: false,
      refetch: retry,
    });

    await renderNative(<GoalDetailScreen />);

    expect(screen.getByTestId("goal-detail-progress-refresh-warning")).toBeTruthy();
    expect(
      screen.getByText("Could not refresh goal progress. Showing the last available progress."),
    ).toBeTruthy();
    expect(mockProgressInsightProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        progress: expect.objectContaining({ current: { value: 285, unit: "watts" } }),
      }),
    );
    await fireEvent.press(screen.getByText("Retry progress"));
    expect(retry).toHaveBeenCalled();
  });

  it("keeps the same actor's cached goal context through a transient full refresh failure", async () => {
    const goalRefetch = jest.fn(async () => undefined);
    const assessmentRefetch = jest.fn(async () => undefined);
    const progressRefetch = jest.fn(async () => undefined);
    const thresholdRefetch = jest.fn(async () => undefined);
    const transientFailure = {
      name: "TRPCClientError",
      data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 },
    };
    goalUseQueryMock.mockReturnValue({
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      error: transientFailure,
      isError: true,
      isLoading: false,
      refetch: goalRefetch,
    });
    assessmentUseQueryMock.mockReturnValue({
      data: { freshness: "fresh", stateRevision: 4 },
      error: transientFailure,
      isError: true,
      isLoading: false,
      refetch: assessmentRefetch,
    });
    progressUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: 4, status: "available" },
        result: {
          status: "current",
          target: { activityCategory: "bike", metric: "power", unit: "watts" },
          deadlineAt: "2026-06-01T00:00:00Z",
          current: { value: 285, unit: "watts" },
        },
      },
      error: transientFailure,
      isError: true,
      isLoading: false,
      refetch: progressRefetch,
    });
    thresholdUseQueryMock.mockReturnValue({
      data: {
        history: { items: [], nextCursor: null },
        publication: { publishedRevision: 4, status: "available" },
      },
      error: transientFailure,
      isError: true,
      isLoading: false,
      refetch: thresholdRefetch,
    });

    await renderNative(<GoalDetailScreen />);

    expect(screen.getByTestId("goal-detail-goal-refresh-warning")).toBeTruthy();
    expect(screen.getByTestId("goal-detail-progress-refresh-warning")).toBeTruthy();
    expect(screen.queryByText("Goal could not be loaded")).toBeNull();
    await fireEvent.press(screen.getByText("Retry progress"));
    expect(goalRefetch).toHaveBeenCalledTimes(1);
    expect(assessmentRefetch).toHaveBeenCalledTimes(1);
    expect(progressRefetch).toHaveBeenCalledTimes(1);
    expect(thresholdRefetch).toHaveBeenCalledTimes(1);
  });

  it("keeps authorized cached goal context for the trusted non-JSON transport 503 marker", async () => {
    goalUseQueryMock.mockReturnValue({
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      error: { name: "TRPCClientError", trustedNonJson503: true },
      isError: true,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });

    await renderNative(<GoalDetailScreen />);

    expect(screen.getByTestId("goal-detail-goal-refresh-warning")).toBeTruthy();
    expect(screen.queryByText("Goal could not be loaded")).toBeNull();
  });

  it("clears cached refresh warnings after Retry refreshes all four goal queries", async () => {
    let failed = true;
    const retryAll = jest.fn(async () => {
      failed = false;
    });
    const transientFailure = {
      name: "TRPCClientError",
      data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 },
    };
    goalUseQueryMock.mockImplementation(() => ({
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      error: failed ? transientFailure : undefined,
      isError: failed,
      isLoading: false,
      refetch: retryAll,
    }));
    assessmentUseQueryMock.mockImplementation(() => ({
      data: { freshness: "fresh", stateRevision: 4 },
      error: failed ? transientFailure : undefined,
      isError: failed,
      isLoading: false,
      refetch: retryAll,
    }));
    progressUseQueryMock.mockImplementation(() => ({
      data: {
        publication: { publishedRevision: 4, status: "available" },
        result: {
          status: "current",
          target: { activityCategory: "bike", metric: "power", unit: "watts" },
          deadlineAt: "2026-06-01T00:00:00Z",
          current: { value: 285, unit: "watts" },
        },
      },
      error: failed ? transientFailure : undefined,
      isError: failed,
      isLoading: false,
      refetch: retryAll,
    }));
    thresholdUseQueryMock.mockImplementation(() => ({
      data: {
        history: { items: [], nextCursor: null },
        publication: { publishedRevision: 4, status: "available" },
      },
      error: failed ? transientFailure : undefined,
      isError: failed,
      isLoading: false,
      refetch: retryAll,
    }));

    await renderNative(<GoalDetailScreen />);

    expect(screen.getByTestId("goal-detail-goal-refresh-warning")).toBeTruthy();
    await fireEvent.press(screen.getByText("Retry progress"));
    await waitFor(() => {
      expect(retryAll).toHaveBeenCalledTimes(4);
      expect(screen.queryByTestId("goal-detail-goal-refresh-warning")).toBeNull();
      expect(screen.queryByTestId("goal-detail-progress-refresh-warning")).toBeNull();
    });
  });

  it.each([
    {
      name: "denied",
      error: { name: "TRPCClientError", data: { code: "FORBIDDEN", httpStatus: 403 } },
    },
    { name: "unknown", error: { name: "Error" } },
  ])("clears merged management header actions after a ready goal becomes a $name route error", async ({
    error,
  }) => {
    const view = await renderNative(<GoalDetailScreen />);
    expect(mergedStackOptions.headerRight?.()).not.toBeNull();

    goalUseQueryMock.mockReturnValue({
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      error,
      isError: true,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });

    await view.rerender(<GoalDetailScreen />);

    expect(screen.getByText("Goal could not be loaded")).toBeTruthy();
    expect(mergedStackOptions.headerRight?.()).toBeNull();
  });

  it.each([
    {
      name: "cold transient failure without cached goal",
      data: undefined,
      error: { name: "TRPCClientError", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 } },
      profile: mockAuthProfile,
      routeId: "goal-1",
    },
    {
      name: "cached authorization denial",
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      error: { name: "TRPCClientError", data: { code: "FORBIDDEN", httpStatus: 403 } },
      profile: mockAuthProfile,
      routeId: "goal-1",
    },
    {
      name: "cached goal for a different route",
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      error: { name: "TRPCClientError", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 } },
      profile: {
        id: "22222222-2222-4222-8222-222222222222",
        planning_timezone: "America/Los_Angeles",
      },
      routeId: "other-goal",
    },
    {
      name: "cached goal for a different actor",
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      error: { name: "TRPCClientError", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 } },
      profile: {
        id: "33333333-3333-4333-8333-333333333333",
        planning_timezone: "America/Los_Angeles",
      },
      routeId: "goal-1",
    },
    {
      name: "missing authenticated profile",
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      error: { name: "TRPCClientError", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 } },
      profile: null,
      routeId: "goal-1",
    },
    {
      name: "untyped error with copied transient metadata",
      data: {
        id: "goal-1",
        profile_id: "22222222-2222-4222-8222-222222222222",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: mockGoalObjective,
      },
      error: { name: "Error", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 } },
      profile: {
        id: "22222222-2222-4222-8222-222222222222",
        planning_timezone: "America/Los_Angeles",
      },
      routeId: "goal-1",
    },
  ])("fails closed for $name", async ({ data, error, profile, routeId }) => {
    mockAuthProfile = profile;
    mockGoalId = routeId;
    goalUseQueryMock.mockReturnValue({
      data,
      error,
      isError: true,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });

    await renderNative(<GoalDetailScreen />);

    expect(screen.getByText("Goal could not be loaded")).toBeTruthy();
    expect(screen.queryByTestId("goal-detail-goal-refresh-warning")).toBeNull();
    expect(screen.queryByTestId("goal-detail-options-trigger")).toBeNull();
  });

  it.each([
    {
      progressError: false,
      historyError: true,
      warning:
        "Could not refresh threshold history. Showing retained compatible history, if available.",
    },
    {
      progressError: true,
      historyError: true,
      warning:
        "Could not refresh goal progress or threshold history. Showing the last available compatible evidence.",
    },
  ])("uses accurate cached-progress recovery copy", async ({
    progressError,
    historyError,
    warning,
  }) => {
    progressUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: 4 },
        result: {
          status: "current",
          target: { activityCategory: "bike", metric: "power", unit: "watts" },
          deadlineAt: "2026-06-01T00:00:00Z",
        },
      },
      isError: progressError,
      isLoading: false,
      refetch: jest.fn(),
    });
    thresholdUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: 4 },
        history: { items: [], nextCursor: null },
      },
      isError: historyError,
      isLoading: false,
      refetch: jest.fn(),
    });

    await renderNative(<GoalDetailScreen />);

    expect(screen.getByText(warning)).toBeTruthy();
    expect(mockProgressInsightProps).toHaveBeenCalled();
  });

  it("discloses mismatched threshold history without passing it to the trend", async () => {
    const presentation = require("@/components/plan/training-path/planDashboardPresentation");
    presentation.mergeGoalProgressThresholdEvidence.mockClear();
    progressUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: 4 },
        result: {
          status: "current",
          target: { activityCategory: "bike", metric: "power", unit: "watts" },
          deadlineAt: "2026-06-01T00:00:00Z",
        },
      },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    });
    thresholdUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: 5 },
        history: { items: [{ value: 999 }], nextCursor: null },
      },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    });

    await renderNative(<GoalDetailScreen />);

    expect(screen.getByTestId("goal-detail-history-mismatch")).toBeTruthy();
    expect(presentation.mergeGoalProgressThresholdEvidence).toHaveBeenCalledWith([], undefined);
  });

  it("does not label unknown publications as separately updated history", async () => {
    const presentation = require("@/components/plan/training-path/planDashboardPresentation");
    presentation.mergeGoalProgressThresholdEvidence.mockClear();
    progressUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: null },
        result: {
          status: "current",
          target: { activityCategory: "bike", metric: "power", unit: "watts" },
          deadlineAt: "2026-06-01T00:00:00Z",
        },
      },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    });
    thresholdUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: null },
        history: { items: [{ value: 999 }], nextCursor: null },
      },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    });

    await renderNative(<GoalDetailScreen />);

    expect(screen.queryByTestId("goal-detail-history-mismatch")).toBeNull();
    expect(presentation.mergeGoalProgressThresholdEvidence).toHaveBeenCalledWith([], undefined);
  });

  it("discloses when matching threshold history is bounded", async () => {
    const presentation = require("@/components/plan/training-path/planDashboardPresentation");
    presentation.mergeGoalProgressThresholdEvidence.mockClear();
    progressUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: 4 },
        result: {
          status: "current",
          target: { activityCategory: "bike", metric: "power", unit: "watts" },
          deadlineAt: "2026-06-01T00:00:00Z",
        },
      },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    });
    thresholdUseQueryMock.mockReturnValue({
      data: {
        publication: { publishedRevision: 4 },
        history: { items: [{ value: 275 }], nextCursor: "more-history" },
      },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    });

    await renderNative(<GoalDetailScreen />);

    expect(screen.getByTestId("goal-detail-history-limited")).toBeTruthy();
    expect(screen.queryByTestId("goal-detail-history-mismatch")).toBeNull();
    expect(presentation.mergeGoalProgressThresholdEvidence).toHaveBeenCalledWith(
      [{ value: 275 }],
      undefined,
    );
  });
});
