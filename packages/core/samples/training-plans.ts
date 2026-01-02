/**
 * Sample training plan templates using the new goals+blocks schema
 * These can be used as system templates or starting points for users
 */

import type {
  PeriodizedPlan,
  MaintenancePlan,
} from "../schemas/training_plan_structure";

/**
 * 18-Week Beginner Marathon Training Plan
 */
export const MARATHON_BEGINNER_18_WEEK: Omit<
  PeriodizedPlan,
  "created_at" | "updated_at"
> = {
  plan_type: "periodized",
  id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  name: "Marathon - Beginner (18 weeks)",
  description:
    "16-18 week plan for first-time marathoners focusing on building endurance safely",
  start_date: "2025-01-06",
  end_date: "2025-05-11",
  goals: [
    {
      id: "goal-1",
      name: "First Marathon",
      target_date: "2025-05-11",
      priority: 1,
      target_performance: "Finish strong",
      notes: "Focus on finishing, not time",
    },
  ],
  fitness_progression: {
    starting_ctl: 40,
    target_ctl_at_peak: 75,
  },
  activity_distribution: {
    running: {
      target_percentage: 0.85,
      min_percentage: 0.8,
      max_percentage: 0.9,
    },
    strength: {
      target_percentage: 0.15,
      min_percentage: 0.1,
      max_percentage: 0.2,
    },
  },
  constraints: {
    max_hours_per_week: 10,
    max_sessions_per_week: 5,
    min_rest_days_per_week: 2,
    max_consecutive_training_days: 5,
    available_days: ["tuesday", "wednesday", "thursday", "saturday", "sunday"],
  },
  blocks: [
    {
      id: "block-1",
      name: "Base Building",
      start_date: "2025-01-06",
      end_date: "2025-02-16",
      goal_ids: ["goal-1"],
      phase: "base",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 240,
        max: 300,
      },
      target_sessions_per_week_range: {
        min: 4,
        max: 5,
      },
      description: "Build aerobic foundation with easy miles",
    },
    {
      id: "block-2",
      name: "Build Phase",
      start_date: "2025-02-17",
      end_date: "2025-04-20",
      goal_ids: ["goal-1"],
      phase: "build",
      intensity_distribution: {
        easy: 0.7,
        moderate: 0.2,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 300,
        max: 380,
      },
      target_sessions_per_week_range: {
        min: 5,
        max: 6,
      },
      description: "Introduce tempo runs and longer long runs",
    },
    {
      id: "block-3",
      name: "Taper",
      start_date: "2025-04-21",
      end_date: "2025-05-11",
      goal_ids: ["goal-1"],
      phase: "taper",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 150,
        max: 200,
      },
      target_sessions_per_week_range: {
        min: 3,
        max: 4,
      },
      description: "Reduce volume while maintaining intensity",
    },
  ],
  is_active: false,
};

/**
 * 18-Week Intermediate Marathon Training Plan
 */
export const MARATHON_INTERMEDIATE_18_WEEK: Omit<
  PeriodizedPlan,
  "created_at" | "updated_at"
> = {
  plan_type: "periodized",
  id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
  name: "Marathon - Intermediate (18 weeks)",
  description:
    "16-18 week plan for runners with marathon experience seeking improvement",
  start_date: "2025-01-06",
  end_date: "2025-05-11",
  goals: [
    {
      id: "goal-2",
      name: "Marathon PR",
      target_date: "2025-05-11",
      priority: 1,
      target_performance: "Sub 3:30",
      notes: "Beat previous time by 10+ minutes",
    },
  ],
  fitness_progression: {
    starting_ctl: 60,
    target_ctl_at_peak: 95,
  },
  activity_distribution: {
    running: {
      target_percentage: 0.8,
      min_percentage: 0.75,
      max_percentage: 0.85,
    },
    strength: {
      target_percentage: 0.15,
      min_percentage: 0.1,
      max_percentage: 0.2,
    },
    mobility: {
      target_percentage: 0.05,
      min_percentage: 0.03,
      max_percentage: 0.07,
    },
  },
  constraints: {
    max_hours_per_week: 14,
    max_sessions_per_week: 7,
    min_rest_days_per_week: 1,
    max_consecutive_training_days: 6,
  },
  blocks: [
    {
      id: "block-4",
      name: "Base Building",
      start_date: "2025-01-06",
      end_date: "2025-02-02",
      goal_ids: ["goal-2"],
      phase: "base",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 350,
        max: 420,
      },
      target_sessions_per_week_range: {
        min: 5,
        max: 6,
      },
      description: "Rebuild aerobic base",
    },
    {
      id: "block-5",
      name: "Build Phase 1",
      start_date: "2025-02-03",
      end_date: "2025-03-09",
      goal_ids: ["goal-2"],
      phase: "build",
      intensity_distribution: {
        easy: 0.7,
        moderate: 0.2,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 420,
        max: 500,
      },
      target_sessions_per_week_range: {
        min: 6,
        max: 7,
      },
      description: "Increase volume with tempo and threshold work",
    },
    {
      id: "block-6",
      name: "Build Phase 2",
      start_date: "2025-03-10",
      end_date: "2025-04-13",
      goal_ids: ["goal-2"],
      phase: "build",
      intensity_distribution: {
        easy: 0.7,
        moderate: 0.2,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 480,
        max: 560,
      },
      target_sessions_per_week_range: {
        min: 6,
        max: 7,
      },
      description: "Peak volume with race-specific workouts",
    },
    {
      id: "block-7",
      name: "Taper",
      start_date: "2025-04-14",
      end_date: "2025-05-11",
      goal_ids: ["goal-2"],
      phase: "taper",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 200,
        max: 280,
      },
      target_sessions_per_week_range: {
        min: 4,
        max: 5,
      },
      description: "Sharpen for race day",
    },
  ],
  is_active: false,
};

