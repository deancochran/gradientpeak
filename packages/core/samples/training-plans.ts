import { normalizeLinkedActivityPlanId } from "./template-ids";

export type SystemTrainingPlanTemplate = {
  id: string;
  name: string;
  description: string;
  sessions_per_week_target: number;
  duration_hours: number;
  structure: Record<string, unknown>;
};

type SamplePlanSession = {
  day: number;
  title: string;
  activity_plan_id: string;
};

function buildWeeklySessions(weeks: ReadonlyArray<ReadonlyArray<SamplePlanSession>>) {
  return weeks.flatMap((week, weekIndex) =>
    week.map((session) => ({
      offset_days: weekIndex * 7 + session.day,
      title: session.title,
      session_type: "planned" as const,
      activity_plan_id: session.activity_plan_id,
    })),
  );
}

function addDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildActivityDistribution(sports: readonly string[]) {
  const weight = 1 / sports.length;

  return Object.fromEntries(
    sports.map((sport) => [sport, { target_percentage: weight }]),
  ) as Record<string, { target_percentage: number }>;
}

function buildModernCompatibleTemplateStructure(input: {
  name: string;
  description: string;
  startDate: string;
  durationWeeks: number;
  sports: readonly string[];
  experienceLevel: readonly ("beginner" | "intermediate" | "advanced")[];
  weeklyTssRange: { min: number; max: number };
  sessionsPerWeekTarget: number;
  minRestDaysPerWeek: number;
  maxConsecutiveDays: number;
  sessions: unknown[];
}) {
  return {
    version: 1,
    plan_type: "maintenance" as const,
    name: input.name,
    description: input.description,
    start_date: input.startDate,
    end_date: addDays(input.startDate, input.durationWeeks * 7 - 1),
    sport: [...input.sports],
    experienceLevel: [...input.experienceLevel],
    durationWeeks: { recommended: input.durationWeeks },
    activity_distribution: buildActivityDistribution(input.sports),
    target_weekly_tss_range: input.weeklyTssRange,
    target_sessions_per_week_range: {
      min: input.sessionsPerWeekTarget,
      max: input.sessionsPerWeekTarget,
    },
    constraints: {
      min_rest_days_per_week: input.minRestDaysPerWeek,
      max_consecutive_training_days: input.maxConsecutiveDays,
    },
    target_weekly_tss_min: input.weeklyTssRange.min,
    target_weekly_tss_max: input.weeklyTssRange.max,
    target_activities_per_week: input.sessionsPerWeekTarget,
    max_consecutive_days: input.maxConsecutiveDays,
    min_rest_days_per_week: input.minRestDaysPerWeek,
    sessions: input.sessions,
  };
}

const RUN_EASY_ID = "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e";
const RUN_AEROBIC_ID = "3b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e";
const RUN_TEMPO_ID = "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f";
const RUN_THRESHOLD_ID = "c7d3e6f5-0a4b-9c8d-3e2f-4a1b7c6d5e3a";
const RUN_LONG_ID = "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b";
const RUN_RACE_PACE_LONG_ID = "7e5f8a9b-1c4d-4e6f-8a2b-9c1d3e5f7a9b";
const RUN_SPEED_ID = "0a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d";
const RUN_5K_PACE_ID = "4c7d8e9f-0a1b-2c3d-4e5f-6a7b8c9d0e1f";

const BIKE_ENDURANCE_ID = "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f";
const BIKE_SWEET_SPOT_ID = "9d2e3f4a-5b6c-7d8e-9f0a-1b2c3d4e5f6a";
const BIKE_RECOVERY_ID = "9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e";
const BIKE_CLIMBING_ID = "1f4a5b6c-7d8e-9f0a-1b2c-3d4e5f6a7b8c";
const BIKE_LONG_ID = "a5f1b4c3-8e2b-7a6d-1c0f-2e9d5b4a3c1e";
const BIKE_PROGRESSIVE_LONG_ID = "6f2a4c8e-1b3d-4f6a-8c9e-2d4b6f8a1c3e";

