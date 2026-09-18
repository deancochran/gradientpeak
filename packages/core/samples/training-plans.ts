import type { TrainingPlan } from "../schemas";
import { sha256Uuid } from "../utils/sha256";

export type SystemTrainingPlanTemplate = {
  id: string;
  name: string;
  description: string;
  sessions_per_week_target: number;
  duration_hours: number;
  structure: TrainingPlan;
};

type SamplePlanSession = {
  day: number;
  title: string;
  activity_plan_id: string;
};

type SampleSessionDemand = TrainingPlan["sessions"][number]["demand"];

function buildWeeklySessions(weeks: ReadonlyArray<ReadonlyArray<SamplePlanSession>>) {
  return weeks.flatMap((week, weekIndex) =>
    week.map((session, sessionIndex) => ({
      id: sha256Uuid(
        `sample-training-session:${weekIndex}:${sessionIndex}:${session.day}:${session.activity_plan_id}:${session.title}`,
      ),
      offset_days: weekIndex * 7 + session.day,
      activity_plan_id: session.activity_plan_id,
      demand: demandForSampleSession({ session, weekIndex, totalWeeks: weeks.length }),
      event_overrides: {
        title: session.title,
      },
    })),
  );
}

function buildModernCompatibleTemplateStructure(input: {
  name: string;
  description: string;
  startDate: string;
  durationWeeks: number;
  activity_categories: readonly string[];
  experienceLevel: readonly ("beginner" | "intermediate" | "advanced")[];
  weeklyLoadRange: { min: number; max: number };
  sessionsPerWeekTarget: number;
  minRestDaysPerWeek: number;
  maxConsecutiveDays: number;
  maximumSessionDurationMinutes?: number;
  sessions: unknown[];
}) {
  return {
    version: 1,
    activity_category: [...input.activity_categories],
    experienceLevel: [...input.experienceLevel],
    durationWeeks: { recommended: input.durationWeeks },
    plan_preferences: {
      weekly_session_count: input.sessionsPerWeekTarget,
      target_weekly_duration_minutes: null,
      maximum_session_duration_minutes: input.maximumSessionDurationMinutes ?? null,
      preferred_weekdays: [],
      rest_days: [],
      progression_style: null,
      recovery_priority: null,
    },
    sessions: input.sessions,
  };
}

const RUN_EASY_ID = "1b4c5d6e-7f8a-4b0c-9d2e-3f4a5b6c7d8e";
const RUN_AEROBIC_ID = "3b6c7d8e-9f0a-4b2c-bd4e-5f6a7b8c9d0e";
const RUN_TEMPO_ID = "b6c2d5e4-9f3a-4b7c-ad1e-3f0a6b5c4d2f";
const RUN_THRESHOLD_ID = "c7d3e6f5-0a4b-4c8d-be2f-4a1b7c6d5e3a";
const RUN_LONG_ID = "d8e4f7a6-1b5c-4d9e-8f3a-5b2c8d7e6f4b";
const RUN_RACE_PACE_LONG_ID = "7e5f8a9b-1c4d-4e6f-8a2b-9c1d3e5f7a9b";
const RUN_SPEED_ID = "0a3b4c5d-6e7f-4a9b-8c1d-2e3f4a5b6c7d";
const RUN_5K_PACE_ID = "4c7d8e9f-0a1b-4c3d-8e5f-6a7b8c9d0e1f";