/**
 * 12-Week Half Marathon Training Plan
 */
export const HALF_MARATHON_12_WEEK: Omit<
  PeriodizedPlan,
  "created_at" | "updated_at"
> = {
  plan_type: "periodized",
  id: "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
  name: "Half Marathon (12 weeks)",
  description: "12-14 week plan for half marathon",
  start_date: "2025-02-17",
  end_date: "2025-05-11",
  goals: [
    {
      id: "goal-3",
      name: "Half Marathon",
      target_date: "2025-05-11",
      priority: 1,
      target_performance: "Sub 1:45",
    },
  ],
  fitness_progression: {
    starting_ctl: 50,
    target_ctl_at_peak: 80,
  },
  activity_distribution: {
    running: {
      target_percentage: 0.9,
      min_percentage: 0.85,
      max_percentage: 0.95,
    },
    strength: {
      target_percentage: 0.1,
      min_percentage: 0.05,
      max_percentage: 0.15,
    },
  },
  constraints: {
    max_hours_per_week: 10,
    max_sessions_per_week: 6,
    min_rest_days_per_week: 1,
  },
  blocks: [
    {
      id: "block-8",
      name: "Base Building",
      start_date: "2025-02-17",
      end_date: "2025-03-23",
      goal_ids: ["goal-3"],
      phase: "base",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 280,
        max: 350,
      },
      target_sessions_per_week_range: {
        min: 4,
        max: 6,
      },
      description: "Build endurance foundation",
    },
    {
      id: "block-9",
      name: "Build Phase",
      start_date: "2025-03-24",
      end_date: "2025-04-27",
      goal_ids: ["goal-3"],
      phase: "build",
      intensity_distribution: {
        easy: 0.7,
        moderate: 0.2,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 350,
        max: 440,
      },
      target_sessions_per_week_range: {
        min: 5,
        max: 7,
      },
      description: "Increase intensity and volume",
    },
    {
      id: "block-10",
      name: "Taper",
      start_date: "2025-04-28",
      end_date: "2025-05-11",
      goal_ids: ["goal-3"],
      phase: "taper",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 180,
        max: 240,
      },
      target_sessions_per_week_range: {
        min: 3,
        max: 5,
      },
      description: "Peak for race day",
    },
  ],
  is_active: false,
};

/**
 * 10-Week 5K/10K Training Plan
 */
export const RACE_5K_10K_10_WEEK: Omit<
  PeriodizedPlan,
  "created_at" | "updated_at"
> = {
  plan_type: "periodized",
  id: "d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a",
  name: "5K/10K (10 weeks)",
  description: "8-12 week plan for 5K or 10K races",
  start_date: "2025-03-03",
  end_date: "2025-05-11",
  goals: [
    {
      id: "goal-4",
      name: "10K Race",
      target_date: "2025-05-11",
      priority: 1,
      target_performance: "Sub 45:00",
    },
  ],
  fitness_progression: {
    starting_ctl: 45,
    target_ctl_at_peak: 70,
  },
  activity_distribution: {
    running: {
      target_percentage: 0.85,
      min_percentage: 0.8,
      max_percentage: 0.9,
    },
    strength: {
      target_percentage: 0.15,
      min_percentage: 0.1,
      max_percentage: 0.2,
    },
  },
  constraints: {
    max_hours_per_week: 8,
    max_sessions_per_week: 6,
    min_rest_days_per_week: 1,
  },
  blocks: [
    {
      id: "block-11",
      name: "Base",
      start_date: "2025-03-03",
      end_date: "2025-03-23",
      goal_ids: ["goal-4"],
      phase: "base",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 250,
        max: 315,
      },
      target_sessions_per_week_range: {
        min: 4,
        max: 6,
      },
      description: "Aerobic foundation",
    },
    {
      id: "block-12",
      name: "Build",
      start_date: "2025-03-24",
      end_date: "2025-04-27",
      goal_ids: ["goal-4"],
      phase: "build",
      intensity_distribution: {
        easy: 0.7,
        moderate: 0.2,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 315,
        max: 385,
      },
      target_sessions_per_week_range: {
        min: 5,
        max: 7,
      },
      description: "VO2max and speed work",
    },
    {
      id: "block-13",
      name: "Taper",
      start_date: "2025-04-28",
      end_date: "2025-05-11",
      goal_ids: ["goal-4"],
      phase: "taper",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 150,
        max: 200,
      },
      target_sessions_per_week_range: {
        min: 3,
        max: 5,
      },
      description: "Race preparation",
    },
  ],
  is_active: false,
};

