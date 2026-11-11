import { activityPlanStructureSchema } from "../../../activity-plan";
import type { SystemTemplate, SystemTrainingPlanTemplate } from "../../../samples";
import { persistedTrainingPlanStructureSchema } from "../../../schemas/training-plan-structure";

const planPreferences = {
  weekly_session_count: null,
  target_weekly_duration_minutes: null,
  maximum_session_duration_minutes: null,
  preferred_weekdays: [],
  rest_days: [],
  progression_style: null,
  recovery_priority: null,
};

const runDemand = {
  activity_category: "bike" as const,
  training_intent: "aerobic_base" as const,
  target_duration_minutes: null,
  target_common_load: null,
  importance: "normal" as const,
};

export const LOCAL_TRAINING_PLAN_TEMPLATES: readonly SystemTemplate[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Fixture Easy Run",
    description: "Local verification fixture.",
    training_intent: "aerobic_base",
    structure: activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "bike",
      items: [
        {
          type: "step",
          id: "10000000-0000-4000-8000-000000000101",
          name: "Easy running",
          duration: { type: "time", seconds: 1800 },
          targets: [{ type: "%FTP", intensity: 45 }],
        },
      ],
    }),
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Fixture Tempo Run",
    description: "Local verification fixture.",
    training_intent: "threshold_development",
    structure: activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "bike",
      items: [
        {
          type: "step",
          id: "10000000-0000-4000-8000-000000000102",
          name: "Tempo running",
          duration: { type: "time", seconds: 2400 },
          targets: [{ type: "%FTP", intensity: 75 }],
        },
      ],
    }),
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Fixture Long Run",
    description: "Local verification fixture.",
    training_intent: "durable_endurance",
    structure: activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "bike",
      items: [
        {
          type: "step",
          id: "10000000-0000-4000-8000-000000000103",
          name: "Long running",
          duration: { type: "time", seconds: 5400 },
          targets: [{ type: "%FTP", intensity: 55 }],
        },
      ],
    }),
  },
];

const [easyRun, tempoRun, longRun] = LOCAL_TRAINING_PLAN_TEMPLATES;
if (!easyRun || !tempoRun || !longRun)
  throw new Error("Local training-plan fixtures are incomplete");

export const LOCAL_TRAINING_PLAN_FIXTURES: readonly SystemTrainingPlanTemplate[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Local Run Progression (4 weeks)",
    description: "A test-only four-week progression with a taper.",
    sessions_per_week_target: 3,
    duration_hours: 10,
    structure: persistedTrainingPlanStructureSchema.parse({
      id: "20000000-0000-4000-8000-000000000001",
      version: 1,
      plan_preferences: planPreferences,
      sessions: [
        ...[0, 7, 14].flatMap((offset, index) => [
          {
            id: `20000000-0000-4000-8000-${String(10 + index).padStart(12, "0")}`,
            offset_days: offset,
            activity_plan_id: easyRun.id,
            demand: runDemand,
            event_overrides: { title: "Easy Run" },
          },
          {
            id: `20000000-0000-4000-8000-${String(20 + index).padStart(12, "0")}`,
            offset_days: offset + 2,
            activity_plan_id: tempoRun.id,
            demand: runDemand,
            event_overrides: { title: "Tempo Run" },
          },
          {
            id: `20000000-0000-4000-8000-${String(30 + index).padStart(12, "0")}`,
            offset_days: offset + 5,
            activity_plan_id: longRun.id,
            demand: runDemand,
            event_overrides: { title: "Long Run" },
          },
        ]),
        {
          id: "20000000-0000-4000-8000-000000000040",
          offset_days: 21,
          activity_plan_id: easyRun.id,
          demand: runDemand,
          event_overrides: { title: "Taper Easy Run" },
        },
        {
          id: "20000000-0000-4000-8000-000000000041",
          offset_days: 25,
          activity_plan_id: longRun.id,
          demand: runDemand,
          event_overrides: { title: "Taper Long Run" },
        },
      ],
    }),
  },
];

const [localTrainingPlanFixture] = LOCAL_TRAINING_PLAN_FIXTURES;
if (!localTrainingPlanFixture) throw new Error("Local training-plan fixture is missing");
export const LOCAL_TRAINING_PLAN_FIXTURE = localTrainingPlanFixture;
