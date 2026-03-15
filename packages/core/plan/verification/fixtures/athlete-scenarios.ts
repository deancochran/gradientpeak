import { deterministicUuidFromSeed } from "../../normalizeGoalInput";
import type { BuildProjectionEngineInputShape } from "../../buildProjectionEngineInput";
import { normalizeCreationConfig } from "../../normalizeCreationConfig";
import type { NoHistoryAnchorContext } from "../../projection/no-history";
import type { GoalTargetV2 } from "../../../schemas/training-plan-structure/domain-schemas";
import {
  defaultAthletePreferenceProfile,
  type AthletePreferenceProfile,
} from "../../../schemas/settings/profile_settings";
import type { AthleteScenarioFixture } from "../types";

const mastersPreferenceProfile: AthletePreferenceProfile = {
  ...defaultAthletePreferenceProfile,
  dose_limits: {
    ...defaultAthletePreferenceProfile.dose_limits,
    max_sessions_per_week: 3,
    max_single_session_duration_minutes: 80,
    max_weekly_duration_minutes: 300,
  },
  recovery_preferences: {
    ...defaultAthletePreferenceProfile.recovery_preferences,
    recovery_priority: 0.8,
    systemic_fatigue_tolerance: 0.35,
    long_session_fatigue_tolerance: 0.35,
  },
  goal_strategy_preferences: {
    ...defaultAthletePreferenceProfile.goal_strategy_preferences,
    taper_style_preference: 0.7,
  },
};

function createGoal(
  scenarioId: string,
  goalKey: string,
  name: string,
  targetDate: string,
  priority: number,
  targets: GoalTargetV2[],
) {
  return {
    id: deterministicUuidFromSeed(
      `verification-scenario:${scenarioId}:goal:${goalKey}`,
    ),
    name,
    target_date: targetDate,
    priority,
    targets,
  };
}

function createBlock(
  name: string,
  phase: BuildProjectionEngineInputShape["expanded_plan"]["blocks"][number]["phase"],
  startDate: string,
  endDate: string,
  min: number,
  max: number,
) {
  return {
    name,
    phase,
    start_date: startDate,
    end_date: endDate,
    target_weekly_tss_range: { min, max },
  };
}

function createContextSummary(
  historyAvailabilityState: NoHistoryAnchorContext["history_availability_state"],
  baselineRange: { min: number; max: number },
  sessionsPerWeekRange: { min: number; max: number },
  rationaleCodes: string[],
  signalQuality: number,
  markers: {
    recent_consistency_marker: "low" | "moderate" | "high";
    effort_confidence_marker: "low" | "moderate" | "high";
    profile_metric_completeness_marker: "low" | "moderate" | "high";
  },
) {
  return {
    history_availability_state: historyAvailabilityState,
    ...markers,
    signal_quality: signalQuality,
    recommended_baseline_tss_range: baselineRange,
    recommended_recent_influence_range: { min: -0.25, max: 0.25 },
    recommended_sessions_per_week_range: sessionsPerWeekRange,
    rationale_codes: rationaleCodes,
  };
}

function createAvailabilityContext(
  days: Array<{
    day: string;
    start: number;
    end: number;
  }>,
  options?: {
    hard_rest_days?: string[];
    max_single_session_duration_minutes?: number;
  },
): NonNullable<NoHistoryAnchorContext["availability_context"]> {
  return {
    availability_days: days.map((day) => ({
      day: day.day,
      windows: [
        {
          start_minute_of_day: day.start,
          end_minute_of_day: day.end,
        },
      ],
    })),
    hard_rest_days: options?.hard_rest_days,
    max_single_session_duration_minutes:
      options?.max_single_session_duration_minutes,
  };
}

function createProjectionConfig(
  optimizationProfile: NonNullable<
    BuildProjectionEngineInputShape["normalized_creation_config"]
  >["optimization_profile"],
  postGoalRecoveryDays: number,
): NonNullable<BuildProjectionEngineInputShape["normalized_creation_config"]> {
  return normalizeCreationConfig({
    defaults: {
      optimization_profile: optimizationProfile,
      post_goal_recovery_days: postGoalRecoveryDays,
    },
  });
}