/**
 * 14-Week Century Ride Training Plan
 */
export const CYCLING_CENTURY_14_WEEK: Omit<
  PeriodizedPlan,
  "created_at" | "updated_at"
> = {
  plan_type: "periodized",
  id: "e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b",
  name: "Century Ride (14 weeks)",
  description: "12-16 week plan for century ride",
  start_date: "2025-02-03",
  end_date: "2025-05-11",
  goals: [
    {
      id: "goal-5",
      name: "Century Ride (100 miles)",
      target_date: "2025-05-11",
      priority: 1,
      target_performance: "Complete 100 miles",
    },
  ],
  fitness_progression: {
    starting_ctl: 55,
    target_ctl_at_peak: 85,
  },
  activity_distribution: {
    cycling: {
      target_percentage: 0.85,
      min_percentage: 0.8,
      max_percentage: 0.9,
    },
    strength: {
      target_percentage: 0.15,
      min_percentage: 0.1,
      max_percentage: 0.2,
    },
  },
  constraints: {
    max_hours_per_week: 12,
    max_sessions_per_week: 6,
    min_rest_days_per_week: 1,
  },
  blocks: [
    {
      id: "block-14",
      name: "Base",
      start_date: "2025-02-03",
      end_date: "2025-03-16",
      goal_ids: ["goal-5"],
      phase: "base",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 320,
        max: 385,
      },
      target_sessions_per_week_range: {
        min: 4,
        max: 6,
      },
      description: "Build endurance with long rides",
    },
    {
      id: "block-15",
      name: "Build",
      start_date: "2025-03-17",
      end_date: "2025-04-27",
      goal_ids: ["goal-5"],
      phase: "build",
      intensity_distribution: {
        easy: 0.7,
        moderate: 0.2,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 385,
        max: 465,
      },
      target_sessions_per_week_range: {
        min: 5,
        max: 7,
      },
      description: "Increase ride duration and climbing",
    },
    {
      id: "block-16",
      name: "Taper",
      start_date: "2025-04-28",
      end_date: "2025-05-11",
      goal_ids: ["goal-5"],
      phase: "taper",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 190,
        max: 250,
      },
      target_sessions_per_week_range: {
        min: 3,
        max: 5,
      },
      description: "Recovery before event",
    },
  ],
  is_active: false,
};

/**
 * 10-Week Sprint Triathlon Training Plan
 */
export const TRIATHLON_SPRINT_10_WEEK: Omit<
  PeriodizedPlan,
  "created_at" | "updated_at"
> = {
  plan_type: "periodized",
  id: "f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c",
  name: "Sprint Triathlon (10 weeks)",
  description: "8-12 week sprint triathlon plan",
  start_date: "2025-03-03",
  end_date: "2025-05-11",
  goals: [
    {
      id: "goal-6",
      name: "Sprint Triathlon",
      target_date: "2025-05-11",
      priority: 1,
      target_performance: "Complete sprint distance",
    },
  ],
  fitness_progression: {
    starting_ctl: 50,
    target_ctl_at_peak: 75,
  },
  activity_distribution: {
    running: {
      target_percentage: 0.35,
      min_percentage: 0.3,
      max_percentage: 0.4,
    },
    cycling: {
      target_percentage: 0.35,
      min_percentage: 0.3,
      max_percentage: 0.4,
    },
    swimming: {
      target_percentage: 0.2,
      min_percentage: 0.15,
      max_percentage: 0.25,
    },
    strength: {
      target_percentage: 0.1,
      min_percentage: 0.05,
      max_percentage: 0.15,
    },
  },
  constraints: {
    max_hours_per_week: 10,
    max_sessions_per_week: 7,
    min_rest_days_per_week: 1,
  },
  blocks: [
    {
      id: "block-17",
      name: "Base",
      start_date: "2025-03-03",
      end_date: "2025-03-23",
      goal_ids: ["goal-6"],
      phase: "base",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 280,
        max: 350,
      },
      target_sessions_per_week_range: {
        min: 5,
        max: 7,
      },
      description: "Build fitness across all three sports",
    },
    {
      id: "block-18",
      name: "Build",
      start_date: "2025-03-24",
      end_date: "2025-04-27",
      goal_ids: ["goal-6"],
      phase: "build",
      intensity_distribution: {
        easy: 0.7,
        moderate: 0.2,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 350,
        max: 440,
      },
      target_sessions_per_week_range: {
        min: 6,
        max: 7,
      },
      description: "Race-specific intensity and brick workouts",
    },
    {
      id: "block-19",
      name: "Taper",
      start_date: "2025-04-28",
      end_date: "2025-05-11",
      goal_ids: ["goal-6"],
      phase: "taper",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 170,
        max: 230,
      },
      target_sessions_per_week_range: {
        min: 4,
        max: 5,
      },
      description: "Rest for race day",
    },
  ],
  is_active: false,
};

