import { z } from "zod";
import { plannedActivityStructureSchema } from "./planned_activity";

//======================================
// Adaptive Logic for Plan Progression
//======================================
const adaptiveLogicSchema = z.object({
  complianceThreshold: z.number().min(0).max(100).optional(), // % of workouts completed required to trigger adaptive adjustments
  intensityMultiplier: z.number().default(1.0), // Factor to scale planned intensity for adaptive progression
});

//======================================
// Progression Rules
//======================================
const progressionRulesSchema = z.object({
  rampRateCTL: z.number().nonnegative(), // Weekly change in Chronic Training Load (long-term fitness)
  recoveryStructure: z.object({
    work: z.number().min(1), // Number of consecutive training days before recovery
    recover: z.number().min(1), // Number of recovery days following work block
  }),
  adaptive: adaptiveLogicSchema.optional(), // Optional adaptive logic parameters
});

//======================================
// Weekly Targets
//======================================
const weeklyTargetsSchema = z.object({
  weeklyTSS: z.number().nonnegative(), // total planned TSS
  zoneTSS: z
    .record(
      z.enum(["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7"]), // Endurance training zones
      z.number().nonnegative(),
    )
    .optional(), // TSS per zone (optional for flexibility)
  plannedDurationMinutes: z.number().nonnegative().optional(),
  plannedDistance: z.number().nonnegative().optional(),
  fatigueShortTerm: z.number().nonnegative().optional(), // ATL
  fitnessLongTerm: z.number().nonnegative().optional(), // CTL
  formOrFreshness: z.number().optional(), // TSB
  functionalThresholdPower: z.number().optional(), // FTP
  timeToExhaustion: z.number().optional(), // TTE
});

//======================================
// Scheduled Workouts
//======================================
const scheduledWorkoutSchema = z.object({
  dayOfWeek: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]),
  key: z.enum(["priority", "standard", "optional"]).default("standard"),
  workoutTemplate: plannedActivityStructureSchema,
});

//======================================
// Weekly Schedule
//======================================
const weeklyScheduleSchema = z.object({
  weekNumber: z.number().min(1), // Calendar week number in the training plan
  targets: weeklyTargetsSchema, // Weekly training targets and metrics
  workouts: z.array(scheduledWorkoutSchema), // List of scheduled workouts for this week
});

//======================================
// Race / Event Settings
//======================================
const raceSettingsSchema = z.object({
  targetDate: z.string().optional(), // Date of the goal race/event (ISO string)
  maxWeeklyHours: z.number().nonnegative().optional(), // Maximum weekly training duration allowed
});

//======================================
// Top-Level Profile Plan Config
//======================================
export const profilePlanConfigSchema = z.object({
  version: z.string().default("1.0"), // Schema version for backward compatibility
  rampRateCTL: z.number().optional(), // Default ramp rate if not specified per progression
  recoveryWeeks: z.array(z.number().nonnegative()).optional(), // Weeks designated for reduced training load
  testWeeks: z.array(z.number().nonnegative()).optional(), // Weeks designated for fitness testing
  weeklyTargets: z
    .array(
      z.object({ week: z.number().min(1), hours: z.number().nonnegative() }), // Basic weekly targets for hours
    )
    .optional(),
  progression: progressionRulesSchema.optional(), // Rules for ramping fitness and recovery
  schedule: z.array(weeklyScheduleSchema).optional(), // Full weekly schedule with workouts
  raceSettings: raceSettingsSchema.optional(), // Settings for goal events or races
});

export type ProfilePlanConfig = z.infer<typeof profilePlanConfigSchema>;
export type ProgressionRules = z.infer<typeof progressionRulesSchema>;
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;