const beginnerNoHistory5kProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-03-02",
    end_date: "2026-04-26",
    blocks: [
      createBlock(
        "Initial consistency",
        "base",
        "2026-03-02",
        "2026-03-15",
        110,
        150,
      ),
      createBlock(
        "Controlled build",
        "build",
        "2026-03-16",
        "2026-04-05",
        140,
        185,
      ),
      createBlock(
        "5K sharpening",
        "peak",
        "2026-04-06",
        "2026-04-12",
        175,
        220,
      ),
      createBlock("Taper", "taper", "2026-04-13", "2026-04-19", 120, 155),
      createBlock(
        "Post-race recovery",
        "recovery",
        "2026-04-20",
        "2026-04-26",
        90,
        125,
      ),
    ],
    goals: [
      createGoal(
        "beginner_no_history_5k",
        "primary-5k",
        "Spring 5K",
        "2026-04-19",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 5000,
            target_time_s: 1680,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("balanced", 6),
  starting_ctl: 10,
  no_history_context: {
    history_availability_state: "none",
    goal_tier: "medium",
    weeks_to_event: 7,
    availability_context: createAvailabilityContext(
      [
        { day: "tuesday", start: 360, end: 420 },
        { day: "thursday", start: 360, end: 420 },
        { day: "saturday", start: 480, end: 570 },
      ],
      { max_single_session_duration_minutes: 90 },
    ),
    context_summary: createContextSummary(
      "none",
      { min: 35, max: 85 },
      { min: 3, max: 4 },
      ["history_none", "goal_5k", "availability_training_days_3"],
      0.2,
      {
        recent_consistency_marker: "low",
        effort_confidence_marker: "low",
        profile_metric_completeness_marker: "moderate",
      },
    ),
  },
};

const exact5kSpeedBlockProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-03-02",
    end_date: "2026-04-26",
    blocks: [
      createBlock(
        "Speed-support base",
        "base",
        "2026-03-02",
        "2026-03-15",
        150,
        190,
      ),
      createBlock(
        "5K power build",
        "build",
        "2026-03-16",
        "2026-04-05",
        175,
        235,
      ),
      createBlock(
        "Race sharpening",
        "peak",
        "2026-04-06",
        "2026-04-12",
        205,
        255,
      ),
      createBlock("Taper", "taper", "2026-04-13", "2026-04-19", 145, 185),
      createBlock(
        "Post-race recovery",
        "recovery",
        "2026-04-20",
        "2026-04-26",
        105,
        140,
      ),
    ],
    goals: [
      createGoal(
        "exact_5k_speed_block",
        "primary-5k",
        "Exact 5K",
        "2026-04-26",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 5000,
            target_time_s: 1140,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("outcome_first", 6),
  starting_ctl: 34,
  no_history_context: {
    history_availability_state: "rich",
    goal_tier: "high",
    weeks_to_event: 8,
    availability_context: createAvailabilityContext(
      [
        { day: "monday", start: 360, end: 420 },
        { day: "tuesday", start: 360, end: 420 },
        { day: "thursday", start: 360, end: 430 },
        { day: "saturday", start: 480, end: 570 },
        { day: "sunday", start: 480, end: 540 },
      ],
      { max_single_session_duration_minutes: 95 },
    ),
    context_summary: createContextSummary(
      "rich",
      { min: 130, max: 220 },
      { min: 4, max: 5 },
      ["history_rich", "goal_5k", "speed_support"],
      0.82,
      {
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
      },
    ),
  },
};

const recreationalSparse10kProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-02-02",
    end_date: "2026-04-12",
    blocks: [
      createBlock(
        "Aerobic re-entry",
        "base",
        "2026-02-02",
        "2026-02-22",
        150,
        190,
      ),
      createBlock(
        "Sustainable build",
        "build",
        "2026-02-23",
        "2026-03-22",
        180,
        235,
      ),
      createBlock(
        "10K specific work",
        "peak",
        "2026-03-23",
        "2026-03-29",
        220,
        260,
      ),
      createBlock("Taper", "taper", "2026-03-30", "2026-04-05", 165, 205),
      createBlock("Recovery", "recovery", "2026-04-06", "2026-04-12", 130, 165),
    ],
    goals: [
      createGoal(
        "recreational_sparse_10k",
        "primary-10k",
        "Community 10K",
        "2026-04-05",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 10000,
            target_time_s: 3300,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("balanced", 7),
  starting_ctl: 18,
  no_history_context: {
    history_availability_state: "sparse",
    goal_tier: "medium",
    weeks_to_event: 9,
    availability_context: createAvailabilityContext(
      [
        { day: "monday", start: 360, end: 420 },
        { day: "wednesday", start: 360, end: 430 },
        { day: "friday", start: 360, end: 420 },
        { day: "sunday", start: 450, end: 570 },
      ],
      { max_single_session_duration_minutes: 105 },
    ),
    context_summary: createContextSummary(
      "sparse",
      { min: 110, max: 210 },
      { min: 4, max: 5 },
      ["history_sparse", "goal_10k"],
      0.56,
      {
        recent_consistency_marker: "moderate",
        effort_confidence_marker: "moderate",
        profile_metric_completeness_marker: "moderate",
      },
    ),
  },
};

const intermediateRichHalfProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-02-02",
    end_date: "2026-04-12",
    blocks: [
      createBlock(
        "Aerobic strength",
        "base",
        "2026-02-02",
        "2026-02-22",
        230,
        280,
      ),
      createBlock(
        "Threshold build",
        "build",
        "2026-02-23",
        "2026-03-22",
        270,
        335,
      ),
      createBlock(
        "Half-marathon peak",
        "peak",
        "2026-03-23",
        "2026-03-29",
        320,
        365,
      ),
      createBlock("Taper", "taper", "2026-03-30", "2026-04-05", 220, 270),
      createBlock("Recovery", "recovery", "2026-04-06", "2026-04-12", 180, 225),
    ],
    goals: [
      createGoal(
        "intermediate_rich_half",
        "primary-half",
        "Spring Half Marathon",
        "2026-04-05",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 21097,
            target_time_s: 6120,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("balanced", 7),
  starting_ctl: 42,
  no_history_context: {
    history_availability_state: "rich",
    goal_tier: "high",
    weeks_to_event: 9,
    context_summary: createContextSummary(
      "rich",
      { min: 210, max: 320 },
      { min: 4, max: 6 },
      ["history_rich", "goal_half_marathon"],
      0.9,
      {
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
      },
    ),
  },
};

const advancedMarathonBuildProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-01-05",
    end_date: "2026-03-29",
    blocks: [
      createBlock("Foundation", "base", "2026-01-05", "2026-01-25", 280, 330),
      createBlock(
        "Marathon build",
        "build",
        "2026-01-26",
        "2026-02-22",
        320,
        385,
      ),
      createBlock(
        "Specific peak",
        "peak",
        "2026-02-23",
        "2026-03-08",
        380,
        435,
      ),
      createBlock("Taper", "taper", "2026-03-09", "2026-03-22", 255, 325),
      createBlock("Recovery", "recovery", "2026-03-23", "2026-03-29", 180, 230),
    ],
    goals: [
      createGoal(
        "advanced_marathon_build",
        "primary-marathon",
        "Spring Marathon",
        "2026-03-22",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 42195,
            target_time_s: 13200,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("outcome_first", 8),
  starting_ctl: 60,
  no_history_context: {
    history_availability_state: "rich",
    goal_tier: "high",
    weeks_to_event: 11,
    context_summary: createContextSummary(
      "rich",
      { min: 260, max: 390 },
      { min: 5, max: 6 },
      ["history_rich", "goal_marathon"],
      0.94,
      {
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
      },
    ),
  },
};

const boundaryFeasibleBikeProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-01-19",
    end_date: "2026-04-12",
    blocks: [
      createBlock("Bike base", "base", "2026-01-19", "2026-02-08", 210, 270),
      createBlock(
        "Threshold build",
        "build",
        "2026-02-09",
        "2026-03-08",
        255,
        330,
      ),
      createBlock(
        "Climbing and specificity",
        "peak",
        "2026-03-09",
        "2026-03-29",
        300,
        370,
      ),
      createBlock("Taper", "taper", "2026-03-30", "2026-04-05", 225, 280),
      createBlock("Recovery", "recovery", "2026-04-06", "2026-04-12", 175, 225),
    ],
    goals: [
      createGoal(
        "boundary_feasible_bike",
        "primary-threshold",
        "Boundary Bike Threshold",
        "2026-04-12",
        1,
        [
          {
            target_type: "power_threshold",
            target_watts: 256,
            test_duration_s: 3600,
            activity_category: "bike",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("balanced", 7),
  starting_ctl: 45,
  no_history_context: {
    history_availability_state: "rich",
    goal_tier: "medium",
    weeks_to_event: 12,
    availability_context: createAvailabilityContext(
      [
        { day: "tuesday", start: 360, end: 450 },
        { day: "thursday", start: 360, end: 450 },
        { day: "saturday", start: 480, end: 660 },
        { day: "sunday", start: 510, end: 630 },
      ],
      { max_single_session_duration_minutes: 180 },
    ),
    context_summary: createContextSummary(
      "rich",
      { min: 190, max: 320 },
      { min: 4, max: 5 },
      ["history_rich", "goal_power_threshold", "bike_endurance_focus"],
      0.88,
      {
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
      },
    ),
  },
};

const lowAvailabilityHighAmbitionProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-01-12",
    end_date: "2026-04-12",
    blocks: [
      createBlock(
        "Available-days base",
        "base",
        "2026-01-12",
        "2026-02-08",
        180,
        230,
      ),
      createBlock(
        "Constraint-aware build",
        "build",
        "2026-02-09",
        "2026-03-08",
        220,
        290,
      ),
      createBlock(
        "Event-specific peak",
        "peak",
        "2026-03-09",
        "2026-03-22",
        250,
        320,
      ),
      createBlock("Taper", "taper", "2026-03-23", "2026-04-05", 180, 225),
      createBlock("Recovery", "recovery", "2026-04-06", "2026-04-12", 145, 185),
    ],
    goals: [
      createGoal(
        "low_availability_high_ambition",
        "primary-century",
        "Ambitious Century",
        "2026-04-05",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 100000,
            target_time_s: 15300,
            activity_category: "bike",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("sustainable", 8),
  starting_ctl: 24,
  no_history_context: {
    history_availability_state: "sparse",
    goal_tier: "high",
    weeks_to_event: 12,
    availability_context: createAvailabilityContext(
      [
        { day: "tuesday", start: 360, end: 435 },
        { day: "thursday", start: 360, end: 435 },
        { day: "saturday", start: 450, end: 600 },
      ],
      {
        hard_rest_days: ["monday", "friday"],
        max_single_session_duration_minutes: 150,
      },
    ),
    context_summary: createContextSummary(
      "sparse",
      { min: 140, max: 240 },
      { min: 3, max: 4 },
      ["history_sparse", "availability_training_days_3", "goal_endurance_bike"],
      0.58,
      {
        recent_consistency_marker: "moderate",
        effort_confidence_marker: "moderate",
        profile_metric_completeness_marker: "high",
      },
    ),
  },
};

const infeasibleStretchGoalProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-01-05",
    end_date: "2026-02-16",
    blocks: [
      createBlock(
        "Compressed build",
        "build",
        "2026-01-05",
        "2026-01-25",
        170,
        230,
      ),
      createBlock("Forced peak", "peak", "2026-01-26", "2026-02-01", 220, 280),
      createBlock("Taper", "taper", "2026-02-02", "2026-02-08", 160, 210),
      createBlock("Recovery", "recovery", "2026-02-09", "2026-02-16", 120, 160),
    ],
    goals: [
      createGoal(
        "infeasible_stretch_goal",
        "primary-marathon",
        "Too-Soon Marathon",
        "2026-02-08",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 42195,
            target_time_s: 13500,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("sustainable", 8),
  starting_ctl: 12,
  no_history_context: {
    history_availability_state: "none",
    goal_tier: "high",
    weeks_to_event: 5,
    availability_context: createAvailabilityContext(
      [
        { day: "monday", start: 360, end: 420 },
        { day: "wednesday", start: 360, end: 420 },
        { day: "friday", start: 360, end: 420 },
        { day: "sunday", start: 480, end: 600 },
      ],
      { max_single_session_duration_minutes: 120 },
    ),
    context_summary: createContextSummary(
      "none",
      { min: 30, max: 75 },
      { min: 3, max: 4 },
      ["history_none", "goal_marathon", "timeline_compressed"],
      0.18,
      {
        recent_consistency_marker: "low",
        effort_confidence_marker: "low",
        profile_metric_completeness_marker: "moderate",
      },
    ),
  },
};

const mastersConservativeProfileProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-01-05",
    end_date: "2026-02-16",
    blocks: [
      createBlock(
        "Conservative base",
        "base",
        "2026-01-05",
        "2026-01-18",
        135,
        175,
      ),
      createBlock(
        "Durability build",
        "build",
        "2026-01-19",
        "2026-02-01",
        155,
        205,
      ),
      createBlock(
        "Maintenance taper",
        "taper",
        "2026-02-02",
        "2026-02-08",
        130,
        165,
      ),
      createBlock("Recovery", "recovery", "2026-02-09", "2026-02-16", 105, 140),
    ],
    goals: [
      createGoal(
        "masters_conservative_profile",
        "primary-10k",
        "Masters 10K",
        "2026-02-08",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 10000,
            target_time_s: 3720,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("sustainable", 8),
  starting_ctl: 26,
  no_history_context: {
    history_availability_state: "sparse",
    goal_tier: "medium",
    age: 58,
    weeks_to_event: 5,
    availability_context: createAvailabilityContext(
      [
        { day: "tuesday", start: 360, end: 430 },
        { day: "thursday", start: 360, end: 430 },
        { day: "saturday", start: 480, end: 570 },
        { day: "sunday", start: 480, end: 540 },
      ],
      {
        hard_rest_days: ["monday", "friday"],
        max_single_session_duration_minutes: 90,
      },
    ),
    context_summary: createContextSummary(
      "sparse",
      { min: 120, max: 190 },
      { min: 3, max: 4 },
      ["history_sparse", "masters_profile", "goal_10k"],
      0.52,
      {
        recent_consistency_marker: "moderate",
        effort_confidence_marker: "moderate",
        profile_metric_completeness_marker: "high",
      },
    ),
  },
};

const bRaceBeforeARaceProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-02-02",
    end_date: "2026-04-12",
    blocks: [
      createBlock(
        "Primary build",
        "build",
        "2026-02-02",
        "2026-03-01",
        210,
        270,
      ),
      createBlock(
        "B-race taper",
        "taper",
        "2026-03-02",
        "2026-03-08",
        170,
        215,
      ),
      createBlock("Reload", "build", "2026-03-09", "2026-03-22", 220, 285),
      createBlock(
        "A-race taper",
        "taper",
        "2026-03-23",
        "2026-04-05",
        165,
        220,
      ),
      createBlock("Recovery", "recovery", "2026-04-06", "2026-04-12", 125, 165),
    ],
    goals: [
      createGoal(
        "b_race_before_a_race",
        "b-race",
        "Tune-up 10K",
        "2026-03-08",
        6,
        [
          {
            target_type: "race_performance",
            distance_m: 10000,
            target_time_s: 3120,
            activity_category: "run",
          },
        ],
      ),
      createGoal(
        "b_race_before_a_race",
        "a-race",
        "Goal Half Marathon",
        "2026-04-05",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 21097,
            target_time_s: 5940,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("balanced", 7),
  starting_ctl: 36,
  no_history_context: {
    history_availability_state: "rich",
    goal_tier: "high",
    weeks_to_event: 9,
    goal_count: 2,
    total_horizon_weeks: 10,
    context_summary: createContextSummary(
      "rich",
      { min: 190, max: 290 },
      { min: 4, max: 5 },
      ["history_rich", "multi_goal", "b_race_before_a_race"],
      0.86,
      {
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
      },
    ),
  },
};

const twoCloseAGoalsProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-02-02",
    end_date: "2026-04-12",
    blocks: [
      createBlock(
        "Shared build",
        "build",
        "2026-02-02",
        "2026-03-08",
        240,
        305,
      ),
      createBlock("Peak carry", "peak", "2026-03-09", "2026-03-22", 285, 340),
      createBlock(
        "Managed taper",
        "taper",
        "2026-03-23",
        "2026-04-05",
        220,
        270,
      ),
      createBlock("Recovery", "recovery", "2026-04-06", "2026-04-12", 170, 210),
    ],
    goals: [
      createGoal(
        "two_close_a_goals",
        "a-race-1",
        "First A Race",
        "2026-03-22",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 21097,
            target_time_s: 6000,
            activity_category: "run",
          },
        ],
      ),
      createGoal(
        "two_close_a_goals",
        "a-race-2",
        "Second A Race",
        "2026-04-05",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 21097,
            target_time_s: 5940,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("balanced", 6),
  starting_ctl: 45,
  no_history_context: {
    history_availability_state: "rich",
    goal_tier: "high",
    weeks_to_event: 7,
    goal_count: 2,
    total_horizon_weeks: 10,
    context_summary: createContextSummary(
      "rich",
      { min: 220, max: 335 },
      { min: 4, max: 6 },
      ["history_rich", "multi_goal", "two_close_a_goals"],
      0.9,
      {
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
      },
    ),
  },
};

const sameDayABPriorityProjection: BuildProjectionEngineInputShape = {
  expanded_plan: {
    start_date: "2026-03-02",
    end_date: "2026-04-26",
    blocks: [
      createBlock(
        "General build",
        "build",
        "2026-03-02",
        "2026-03-29",
        180,
        235,
      ),
      createBlock(
        "Priority-sensitive peak",
        "peak",
        "2026-03-30",
        "2026-04-12",
        215,
        260,
      ),
      createBlock("Taper", "taper", "2026-04-13", "2026-04-19", 160, 205),
      createBlock("Recovery", "recovery", "2026-04-20", "2026-04-26", 120, 155),
    ],
    goals: [
      createGoal(
        "same_day_a_b_priority",
        "a-goal",
        "Primary 5K",
        "2026-04-19",
        1,
        [
          {
            target_type: "race_performance",
            distance_m: 5000,
            target_time_s: 1320,
            activity_category: "run",
          },
        ],
      ),
      createGoal(
        "same_day_a_b_priority",
        "b-goal",
        "Secondary 10K",
        "2026-04-19",
        6,
        [
          {
            target_type: "race_performance",
            distance_m: 10000,
            target_time_s: 2820,
            activity_category: "run",
          },
        ],
      ),
    ],
  },
  normalized_creation_config: createProjectionConfig("balanced", 6),
  starting_ctl: 30,
  no_history_context: {
    history_availability_state: "sparse",
    goal_tier: "medium",
    weeks_to_event: 7,
    goal_count: 2,
    total_horizon_weeks: 8,
    context_summary: createContextSummary(
      "sparse",
      { min: 160, max: 235 },
      { min: 4, max: 5 },
      ["history_sparse", "multi_goal", "same_day_priority_conflict"],
      0.66,
      {
        recent_consistency_marker: "moderate",
        effort_confidence_marker: "moderate",
        profile_metric_completeness_marker: "high",
      },
    ),
  },
};

/**
 * Deterministic athlete scenarios used by the system-plan verification harness.
 *
 * Each fixture carries both executable projection input and audit metadata so
 * future tests can distinguish exact heuristic inputs from broader coaching-fit
 * assumptions.
 */
export const ATHLETE_SCENARIO_FIXTURES: readonly AthleteScenarioFixture[] = [
  {
    id: "beginner_no_history_5k",
    title: "Beginner no-history 5K",
    description:
      "No recent load, three-day availability, and a conservative first 5K target.",
    scenario_group: "baseline",
    primary_activity_category: "run",
    default_tolerance_class: "moderate",
    heuristic_mode: "target_seeking",
    athlete_snapshot: {
      history_availability_state: "none",
      starting_ctl: 10,
      availability_days_per_week: 3,
      max_single_session_duration_minutes: 90,
    },
    expected_plan_traits: [
      "conservative_floor",
      "short-race_specificity",
      "taper_before_primary_goal",
      "post_goal_recovery",
    ],
    projection_input: beginnerNoHistory5kProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: [
        "projection_input",
        "goal_dates",
        "starting_ctl",
        "availability_context",
      ],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "exact_5k_speed_block",
    title: "Exact 5K speed block",
    description:
      "Established runner matched directly to the curated 5K system template for exact-lane verification.",
    scenario_group: "baseline",
    primary_activity_category: "run",
    default_tolerance_class: "tight",
    heuristic_mode: "target_seeking",
    athlete_snapshot: {
      history_availability_state: "rich",
      starting_ctl: 34,
      availability_days_per_week: 5,
      max_single_session_duration_minutes: 95,
    },
    expected_plan_traits: [
      "short-race_specificity",
      "threshold_support",
      "taper_before_primary_goal",
      "post_goal_recovery",
    ],
    projection_input: exact5kSpeedBlockProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: [
        "projection_input",
        "goal_dates",
        "starting_ctl",
        "availability_context",
      ],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "recreational_sparse_10k",
    title: "Recreational sparse 10K",
    description:
      "Sparse recent consistency with realistic four-day availability and an achievable 10K goal.",
    scenario_group: "baseline",
    primary_activity_category: "run",
    default_tolerance_class: "moderate",
    heuristic_mode: "target_seeking",
    athlete_snapshot: {
      history_availability_state: "sparse",
      starting_ctl: 18,
      availability_days_per_week: 4,
      max_single_session_duration_minutes: 105,
    },
    expected_plan_traits: [
      "moderate_progression",
      "threshold_development",
      "taper_before_primary_goal",
      "post_goal_recovery",
    ],
    projection_input: recreationalSparse10kProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: ["projection_input", "goal_dates", "starting_ctl"],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "intermediate_rich_half",
    title: "Intermediate rich half",
    description:
      "Established runner with reliable history and a feasible half-marathon build.",
    scenario_group: "baseline",
    primary_activity_category: "run",
    default_tolerance_class: "tight",
    heuristic_mode: "target_seeking",
    athlete_snapshot: {
      history_availability_state: "rich",
      starting_ctl: 42,
      availability_days_per_week: 5,
    },
    expected_plan_traits: [
      "threshold_focus",
      "long-run_emphasis",
      "taper_before_primary_goal",
      "post_goal_recovery",
    ],
    projection_input: intermediateRichHalfProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: ["projection_input", "goal_dates", "starting_ctl"],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "advanced_marathon_build",
    title: "Advanced marathon build",
    description:
      "High-capacity marathon athlete with enough runway for upper-band load progression.",
    scenario_group: "baseline",
    primary_activity_category: "run",
    default_tolerance_class: "tight",
    heuristic_mode: "target_seeking",
    athlete_snapshot: {
      history_availability_state: "rich",
      starting_ctl: 60,
      availability_days_per_week: 6,
    },
    expected_plan_traits: [
      "long-run_emphasis",
      "upper_band_realism",
      "taper_before_primary_goal",
      "post_goal_recovery",
    ],
    projection_input: advancedMarathonBuildProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: ["projection_input", "goal_dates", "starting_ctl"],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "boundary_feasible_bike",
    title: "Boundary feasible bike",
    description:
      "Bike-focused threshold goal near the feasibility boundary while still target-seeking.",
    scenario_group: "baseline",
    primary_activity_category: "bike",
    default_tolerance_class: "tight",
    heuristic_mode: "target_seeking",
    athlete_snapshot: {
      history_availability_state: "rich",
      starting_ctl: 45,
      availability_days_per_week: 4,
      max_single_session_duration_minutes: 180,
    },
    expected_plan_traits: [
      "bike_specificity",
      "threshold_support",
      "long-ride_emphasis",
      "taper_before_primary_goal",
    ],
    projection_input: boundaryFeasibleBikeProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: [
        "projection_input",
        "goal_dates",
        "starting_ctl",
        "availability_context",
      ],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "low_availability_high_ambition",
    title: "Low availability high ambition",
    description:
      "Bike-focused endurance goal constrained by only three weekly training days.",
    scenario_group: "constraints",
    primary_activity_category: "bike",
    default_tolerance_class: "moderate",
    heuristic_mode: "constraint_compromise",
    athlete_snapshot: {
      history_availability_state: "sparse",
      starting_ctl: 24,
      availability_days_per_week: 3,
      max_single_session_duration_minutes: 150,
      hard_rest_days: ["monday", "friday"],
    },
    expected_plan_traits: [
      "constraint_respecting",
      "long-ride_emphasis",
      "taper_before_primary_goal",
      "post_goal_recovery",
    ],
    projection_input: lowAvailabilityHighAmbitionProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: [
        "projection_input",
        "goal_dates",
        "starting_ctl",
        "availability_context",
      ],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "infeasible_stretch_goal",
    title: "Infeasible stretch goal",
    description:
      "No-history runner aiming for a marathon on a compressed timeline.",
    scenario_group: "constraints",
    primary_activity_category: "run",
    default_tolerance_class: "flexible",
    heuristic_mode: "capacity_bounded",
    athlete_snapshot: {
      history_availability_state: "none",
      starting_ctl: 12,
      availability_days_per_week: 4,
      max_single_session_duration_minutes: 120,
    },
    expected_plan_traits: [
      "capacity_bounded",
      "timeline_limited",
      "safety_over_target_attainment",
      "post_goal_recovery",
    ],
    projection_input: infeasibleStretchGoalProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: [
        "projection_input",
        "goal_dates",
        "starting_ctl",
        "availability_context",
      ],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "masters_conservative_profile",
    title: "Masters conservative profile",
    description:
      "Older athlete with moderate history, shorter sessions, and a conservative progression target.",
    scenario_group: "constraints",
    primary_activity_category: "run",
    default_tolerance_class: "moderate",
    heuristic_mode: "constraint_compromise",
    athlete_snapshot: {
      history_availability_state: "sparse",
      starting_ctl: 26,
      availability_days_per_week: 4,
      max_single_session_duration_minutes: 90,
      hard_rest_days: ["monday", "friday"],
      age: 58,
    },
    expected_plan_traits: [
      "conservative_ramp",
      "durability_support",
      "taper_before_primary_goal",
      "post_goal_recovery",
    ],
    projection_input: mastersConservativeProfileProjection,
    preference_profile: mastersPreferenceProfile,
    audit: {
      fixture_precision: "exact",
      exact_fields: [
        "projection_input",
        "goal_dates",
        "starting_ctl",
        "availability_context",
        "age",
      ],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "b_race_before_a_race",
    title: "B race before A race",
    description:
      "Tune-up goal ahead of a primary goal, expecting a micro-taper without a full reset.",
    scenario_group: "multi_goal",
    primary_activity_category: "run",
    default_tolerance_class: "moderate",
    heuristic_mode: "priority_sensitive",
    athlete_snapshot: {
      history_availability_state: "rich",
      starting_ctl: 36,
      availability_days_per_week: 5,
    },
    expected_plan_traits: [
      "micro_taper_for_b_race",
      "priority_weighted_taper",
      "secondary_goal_rebound",
      "post_goal_recovery",
    ],
    projection_input: bRaceBeforeARaceProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: ["projection_input", "goal_dates", "starting_ctl"],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "two_close_a_goals",
    title: "Two close A goals",
    description:
      "Two same-priority goals close together, requiring a managed sustained peak.",
    scenario_group: "multi_goal",
    primary_activity_category: "run",
    default_tolerance_class: "moderate",
    heuristic_mode: "priority_sensitive",
    athlete_snapshot: {
      history_availability_state: "rich",
      starting_ctl: 45,
      availability_days_per_week: 5,
    },
    expected_plan_traits: [
      "sustained_peak_management",
      "non_chaotic_transition",
      "priority_weighted_taper",
      "post_goal_recovery",
    ],
    projection_input: twoCloseAGoalsProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: ["projection_input", "goal_dates", "starting_ctl"],
      audit_fields: [],
      limitations: [],
    },
  },
  {
    id: "same_day_a_b_priority",
    title: "Same-day A/B priority",
    description:
      "Conflicting same-day goals that should preserve priority semantics in the taper.",
    scenario_group: "multi_goal",
    primary_activity_category: "run",
    default_tolerance_class: "moderate",
    heuristic_mode: "priority_sensitive",
    athlete_snapshot: {
      history_availability_state: "sparse",
      starting_ctl: 30,
      availability_days_per_week: 4,
    },
    expected_plan_traits: [
      "same_day_priority_resolution",
      "stable_taper_logic",
      "target_favoring_primary_goal",
      "post_goal_recovery",
    ],
    projection_input: sameDayABPriorityProjection,
    audit: {
      fixture_precision: "exact",
      exact_fields: ["projection_input", "goal_dates", "starting_ctl"],
      audit_fields: [],
      limitations: [],
    },
  },
] as const;

export type AthleteScenarioFixtureId =
  (typeof ATHLETE_SCENARIO_FIXTURES)[number]["id"];

export const ATHLETE_SCENARIO_FIXTURES_BY_ID = Object.fromEntries(
  ATHLETE_SCENARIO_FIXTURES.map((fixture) => [fixture.id, fixture]),
) as Record<
  AthleteScenarioFixtureId,
  (typeof ATHLETE_SCENARIO_FIXTURES)[number]
>;