/**
 * 8-Week Base Building Plan
 */
export const BASE_BUILDING_8_WEEK: Omit<
  PeriodizedPlan,
  "created_at" | "updated_at"
> = {
  plan_type: "periodized",
  id: "a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d",
  name: "Base Building (8 weeks)",
  description: "Flexible base building phase (4-12 weeks)",
  start_date: "2025-03-17",
  end_date: "2025-05-11",
  goals: [
    {
      id: "goal-7",
      name: "Build Aerobic Base",
      target_date: "2025-05-11",
      priority: 1,
      notes: "Foundation for future training",
    },
  ],
  fitness_progression: {
    starting_ctl: 35,
    target_ctl_at_peak: 55,
  },
  activity_distribution: {
    running: {
      target_percentage: 0.6,
      min_percentage: 0.5,
      max_percentage: 0.7,
    },
    cycling: {
      target_percentage: 0.25,
      min_percentage: 0.15,
      max_percentage: 0.35,
    },
    strength: {
      target_percentage: 0.15,
      min_percentage: 0.1,
      max_percentage: 0.2,
    },
  },
  constraints: {
    max_hours_per_week: 8,
    max_sessions_per_week: 5,
    min_rest_days_per_week: 2,
  },
  blocks: [
    {
      id: "block-20",
      name: "Base Building",
      start_date: "2025-03-17",
      end_date: "2025-05-11",
      goal_ids: ["goal-7"],
      phase: "base",
      intensity_distribution: {
        easy: 0.8,
        moderate: 0.1,
        hard: 0.1,
      },
      target_weekly_tss_range: {
        min: 210,
        max: 280,
      },
      target_sessions_per_week_range: {
        min: 4,
        max: 5,
      },
      description: "Build aerobic foundation",
    },
  ],
  is_active: false,
};

/**
 * Maintenance Training Plan
 */
export const MAINTENANCE_GENERAL: Omit<
  MaintenancePlan,
  "created_at" | "updated_at"
> = {
  plan_type: "maintenance",
  id: "b8c9d0e1-f2a3-4b4c-5d6e-7f8a9b0c1d2e",
  name: "General Fitness Maintenance",
  description: "Maintain fitness without specific event goal",
  start_date: "2025-01-06",
  end_date: "2025-12-31",
  target_ctl_range: {
    min: 45,
    max: 55,
  },
  intensity_distribution: {
    easy: 0.7,
    moderate: 0.2,
    hard: 0.1,
  },
  target_weekly_tss_range: {
    min: 280,
    max: 350,
  },
  target_sessions_per_week_range: {
    min: 4,
    max: 6,
  },
  activity_distribution: {
    running: {
      target_percentage: 0.5,
      min_percentage: 0.4,
      max_percentage: 0.6,
    },
    cycling: {
      target_percentage: 0.25,
      min_percentage: 0.15,
      max_percentage: 0.35,
    },
    strength: {
      target_percentage: 0.15,
      min_percentage: 0.1,
      max_percentage: 0.2,
    },
    swimming: {
      target_percentage: 0.1,
      min_percentage: 0.05,
      max_percentage: 0.15,
    },
  },
  constraints: {
    max_hours_per_week: 10,
    max_sessions_per_week: 6,
    min_rest_days_per_week: 1,
  },
  is_active: false,
};

/**
 * Export all sample plans as an array for easy iteration
 */
export const ALL_SAMPLE_PLANS = [
  MARATHON_BEGINNER_18_WEEK,
  MARATHON_INTERMEDIATE_18_WEEK,
  HALF_MARATHON_12_WEEK,
  RACE_5K_10K_10_WEEK,
  CYCLING_CENTURY_14_WEEK,
  TRIATHLON_SPRINT_10_WEEK,
  BASE_BUILDING_8_WEEK,
  MAINTENANCE_GENERAL,
];