const BIKE_ENDURANCE_ID = "8c1d2e3f-4a5b-4c7d-8e9f-0a1b2c3d4e5f";
const BIKE_SWEET_SPOT_ID = "9d2e3f4a-5b6c-4d8e-9f0a-1b2c3d4e5f6a";
const BIKE_RECOVERY_ID = "9b2c3d4e-5f6a-4b8c-9d0e-1f2a3b4c5d6e";
const BIKE_CLIMBING_ID = "1f4a5b6c-7d8e-4f0a-9b2c-3d4e5f6a7b8c";
const BIKE_LONG_ID = "a5f1b4c3-8e2b-4a6d-9c0f-2e9d5b4a3c1e";
const BIKE_PROGRESSIVE_LONG_ID = "6f2a4c8e-1b3d-4f6a-8c9e-2d4b6f8a1c3e";
const SPRINT_TRIATHLON_SWIM_COMPONENT_ID = "73d53dd1-f8b8-4d7f-9ba7-dfa4de116201";
const SPRINT_TRIATHLON_BIKE_COMPONENT_ID = "73d53dd1-f8b8-4d7f-9ba7-dfa4de116202";
const SPRINT_TRIATHLON_RUN_COMPONENT_ID = "73d53dd1-f8b8-4d7f-9ba7-dfa4de116203";
const DUATHLON_OPENING_RUN_COMPONENT_ID = "73d53dd1-f8b8-4d7f-9ba7-dfa4de116204";
const DUATHLON_BIKE_COMPONENT_ID = "73d53dd1-f8b8-4d7f-9ba7-dfa4de116205";
const DUATHLON_CLOSING_RUN_COMPONENT_ID = "73d53dd1-f8b8-4d7f-9ba7-dfa4de116206";
const SWIM_TECHNIQUE_ID = "6c9d0e1f-2a3b-4c5d-ae7f-8a9b0c1d2e3f";
const SWIM_ENDURANCE_ID = "7d0e1f2a-3b4c-4d6e-bf8a-9b0c1d2e3f4a";
const STRENGTH_CIRCUIT_ID = "aaaa1111-2222-4333-8444-555555555555";

const SAMPLE_ACTIVITY_PLAN_REFERENCES: Record<
  string,
  Pick<SampleSessionDemand, "activity_category" | "training_intent"> & {
    durationTargets?: readonly [number, number, number];
  }
> = {
  [RUN_EASY_ID]: {
    activity_category: "run",
    training_intent: "recovery",
    durationTargets: [25, 30, 35],
  },
  [RUN_AEROBIC_ID]: {
    activity_category: "run",
    training_intent: "aerobic_base",
    durationTargets: [25, 30, 35],
  },
  [RUN_TEMPO_ID]: { activity_category: "run", training_intent: "durable_endurance" },
  [RUN_THRESHOLD_ID]: { activity_category: "run", training_intent: "threshold_development" },
  [RUN_LONG_ID]: { activity_category: "run", training_intent: "durable_endurance" },
  [RUN_RACE_PACE_LONG_ID]: { activity_category: "run", training_intent: "race_specific" },
  [RUN_SPEED_ID]: { activity_category: "run", training_intent: "vo2max" },
  [RUN_5K_PACE_ID]: { activity_category: "run", training_intent: "race_specific" },
  [BIKE_ENDURANCE_ID]: {
    activity_category: "bike",
    training_intent: "aerobic_base",
    durationTargets: [50, 60, 70],
  },
  [BIKE_SWEET_SPOT_ID]: { activity_category: "bike", training_intent: "threshold_development" },
  [BIKE_RECOVERY_ID]: { activity_category: "bike", training_intent: "recovery" },
  [BIKE_CLIMBING_ID]: { activity_category: "bike", training_intent: "muscular_endurance" },
  [BIKE_LONG_ID]: { activity_category: "bike", training_intent: "durable_endurance" },
  [BIKE_PROGRESSIVE_LONG_ID]: { activity_category: "bike", training_intent: "durable_endurance" },
  [SPRINT_TRIATHLON_SWIM_COMPONENT_ID]: {
    activity_category: "swim",
    training_intent: "aerobic_base",
  },
  [SPRINT_TRIATHLON_BIKE_COMPONENT_ID]: {
    activity_category: "bike",
    training_intent: "speed_skill",
  },
  [SPRINT_TRIATHLON_RUN_COMPONENT_ID]: { activity_category: "run", training_intent: "speed_skill" },
  [DUATHLON_OPENING_RUN_COMPONENT_ID]: {
    activity_category: "run",
    training_intent: "durable_endurance",
  },
  [DUATHLON_BIKE_COMPONENT_ID]: { activity_category: "bike", training_intent: "aerobic_base" },
  [DUATHLON_CLOSING_RUN_COMPONENT_ID]: {
    activity_category: "run",
    training_intent: "durable_endurance",
  },
  [SWIM_TECHNIQUE_ID]: { activity_category: "swim", training_intent: "technique" },
  [SWIM_ENDURANCE_ID]: { activity_category: "swim", training_intent: "aerobic_base" },
  [STRENGTH_CIRCUIT_ID]: { activity_category: "strength", training_intent: "strength_support" },
};