const MARATHON_FOUNDATION_WEEKS = [
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Steady Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Progression Tempo", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Steady Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 0, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 2, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Steady Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Maintenance", activity_plan_id: RUN_TEMPO_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Steady Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 0, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 2, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Steady Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Steady Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Maintenance", activity_plan_id: RUN_TEMPO_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Steady Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 0, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 2, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Steady Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Steady Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Tempo Primer", activity_plan_id: RUN_TEMPO_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
] as const;

const HALF_MARATHON_BUILD_WEEKS = [
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    {
      day: 3,
      title: "Threshold Intervals",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    { day: 5, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    {
      day: 3,
      title: "Threshold Development",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    {
      day: 3,
      title: "Threshold Intervals",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
    { day: 5, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    {
      day: 5,
      title: "Threshold Intervals",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
    {
      day: 6,
      title: "Race-Pace Long Run",
      activity_plan_id: RUN_RACE_PACE_LONG_ID,
    },
  ],
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    {
      day: 3,
      title: "Threshold Intervals",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
    { day: 5, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 3, title: "Tempo Run", activity_plan_id: RUN_TEMPO_ID },
    {
      day: 5,
      title: "Threshold Intervals",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
    {
      day: 6,
      title: "Race-Pace Long Run",
      activity_plan_id: RUN_RACE_PACE_LONG_ID,
    },
  ],
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    {
      day: 3,
      title: "Threshold Development",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Run", activity_plan_id: RUN_AEROBIC_ID },
    { day: 3, title: "Tempo Tune-Up", activity_plan_id: RUN_TEMPO_ID },
    { day: 6, title: "Long Run", activity_plan_id: RUN_LONG_ID },
  ],
] as const;

const FIVE_K_SPEED_BLOCK_WEEKS = [
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "VO2 Intervals", activity_plan_id: RUN_SPEED_ID },
    { day: 5, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    {
      day: 6,
      title: "Threshold Repeats",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    {
      day: 3,
      title: "Race-Pace Session",
      activity_plan_id: RUN_5K_PACE_ID,
    },
    { day: 5, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 6, title: "Speed Session", activity_plan_id: RUN_SPEED_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    {
      day: 3,
      title: "Threshold Repeats",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
    { day: 5, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    {
      day: 6,
      title: "Race-Pace Session",
      activity_plan_id: RUN_5K_PACE_ID,
    },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "VO2 Intervals", activity_plan_id: RUN_SPEED_ID },
    {
      day: 6,
      title: "Race-Pace Session",
      activity_plan_id: RUN_5K_PACE_ID,
    },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "VO2 Intervals", activity_plan_id: RUN_SPEED_ID },
    {
      day: 5,
      title: "Easy Run",
      activity_plan_id: RUN_EASY_ID,
    },
    {
      day: 6,
      title: "Race-Pace Session",
      activity_plan_id: RUN_5K_PACE_ID,
    },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    {
      day: 3,
      title: "Race-Pace Session",
      activity_plan_id: RUN_5K_PACE_ID,
    },
    { day: 5, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 6, title: "Speed Session", activity_plan_id: RUN_SPEED_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    {
      day: 3,
      title: "Threshold Repeats",
      activity_plan_id: RUN_THRESHOLD_ID,
    },
    { day: 5, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 6, title: "Time Trial", activity_plan_id: RUN_5K_PACE_ID },
  ],
  [
    { day: 1, title: "Easy Run", activity_plan_id: RUN_EASY_ID },
    { day: 3, title: "Speed Primer", activity_plan_id: RUN_SPEED_ID },
    { day: 6, title: "Time Trial", activity_plan_id: RUN_5K_PACE_ID },
  ],
] as const;

const CYCLING_ENDURANCE_BUILDER_WEEKS = [
  [
    {
      day: 1,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 3,
      title: "Sweet Spot Ride",
      activity_plan_id: BIKE_SWEET_SPOT_ID,
    },
    {
      day: 5,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    {
      day: 6,
      title: "Progressive Long Ride",
      activity_plan_id: BIKE_PROGRESSIVE_LONG_ID,
    },
  ],
  [
    {
      day: 1,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 3,
      title: "Climbing Intervals",
      activity_plan_id: BIKE_CLIMBING_ID,
    },
    {
      day: 5,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    {
      day: 6,
      title: "Progressive Long Ride",
      activity_plan_id: BIKE_PROGRESSIVE_LONG_ID,
    },
  ],
  [
    {
      day: 0,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 2,
      title: "Sweet Spot Ride",
      activity_plan_id: BIKE_SWEET_SPOT_ID,
    },
    {
      day: 5,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    {
      day: 6,
      title: "Progressive Long Ride",
      activity_plan_id: BIKE_PROGRESSIVE_LONG_ID,
    },
  ],
  [
    {
      day: 1,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 4,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    { day: 6, title: "Long Ride", activity_plan_id: BIKE_LONG_ID },
  ],
  [
    {
      day: 1,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 3,
      title: "Sweet Spot Ride",
      activity_plan_id: BIKE_SWEET_SPOT_ID,
    },
    {
      day: 5,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    { day: 6, title: "Long Ride", activity_plan_id: BIKE_LONG_ID },
  ],
  [
    {
      day: 0,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 2,
      title: "Climbing Intervals",
      activity_plan_id: BIKE_CLIMBING_ID,
    },
    {
      day: 5,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    { day: 6, title: "Long Ride", activity_plan_id: BIKE_LONG_ID },
  ],
  [
    {
      day: 1,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 3,
      title: "Sweet Spot Ride",
      activity_plan_id: BIKE_SWEET_SPOT_ID,
    },
    {
      day: 5,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    { day: 6, title: "Long Ride", activity_plan_id: BIKE_LONG_ID },
  ],
  [
    {
      day: 1,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 4,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    { day: 6, title: "Long Ride", activity_plan_id: BIKE_LONG_ID },
  ],
  [
    {
      day: 1,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 3,
      title: "Sweet Spot Ride",
      activity_plan_id: BIKE_SWEET_SPOT_ID,
    },
    {
      day: 5,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    { day: 6, title: "Long Ride", activity_plan_id: BIKE_LONG_ID },
  ],
  [
    {
      day: 0,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 2,
      title: "Climbing Intervals",
      activity_plan_id: BIKE_CLIMBING_ID,
    },
    {
      day: 5,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    { day: 6, title: "Long Ride", activity_plan_id: BIKE_LONG_ID },
  ],
  [
    {
      day: 1,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 3,
      title: "Sweet Spot Ride",
      activity_plan_id: BIKE_SWEET_SPOT_ID,
    },
    {
      day: 5,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    { day: 6, title: "Long Ride", activity_plan_id: BIKE_LONG_ID },
  ],
  [
    {
      day: 1,
      title: "Endurance Ride",
      activity_plan_id: BIKE_ENDURANCE_ID,
    },
    {
      day: 4,
      title: "Recovery Spin",
      activity_plan_id: BIKE_RECOVERY_ID,
    },
    { day: 6, title: "Long Ride", activity_plan_id: BIKE_LONG_ID },
  ],
] as const;

const RAW_SAMPLE_PLANS: SystemTrainingPlanTemplate[] = [
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913001",
    name: "Marathon Foundation (12 weeks)",
    description:
      "Progressive marathon base with four key sessions per week and one weekly long run.",
    sessions_per_week_target: 4,
    duration_hours: 3.6,
    structure: buildModernCompatibleTemplateStructure({
      name: "Marathon Foundation (12 weeks)",
      description:
        "Progressive marathon base with four key sessions per week and one weekly long run.",
      startDate: "2026-01-05",
      durationWeeks: 12,
      sports: ["run"],
      experienceLevel: ["beginner"],
      weeklyTssRange: { min: 280, max: 420 },
      sessionsPerWeekTarget: 4,
      minRestDaysPerWeek: 2,
      maxConsecutiveDays: 3,
      sessions: buildWeeklySessions(MARATHON_FOUNDATION_WEEKS),
    }),
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913002",
    name: "Half Marathon Build (10 weeks)",
    description:
      "Balanced half-marathon cycle with threshold development and race-specific long efforts.",
    sessions_per_week_target: 4,
    duration_hours: 4,
    structure: buildModernCompatibleTemplateStructure({
      name: "Half Marathon Build (10 weeks)",
      description:
        "Balanced half-marathon cycle with threshold development and race-specific long efforts.",
      startDate: "2026-02-02",
      durationWeeks: 10,
      sports: ["run"],
      experienceLevel: ["intermediate"],
      weeklyTssRange: { min: 240, max: 360 },
      sessionsPerWeekTarget: 4,
      minRestDaysPerWeek: 2,
      maxConsecutiveDays: 3,
      sessions: buildWeeklySessions(HALF_MARATHON_BUILD_WEEKS),
    }),
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913003",
    name: "5K Speed Block (8 weeks)",
    description:
      "Short race cycle emphasizing quality intervals, neuromuscular speed, and recovery balance.",
    sessions_per_week_target: 4,
    duration_hours: 3.3,
    structure: buildModernCompatibleTemplateStructure({
      name: "5K Speed Block (8 weeks)",
      description:
        "Short race cycle emphasizing quality intervals, neuromuscular speed, and recovery balance.",
      startDate: "2026-03-02",
      durationWeeks: 8,
      sports: ["run"],
      experienceLevel: ["intermediate"],
      weeklyTssRange: { min: 180, max: 240 },
      sessionsPerWeekTarget: 4,
      minRestDaysPerWeek: 2,
      maxConsecutiveDays: 2,
      sessions: buildWeeklySessions(FIVE_K_SPEED_BLOCK_WEEKS),
    }),
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913004",
    name: "Cycling Endurance Builder (12 weeks)",
    description:
      "Endurance-focused bike progression with two quality rides and one long weekend ride.",
    sessions_per_week_target: 4,
    duration_hours: 5.1,
    structure: buildModernCompatibleTemplateStructure({
      name: "Cycling Endurance Builder (12 weeks)",
      description:
        "Endurance-focused bike progression with two quality rides and one long weekend ride.",
      startDate: "2026-01-12",
      durationWeeks: 12,
      sports: ["bike"],
      experienceLevel: ["beginner", "intermediate"],
      weeklyTssRange: { min: 220, max: 280 },
      sessionsPerWeekTarget: 4,
      minRestDaysPerWeek: 2,
      maxConsecutiveDays: 3,
      sessions: buildWeeklySessions(CYCLING_ENDURANCE_BUILDER_WEEKS),
    }),
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913005",
    name: "Sprint Triathlon Base (10 weeks)",
    description: "Triathlon starter cycle balancing swim, bike, run, and weekly brick practice.",
    sessions_per_week_target: 5,
    duration_hours: 8,
    structure: buildModernCompatibleTemplateStructure({
      name: "Sprint Triathlon Base (10 weeks)",
      description: "Triathlon starter cycle balancing swim, bike, run, and weekly brick practice.",
      startDate: "2026-02-09",
      durationWeeks: 10,
      sports: ["swim", "bike", "run"],
      experienceLevel: ["beginner"],
      weeklyTssRange: { min: 260, max: 390 },
      sessionsPerWeekTarget: 5,
      minRestDaysPerWeek: 1,
      maxConsecutiveDays: 3,
      sessions: [
        {
          offset_days: 1,
          title: "Swim Technique",
          session_type: "planned",
          activity_plan_id: "6c9d0e1f-2a3b-4c5d-6e7f-8a9b0c1d2e3f",
        },
        {
          offset_days: 2,
          title: "Bike Endurance",
          session_type: "planned",
          activity_plan_id: "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
        },
        {
          offset_days: 4,
          title: "Run Intervals",
          session_type: "planned",
          activity_plan_id: "0a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
        },
        {
          offset_days: 5,
          title: "Swim Endurance",
          session_type: "planned",
          activity_plan_id: "7d0e1f2a-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
        },
        {
          offset_days: 6,
          title: "Brick Session",
          session_type: "planned",
          activity_plan_id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
        },
        {
          offset_days: 8,
          title: "Swim Technique",
          session_type: "planned",
          activity_plan_id: "6c9d0e1f-2a3b-4c5d-6e7f-8a9b0c1d2e3f",
        },
        {
          offset_days: 9,
          title: "Bike Tempo",
          session_type: "planned",
          activity_plan_id: "0e3f4a5b-6c7d-8e9f-0a1b-2c3d4e5f6a7b",
        },
        {
          offset_days: 11,
          title: "Run Endurance",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 12,
          title: "Swim Endurance",
          session_type: "planned",
          activity_plan_id: "7d0e1f2a-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
        },
        {
          offset_days: 13,
          title: "Brick Session",
          session_type: "planned",
          activity_plan_id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
        },
      ],
    }),
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913006",
    name: "General Fitness Maintenance (6 weeks)",
    description:
      "Low-friction maintenance template to stay consistent with mixed aerobic and strength sessions.",
    sessions_per_week_target: 3,
    duration_hours: 5.5,
    structure: buildModernCompatibleTemplateStructure({
      name: "General Fitness Maintenance (6 weeks)",
      description:
        "Low-friction maintenance template to stay consistent with mixed aerobic and strength sessions.",
      startDate: "2026-01-05",
      durationWeeks: 6,
      sports: ["run", "strength", "bike"],
      experienceLevel: ["beginner", "intermediate"],
      weeklyTssRange: { min: 180, max: 280 },
      sessionsPerWeekTarget: 3,
      minRestDaysPerWeek: 2,
      maxConsecutiveDays: 2,
      sessions: [
        {
          offset_days: 1,
          title: "Aerobic Session",
          session_type: "planned",
          activity_plan_id: "7b0c1d2e-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
        },
        {
          offset_days: 3,
          title: "Strength Session",
          session_type: "planned",
          activity_plan_id: "aaaa1111-2222-3333-4444-555555555555",
        },
        {
          offset_days: 5,
          title: "Long Easy Session",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 8,
          title: "Aerobic Session",
          session_type: "planned",
          activity_plan_id: "7b0c1d2e-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
        },
        {
          offset_days: 10,
          title: "Strength Session",
          session_type: "planned",
          activity_plan_id: "aaaa1111-2222-3333-4444-555555555555",
        },
        {
          offset_days: 12,
          title: "Long Easy Session",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 15,
          title: "Aerobic Session",
          session_type: "planned",
          activity_plan_id: "7b0c1d2e-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
        },
        {
          offset_days: 17,
          title: "Strength Session",
          session_type: "planned",
          activity_plan_id: "aaaa1111-2222-3333-4444-555555555555",
        },
        {
          offset_days: 19,
          title: "Long Easy Session",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
      ],
    }),
  },
];

function normalizeStructureActivityPlanIds(value: unknown): Record<string, unknown> {
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => rewrite(item));
    }

    if (!node || typeof node !== "object") {
      return node;
    }

    const record = node as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, rawValue] of Object.entries(record)) {
      if (key === "activity_plan_id" && typeof rawValue === "string") {
        output[key] = normalizeLinkedActivityPlanId(rawValue);
        continue;
      }

      output[key] = rewrite(rawValue);
    }

    return output;
  };

  return rewrite(value) as Record<string, unknown>;
}

export const ALL_SAMPLE_PLANS: SystemTrainingPlanTemplate[] = RAW_SAMPLE_PLANS.map((plan) => ({
  ...plan,
  structure: normalizeStructureActivityPlanIds(plan.structure),
}));
