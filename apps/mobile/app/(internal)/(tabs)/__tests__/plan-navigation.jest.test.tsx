import React from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const navigateMock = jest.fn();
const refetchActivePlanMock = jest.fn(async () => undefined);
const refetchSnapshotMock = jest.fn(async () => undefined);
const recentEventsUpdatedAtRef = { current: 1 };
const upcomingEventsUpdatedAtRef = { current: 1 };
const goalsUpdatedAtRef = { current: 1 };
const activePlanQueryOptionsRef = { current: null as any };
const eventQueryOptionsRef = { current: [] as any[] };
let mockDetailDateRange: "7d" | "30d" | "90d" | "all" = "90d";
let mockNewUserNoActivities = false;
const readinessChartPropsMock = jest.fn();
const projectionChartPropsMock = jest.fn();
const mockTrainingPathSectionProps = jest.fn();
const defaultMockGoals = [
  {
    id: "goal-1",
    title: "Race A",
    priority: 8,
    target_date: "2026-08-01",
    profile_id: "profile-1",
    activity_category: "run",
    objective: {
      type: "event_performance",
      activity_category: "run",
      distance_m: 5000,
      target_time_s: 1400,
    },
  },
  {
    id: "goal-2",
    title: "Race B",
    priority: 6,
    target_date: "2026-09-01",
    profile_id: "profile-1",
    activity_category: "run",
    objective: {
      type: "event_performance",
      activity_category: "run",
      distance_m: 10000,
      target_time_s: 3200,
    },
  },
];
let mockGoals = defaultMockGoals;

function _getTextContent(children: any): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children
      .map((child) => _getTextContent(child))
      .join(" ")
      .trim();
  }
  if (children?.props?.children !== undefined) {
    return _getTextContent(children.props.children);
  }
  return "";
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  RefreshControl: createHost("RefreshControl"),
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock, navigate: navigateMock }),
}));