function demandForSampleSession(input: {
  session: SamplePlanSession;
  weekIndex: number;
  totalWeeks: number;
}) {
  const reference = SAMPLE_ACTIVITY_PLAN_REFERENCES[input.session.activity_plan_id];
  if (!reference)
    throw new Error(`Missing sample activity-plan reference: ${input.session.activity_plan_id}`);
  const isReducedSession = /maintenance|primer|recovery|taper/i.test(input.session.title);
  const isFinalWeek = input.weekIndex === input.totalWeeks - 1;
  const target_duration_minutes = reference.durationTargets
    ? isReducedSession || isFinalWeek || input.weekIndex % 4 === 3
      ? reference.durationTargets[0]
      : reference.durationTargets[Math.min(input.weekIndex % 4, 2)]
    : null;

  return {
    activity_category: reference.activity_category,
    training_intent: reference.training_intent,
    target_duration_minutes,
    target_common_load: null,
    importance:
      reference.training_intent === "recovery" || reference.training_intent === "technique"
        ? "support"
        : ["threshold_development", "durable_endurance", "race_specific", "vo2max"].includes(
              reference.training_intent,
            )
          ? "key"
          : "normal",
  } as const;
}

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

const GENERAL_FITNESS_MAINTENANCE_WEEKS = [
  [
    { day: 1, title: "Aerobic Maintenance", activity_plan_id: BIKE_ENDURANCE_ID },
    { day: 3, title: "Full Body Strength", activity_plan_id: STRENGTH_CIRCUIT_ID },
    { day: 5, title: "Long Easy Session", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Maintenance", activity_plan_id: RUN_AEROBIC_ID },
    { day: 3, title: "Full Body Strength", activity_plan_id: STRENGTH_CIRCUIT_ID },
    { day: 5, title: "Long Easy Session", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Maintenance", activity_plan_id: BIKE_ENDURANCE_ID },
    { day: 3, title: "Full Body Strength", activity_plan_id: STRENGTH_CIRCUIT_ID },
    { day: 5, title: "Long Easy Session", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Maintenance", activity_plan_id: RUN_AEROBIC_ID },
    { day: 3, title: "Full Body Strength", activity_plan_id: STRENGTH_CIRCUIT_ID },
    { day: 5, title: "Long Easy Session", activity_plan_id: RUN_LONG_ID },
  ],
  [
    { day: 1, title: "Aerobic Maintenance", activity_plan_id: BIKE_ENDURANCE_ID },
    { day: 3, title: "Full Body Strength", activity_plan_id: STRENGTH_CIRCUIT_ID },
    { day: 5, title: "Recovery Aerobic", activity_plan_id: RUN_EASY_ID },
  ],
  [
    { day: 1, title: "Aerobic Maintenance", activity_plan_id: RUN_AEROBIC_ID },
    { day: 3, title: "Full Body Strength", activity_plan_id: STRENGTH_CIRCUIT_ID },
    { day: 5, title: "Recovery Aerobic", activity_plan_id: RUN_EASY_ID },
  ],
] as const;

const RAW_SAMPLE_PLANS: Array<
  Omit<SystemTrainingPlanTemplate, "structure"> & {
    structure: Record<string, unknown>;
  }
> = [
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
      activity_categories: ["run"],
      experienceLevel: ["beginner"],
      weeklyLoadRange: { min: 280, max: 420 },
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
      activity_categories: ["run"],
      experienceLevel: ["intermediate"],
      weeklyLoadRange: { min: 240, max: 360 },
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
      activity_categories: ["run"],
      experienceLevel: ["intermediate"],
      weeklyLoadRange: { min: 180, max: 240 },
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
      activity_categories: ["bike"],
      experienceLevel: ["beginner", "intermediate"],
      weeklyLoadRange: { min: 220, max: 280 },
      sessionsPerWeekTarget: 4,
      minRestDaysPerWeek: 2,
      maxConsecutiveDays: 3,
      maximumSessionDurationMinutes: 180,
      sessions: buildWeeklySessions(CYCLING_ENDURANCE_BUILDER_WEEKS),
    }),
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913005",
    name: "Sprint Triathlon Base (10 weeks)",
    description:
      "Triathlon starter cycle balancing swim, bike, run, and same-day component sessions.",
    sessions_per_week_target: 7,
    duration_hours: 8,
    structure: buildModernCompatibleTemplateStructure({
      name: "Sprint Triathlon Base (10 weeks)",
      description:
        "Triathlon starter cycle balancing swim, bike, run, and same-day component sessions.",
      startDate: "2026-02-09",
      durationWeeks: 10,
      activity_categories: ["swim", "bike", "run"],
      experienceLevel: ["beginner"],
      weeklyLoadRange: { min: 260, max: 390 },
      sessionsPerWeekTarget: 7,
      minRestDaysPerWeek: 1,
      maxConsecutiveDays: 3,
      sessions: Array.from({ length: 10 }, (_, weekIndex) => {
        return [
          {
            offset_days: weekIndex * 7 + 1,
            activity_plan_id: SWIM_TECHNIQUE_ID,
            event_overrides: { title: `Swim Technique ${weekIndex + 1}` },
          },
          {
            offset_days: weekIndex * 7 + 2,
            activity_plan_id: weekIndex < 7 ? BIKE_ENDURANCE_ID : BIKE_RECOVERY_ID,
            event_overrides: { title: weekIndex < 7 ? "Bike Endurance" : "Bike Taper" },
          },
          {
            offset_days: weekIndex * 7 + 4,
            activity_plan_id: weekIndex < 7 ? RUN_SPEED_ID : RUN_EASY_ID,
            event_overrides: { title: weekIndex < 7 ? "Run Quality" : "Run Taper" },
          },
          {
            offset_days: weekIndex * 7 + 5,
            activity_plan_id: SWIM_ENDURANCE_ID,
            event_overrides: { title: "Swim Endurance" },
          },
          ...(weekIndex % 2 === 0
            ? [
                { activity_plan_id: SPRINT_TRIATHLON_SWIM_COMPONENT_ID, title: "Sprint Base Swim" },
                { activity_plan_id: SPRINT_TRIATHLON_BIKE_COMPONENT_ID, title: "Sprint Base Bike" },
                { activity_plan_id: SPRINT_TRIATHLON_RUN_COMPONENT_ID, title: "Sprint Base Run" },
              ]
            : [
                { activity_plan_id: DUATHLON_OPENING_RUN_COMPONENT_ID, title: "Duathlon Base Run" },
                { activity_plan_id: DUATHLON_BIKE_COMPONENT_ID, title: "Duathlon Base Bike" },
                {
                  activity_plan_id: DUATHLON_CLOSING_RUN_COMPONENT_ID,
                  title: "Duathlon Progression Run",
                },
              ]
          ).map((component) => ({
            offset_days: weekIndex * 7 + 6,
            activity_plan_id: component.activity_plan_id,
            event_overrides: { title: component.title },
          })),
        ];
      }).flat(),
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
      activity_categories: ["run", "strength", "bike"],
      experienceLevel: ["beginner", "intermediate"],
      weeklyLoadRange: { min: 180, max: 280 },
      sessionsPerWeekTarget: 3,
      minRestDaysPerWeek: 2,
      maxConsecutiveDays: 2,
      sessions: buildWeeklySessions(GENERAL_FITNESS_MAINTENANCE_WEEKS),
    }),
  },
];

export const ALL_SAMPLE_PLANS: SystemTrainingPlanTemplate[] = RAW_SAMPLE_PLANS.map((plan) => ({
  ...plan,
  structure: {
    ...plan.structure,
    id: plan.id,
    sessions: (plan.structure as TrainingPlan).sessions.map((session, sessionIndex) => {
      const normalized = session as typeof session & {
        demand?: SampleSessionDemand;
        id?: string;
      };
      const activityPlanId = normalized.activity_plan_id;
      if (normalized.demand || activityPlanId === null) return normalized;
      const title = normalized.event_overrides?.title ?? "Session";
      return {
        ...normalized,
        id: sha256Uuid(`sample-training-session:${plan.id}:${sessionIndex}`),
        demand: demandForSampleSession({
          session: {
            day: normalized.offset_days % 7,
            title,
            activity_plan_id: activityPlanId,
          },
          weekIndex: Math.floor(normalized.offset_days / 7),
          totalWeeks: (plan.structure as TrainingPlan).durationWeeks?.recommended ?? 1,
        }),
      };
    }),
  } as TrainingPlan,
}));