jest.mock("@react-navigation/native", () => ({
  __esModule: true,
  ...jest.requireActual("@react-navigation/native"),
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/auth/auth-headers", () => ({
  __esModule: true,
  hasSessionAuthCredentials: () => true,
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: (selector?: any) => {
    const state = {
      loading: false,
      ready: true,
      session: { user: { id: "profile-1" } },
      user: { email: "runner@example.com", emailVerified: true, id: "profile-1" },
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({
    loading: false,
    profile: { avatar_url: null, id: "profile-1", username: "Runner" },
    ready: true,
    session: { user: { id: "profile-1" } },
    user: { email: "runner@example.com", id: "profile-1" },
  }),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/plan/training-path/TrainingPathSection", () => ({
  __esModule: true,
  TrainingPathSection: (props: any) => {
    mockTrainingPathSectionProps(props);
    return React.createElement("View", { testID: "training-path-section" }, [
      React.createElement("Text", { key: "title" }, "Weekly Training Path"),
      React.createElement(
        "TouchableOpacity",
        {
          key: "select-week",
          onPress: () => props.onSelectedWeekChange("2026-04-13"),
          testID: "training-path-week-2026-04-13",
        },
        React.createElement("Text", null, "Select Apr 13"),
      ),
      React.createElement(
        "TouchableOpacity",
        {
          key: "activity",
          onPress: () => props.onOpenActivity("activity-1"),
          testID: "training-path-open-activity",
        },
        React.createElement("Text", null, "Open activity"),
      ),
      React.createElement(
        "TouchableOpacity",
        {
          key: "goal",
          onPress: () => props.onOpenGoal("goal-1"),
          testID: "training-path-open-goal",
        },
        React.createElement("Text", null, "Open goal"),
      ),
      React.createElement(
        "TouchableOpacity",
        {
          key: "group-event",
          onPress: () => props.onOpenGroupEvent("group-event-1"),
          testID: "training-path-open-group-event",
        },
        React.createElement("Text", null, "Open group event"),
      ),
      React.createElement(
        "TouchableOpacity",
        {
          key: "scheduled-event",
          onPress: () => props.onOpenScheduledEvent("event-1"),
          testID: "training-path-open-scheduled-event",
        },
        React.createElement("Text", null, "Open scheduled event"),
      ),
    ]);
  },
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: createHost("AppHeader"),
  CompactInsightCard: ({ children, icon: _icon, title, value, onPress, ...props }: any) =>
    React.createElement("TouchableOpacity", { onPress, ...props }, [
      React.createElement("Text", { key: "title" }, title),
      React.createElement("Text", { key: "value" }, value),
      children,
    ]),
  DetailChartModal: ({ children, visible, ...props }: any) =>
    React.createElement(
      "DetailChartModal",
      { visible, ...props },
      visible ? children(mockDetailDateRange) : null,
    ),
}));

jest.mock("@/components/goals", () => ({
  __esModule: true,
  GoalEditorModal: createHost("GoalEditorModal"),
}));

jest.mock("@/components/plan/GoalListItem", () => ({
  __esModule: true,
  formatGoalTargetDate: (date: string | null | undefined) => {
    if (!date) return "No date";
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  },
  GoalListItem: ({ goal, label, onPress, readinessPercent, status, testID }: any) =>
    React.createElement("TouchableOpacity", { onPress, testID }, [
      React.createElement("Text", { key: "label" }, label),
      React.createElement("Text", { key: "title" }, goal.title),
      React.createElement(
        "Text",
        { key: "summary" },
        `${new Date(`${goal.target_date}T00:00:00.000Z`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })} · ${status}`,
      ),
      React.createElement("Text", { key: "readiness" }, `${Math.round(readinessPercent)}%`),
      React.createElement("View", { key: "ring", testID: "goal-readiness-ring" }),
    ]),
}));

jest.mock("@/components/charts/PlanVsActualChart", () => ({
  __esModule: true,
  FitnessFatigueFormChart: createHost("FitnessFatigueFormChart"),
  PlanVsActualChart: (props: any) => {
    projectionChartPropsMock(props);
    return React.createElement("PlanVsActualChart", props, props.children);
  },
}));

jest.mock("@/components/charts/PlanReadinessComparisonChart", () => ({
  __esModule: true,
  PlanReadinessComparisonChart: (props: any) => {
    readinessChartPropsMock(props);
    return React.createElement("PlanReadinessComparisonChart", props, props.children);
  },
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: ({ children, ...props }: any) => React.createElement("Text", props, children),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Bike: createHost("Bike"),
  ChevronLeft: createHost("ChevronLeft"),
  ChevronRight: createHost("ChevronRight"),
  Dumbbell: createHost("Dumbbell"),
  Flag: createHost("Flag"),
  Flame: createHost("Flame"),
  Footprints: createHost("Footprints"),
  Plus: createHost("Plus"),
  Settings: createHost("Settings"),
  Sparkles: createHost("Sparkles"),
  Waves: createHost("Waves"),
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: createHost("Svg"),
  Circle: createHost("Circle"),
  Line: createHost("Line"),
  Path: createHost("Path"),
  Rect: createHost("Rect"),
}));

jest.mock("@/lib/hooks/useProfileGoals", () => ({
  __esModule: true,
  useProfileGoals: () => ({
    profileId: "profile-1",
    goals: mockGoals,
    goalsCount: mockGoals.length,
    dataUpdatedAt: goalsUpdatedAtRef.current,
    refetch: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/lib/hooks/useProfileSettings", () => ({
  __esModule: true,
  useProfileSettings: () => ({
    settings: {
      availability: { weekly_windows: [], hard_rest_days: [] },
      dose_limits: { min_sessions_per_week: 2, max_sessions_per_week: 6 },
      training_style: {
        progression_pace: 0.5,
        week_pattern_preference: 0.5,
        key_session_density_preference: 0.5,
      },
      recovery_preferences: {
        recovery_priority: 0.5,
        post_goal_recovery_days: 5,
        double_day_tolerance: 0.25,
        long_session_fatigue_tolerance: 0.5,
      },
      adaptation_preferences: {
        recency_adaptation_preference: 0.5,
        plan_churn_tolerance: 0.4,
      },
      goal_strategy_preferences: {
        target_surplus_preference: 0.25,
        priority_tradeoff_preference: 0.5,
      },
    },
    settingsRecord: null,
    refetch: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  __esModule: true,
  useTrainingPlanSnapshot: () => ({
    idealCurveData: {
      startCTL: 40,
      targetCTL: 50,
      targetDate: "2026-08-01",
      dataPoints: [
        { date: "2026-04-01", ctl: 45 },
        { date: "2026-08-01", ctl: 55 },
      ],
      goal_assessments: [
        {
          goal_id: "goal-1",
          target_scores: [
            { effective_target: { surplus_applied: true, applied_surplus_pct: 0.02 } },
          ],
        },
        { goal_id: "goal-2", target_scores: [] },
      ],
    },
    insightTimeline: {
      plan_feasibility: { state: "stretch", reasons: ["timeline_pressure"] },
      goal_feasibility: [
        {
          goal_id: "goal-1",
          goal_name: "Race A",
          state: "stretch",
          reasons: ["capacity_pressure"],
        },
        { goal_id: "goal-2", goal_name: "Race B", state: "feasible", reasons: [] },
      ],
      projection: {
        diagnostics: {
          fallback_mode: "conservative_baseline",
          confidence: {
            overall: 0.62,
            adherence: 0.62,
            capability: 0.55,
            evidence_state: "medium",
          },
        },
      },
      load_guidance: {
        mode: "baseline",
        goal_count: 2,
        dated_goal_count: 2,
        interpretation:
          "Goals are evaluated separately; recommended load remains a baseline estimate instead of aggregating goal-derived planned load.",
      },
      projection_dashboard: {
        readiness_score: 72,
        physiological_readiness_score: 70,
        readiness_confidence: 0.68,
        planning_confidence: 0.74,
        planning_confidence_reasons: ["adherence_within_expected_range"],
        readiness_rationale_codes: ["goal_projection_available"],
        feasibility_band: "stretch",
        risk_score: 32,
        risk_level: "moderate",
        risk_flags: [],
        caps_applied: [],
        load_resolution_summary: {
          week_count: 2,
          capped_weeks: 1,
          tss_ramp_capped_weeks: 1,
          ctl_ramp_capped_weeks: 0,
          demand_floor_weeks: 0,
          demand_floor_override_weeks: 0,
          recovery_adjusted_weeks: 0,
          recovery_weeks: 0,
          average_baseline_to_final_delta_tss: 10,
          average_requested_to_final_delta_tss: 5,
          average_mpc_to_final_delta_tss: 0,
          max_requested_to_final_delta_tss: 15,
          limiting_constraints: ["weekly_tss_ramp_cap"],
          confidence: "medium",
          confidence_reasons: [],
        },
        dose_recommendation: {
          recommended_weekly_load: 315,
          recommended_weekly_duration_minutes: 365,
          recommended_sessions_per_week: 5,
          key_session_count: 2,
          long_session_ceiling_minutes: 110,
          intensity_distribution_target: { easy: 0.8, moderate: 0.15, hard: 0.05 },
          ramp_pressure: 0.3,
          recovery_pressure: 0.2,
          notes: [],
        },
        sport_load_states: [],
        recovery_segments: [],
        readiness_points: [
          { date: "2026-04-01", readiness_score: 62, predicted_fitness_ctl: 45 },
          { date: "2026-08-01", readiness_score: 72, predicted_fitness_ctl: 55 },
        ],
        microcycles: [
          {
            week_start_date: "2026-04-06",
            week_end_date: "2026-04-12",
            phase: "build",
            planned_weekly_tss: 315,
            projected_ctl: 48,
            constraints: ["weekly_tss_ramp_cap"],
            recovery_active: false,
            demand_floor_tss: null,
            demand_gap_unmet_weekly_tss: null,
          },
        ],
        goal_forecasts: [
          {
            profile_goal_id: "goal-1",
            projection_goal_id: "projection-goal-1",
            title: "Race A",
            target_date: "2026-08-01",
            priority: 8,
            readiness_score: 72,
            state_readiness_score: 70,
            alignment_loss_0_100: 14,
            feasibility_band: "stretch",
            limiter_shares: {
              timeline_pressure: 0.5,
              capacity_pressure: 0.2,
              evidence_weakness: 0.1,
              recovery_strain: 0.1,
              mechanical_stress: 0.05,
              goal_interference: 0.05,
            },
            target_scores: [{ kind: "race_performance", score_0_100: 74, rationale_codes: [] }],
            conflict_notes: [],
            interference_notes: [],
          },
        ],
      },
      readiness_forecast: {
        start_date: "2026-04-01",
        end_date: "2026-08-15",
        today: "2026-04-05",
        current_readiness: 68,
        current_status: "building",
        confidence: "medium",
        confidence_reason_codes: ["inferred_scheduled_load"],
        series: {
          actual: {
            id: "actual",
            label: "Actual",
            points: mockNewUserNoActivities
              ? []
              : [
                  {
                    date: "2026-04-01",
                    readiness: 62,
                    load: 38,
                    provenance: "completed_activity",
                  },
                ],
          },
          scheduled: {
            id: "scheduled",
            label: "Scheduled",
            points: [
              {
                date: "2026-04-05",
                readiness: 66,
                load: 42,
                provenance: "scheduled_activity_estimate",
                confidence: "medium",
              },
              {
                date: "2026-08-01",
                readiness: 70,
                load: 48,
                provenance: "scheduled_activity_estimate",
                confidence: "medium",
              },
            ],
          },
          recommended: {
            id: "recommended",
            label: "Recommended",
            points: [
              {
                date: "2026-04-05",
                readiness: 68,
                low: 60,
                high: 76,
                load: 44,
                provenance: "recommendation_engine",
              },
              {
                date: "2026-08-01",
                readiness: 78,
                low: 70,
                high: 86,
                load: 54,
                provenance: "recommendation_engine",
              },
            ],
          },
        },
        zones: [
          { id: "underprepared", label: "Underprepared", min: 0, max: 39 },
          { id: "building", label: "Building", min: 40, max: 69 },
          { id: "goal_ready", label: "Goal Ready", min: 70, max: 84 },
          { id: "peak_ready", label: "Peak Ready", min: 85, max: 100 },
        ],
        goals: [
          {
            goal_id: "goal-1",
            title: "Race A",
            target_date: "2026-08-01",
            target_readiness_min: null,
            target_readiness_max: null,
            scheduled_readiness: 70,
            recommended_readiness: 78,
            gap: 8,
            status: "on_track",
          },
        ],
        gap_summary: {
          type: mockNewUserNoActivities ? "low_confidence" : "plan_gap",
          severity: mockNewUserNoActivities ? "info" : "warning",
          title_code: "readiness_forecast.plan_gap.title",
          message_code: "readiness_forecast.plan_gap.message",
          primary_delta: 8,
          recommended_action_code: "readiness_forecast.action.follow_recommendation",
        },
        version: "readiness_forecast.v1",
      },
      load_comparison: {
        weeks: [
          {
            week_start: "2026-04-01",
            week_end: "2026-04-07",
            actual_load: 40,
            scheduled_load: 52,
            recommended_load: 60,
            safety_cap: null,
            is_recovery_week: false,
            has_goal: false,
          },
        ],
      },
      upcoming_impact: [
        {
          activity_plan_id: "plan-activity-1",
          title: "Tempo Run",
          scheduled_at: "2026-04-06T12:00:00.000Z",
          sport: "run",
          estimated_load: 52,
          short_term_readiness_delta: -1.5,
          fitness_contribution: 4.3,
          confidence: "medium",
          explanation:
            "This session contributes fitness while staying close to the recommended load path.",
        },
      ],
      schedule_recommendation: {
        type: "add_load",
        label: "Adjust schedule",
        description: "Add about 80 TSS this week or schedule one moderate session.",
        target_date: "2026-04-06",
        target_week_start: "2026-04-01",
        target_load_delta: 80,
      },
      activity_plan_matches: {
        target_date: "2026-04-06",
        target_tss_delta: 80,
        empty_reason: mockNewUserNoActivities ? "no_activity_plans" : null,
        matches: mockNewUserNoActivities
          ? []
          : [
              {
                activity_plan_id: "activity-plan-80",
                name: "Threshold Builder",
                activity_category: "run",
                estimated_tss: 78,
                estimated_duration_seconds: 3600,
                score: 114,
                target_tss_delta: 80,
                absolute_tss_gap: 2,
                reason_codes: ["owned_plan", "near_target_tss", "same_activity_category"],
              },
            ],
      },
      schedule_simulation: {
        adjustment: {
          date: "2026-04-06",
          tss_delta: 80,
          resulting_scheduled_load: 132,
        },
        comparison_date: "2026-04-10",
        scheduled_readiness: 70,
        simulated_readiness: 75.5,
        readiness_delta: 5.5,
        scheduled_load: 52,
        simulated_load: 132,
        confidence: "medium",
      },
      readiness_summary: {
        score: 68,
        interpretation: "Projection confidence is improving with better adherence.",
      },
      timeline: [{ date: "2026-04-01", ideal_tss: 42, scheduled_tss: 38, actual_tss: 0 }],
    },
    refetchAll: refetchSnapshotMock,
  }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  buildGoalCreatePayload: jest.fn(),
  buildGoalDraftFromGoal: jest.fn(),
  buildGoalUpdatePayload: jest.fn(),
  createEmptyGoalDraft: jest.fn(() => ({ title: "", objective: null })),
  formatGoalTypeLabel: jest.fn(() => "Race"),
  getGoalObjectiveSummary: jest.fn(() => "5K target"),
  resolveGoalReadinessTarget: jest.fn(({ target_surplus_preference }: any = {}) =>
    typeof target_surplus_preference === "number"
      ? Math.max(94, Math.min(110, Math.round(96 + target_surplus_preference * 16)))
      : 100,
  ),
  resolveGoalReadinessViewModel: jest.fn(({ value, target }: any) => {
    if (typeof value !== "number")
      return { label: "Estimating", value: null, target: target ?? 100 };
    if (value > (target ?? 100) + 2)
      return { label: "Above target range", value, target: target ?? 100 };
    if (value >= (target ?? 100) - 5)
      return { label: "In target range", value, target: target ?? 100 };
    if (value >= (target ?? 100) * 0.45)
      return { label: "Building toward target", value, target: target ?? 100 };
    return { label: "Below target range", value, target: target ?? 100 };
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      trainingPlans: { invalidate: jest.fn() },
      events: { list: { invalidate: jest.fn() }, invalidate: jest.fn() },
      profileSettings: { getForProfile: { invalidate: jest.fn() } },
      goals: { list: { invalidate: jest.fn() } },
    }),
    trainingPlans: {
      getActivePlan: {
        useQuery: (_input: any, options: any) => {
          activePlanQueryOptionsRef.current = options;
          return {
            data: {
              id: "active-1",
              next_event_at: "2026-04-05T00:00:00.000Z",
              training_plan: { name: "Current Plan" },
            },
            refetch: refetchActivePlanMock,
          };
        },
      },
      simulateScheduleAdjustment: {
        useQuery: (input: any, options: any) => ({
          data: options?.enabled
            ? {
                adjustment: {
                  date: input.adjustment_date,
                  tss_delta: input.tss_delta,
                  resulting_scheduled_load: 52 + input.tss_delta,
                },
                comparison_date: input.comparison_date ?? "2026-04-10",
                scheduled_readiness: 70,
                simulated_readiness: 75.5,
                readiness_delta: input.tss_delta === 105 ? 6.4 : 5.5,
                scheduled_load: 52,
                simulated_load: 52 + input.tss_delta,
                confidence: "medium",
              }
            : null,
          isFetching: false,
        }),
      },
      list: {
        useInfiniteQuery: () => ({
          data: {
            pages: [{ items: [{ id: "active-1", name: "Current Plan" }], nextCursor: null }],
          },
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: jest.fn(),
        }),
      },
    },
    events: {
      list: {
        useQuery: (input: any, options: any) => {
          eventQueryOptionsRef.current.push(options);
          return {
            data:
              input?.date_from && input?.date_to
                ? {
                    items: [
                      {
                        id: "event-1",
                        training_plan_id: "active-1",
                        starts_at: "2026-04-05T00:00:00.000Z",
                      },
                    ],
                  }
                : { items: [] },
            dataUpdatedAt:
              input?.date_from === "2026-02-15"
                ? recentEventsUpdatedAtRef.current
                : upcomingEventsUpdatedAtRef.current,
            refetch: jest.fn(async () => undefined),
          };
        },
      },
      create: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
    },
    groups: {
      events: {
        myUpcomingGroupEvents: {
          useQuery: () => ({
            data: { items: [] },
            dataUpdatedAt: 1,
            isFetching: false,
            refetch: jest.fn(async () => undefined),
          }),
        },
      },
    },
    activities: {
      list: {
        useQuery: () => ({
          data: [],
          dataUpdatedAt: 1,
          isFetching: false,
          refetch: jest.fn(async () => undefined),
        }),
      },
    },
    activityPlans: {
      getManyByIds: {
        useQuery: () => ({
          data: { items: [] },
          isFetching: false,
          refetch: jest.fn(async () => undefined),
        }),
      },
    },
    profileSettings: { upsert: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) } },
    goals: {
      create: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      delete: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
    },
  },
}));

const PlanScreenWithErrorBoundary = require("../plan").default;

describe("plan dashboard navigation", () => {
  beforeEach(() => {
    pushMock.mockClear();
    navigateMock.mockClear();
    refetchActivePlanMock.mockClear();
    refetchSnapshotMock.mockClear();
    readinessChartPropsMock.mockClear();
    projectionChartPropsMock.mockClear();
    mockTrainingPathSectionProps.mockClear();
    mockDetailDateRange = "90d";
    mockNewUserNoActivities = false;
    mockGoals = defaultMockGoals;
    goalsUpdatedAtRef.current = 1;
    activePlanQueryOptionsRef.current = null;
    eventQueryOptionsRef.current = [];
  });

  it("uses schedule-aware freshness for plan dashboard queries", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    expect(activePlanQueryOptionsRef.current).not.toHaveProperty("staleTime");
    expect(activePlanQueryOptionsRef.current).not.toHaveProperty("refetchOnMount");
    for (const options of eventQueryOptionsRef.current) {
      expect(options).not.toHaveProperty("staleTime");
      expect(options).not.toHaveProperty("refetchOnMount");
    }
  });

  it("refreshes the projection snapshot when planned events change", async () => {
    const view = renderNative(<PlanScreenWithErrorBoundary />);

    expect(refetchActivePlanMock).not.toHaveBeenCalled();
    expect(refetchSnapshotMock).not.toHaveBeenCalled();

    await React.act(async () => {
      recentEventsUpdatedAtRef.current += 1;
      upcomingEventsUpdatedAtRef.current += 1;
      view.rerender(<PlanScreenWithErrorBoundary />);
    });

    expect(refetchActivePlanMock).toHaveBeenCalled();
    expect(refetchSnapshotMock).toHaveBeenCalled();
  });

  it("refreshes the projection snapshot when goals change", async () => {
    const view = renderNative(<PlanScreenWithErrorBoundary />);

    expect(refetchSnapshotMock).not.toHaveBeenCalled();

    await React.act(async () => {
      goalsUpdatedAtRef.current += 1;
      view.rerender(<PlanScreenWithErrorBoundary />);
    });

    expect(refetchActivePlanMock).toHaveBeenCalled();
    expect(refetchSnapshotMock).toHaveBeenCalled();
  });

  it("renders the training path section on the plan tab", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    expect(screen.getByTestId("training-path-section")).toBeTruthy();
    expect(screen.getByText("Weekly Training Path")).toBeTruthy();
    expect(mockTrainingPathSectionProps).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedWeekLoading: false,
        onOpenActivity: expect.any(Function),
        onOpenGoal: expect.any(Function),
        onOpenGroupEvent: expect.any(Function),
        onOpenScheduledEvent: expect.any(Function),
        onSelectedWeekChange: expect.any(Function),
      }),
    );
  });

  it("opens detail screens from training path week review callbacks", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("training-path-open-activity"));
    fireEvent.press(screen.getByTestId("training-path-open-goal"));
    fireEvent.press(screen.getByTestId("training-path-open-group-event"));
    fireEvent.press(screen.getByTestId("training-path-open-scheduled-event"));

    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/activity-detail",
      params: { id: "activity-1" },
    });
    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/goal-detail",
      params: { id: "goal-1" },
    });
    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/group-event-detail",
      params: { groupEventId: "group-event-1" },
    });
    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: { id: "event-1" },
    });
  });

  it("marks the training path week review loading after selecting a new chart week", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    expect(mockTrainingPathSectionProps.mock.calls.at(-1)?.[0].selectedWeekLoading).toBe(false);
    fireEvent.press(screen.getByTestId("training-path-week-2026-04-13"));

    expect(mockTrainingPathSectionProps.mock.calls.at(-1)?.[0].selectedWeekLoading).toBe(true);
  });

  it("keeps removed legacy plan-tab panels out of the current training path flow", () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    expect(screen.queryByTestId("plan-goal-outlook")).toBeNull();
    expect(screen.queryByTestId("plan-analysis-section")).toBeNull();
    expect(screen.queryByTestId("plan-signals")).toBeNull();
    expect(screen.queryByTestId("plan-schedule-simulation-controls")).toBeNull();
  });
});
