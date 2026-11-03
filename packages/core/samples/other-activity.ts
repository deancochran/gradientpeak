import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilderFactory } from "./activity-plan-builder";
import type { SystemActivityPlanTemplate as RecordingServiceActivityPlan } from "./types";

const createPlan = createSystemActivityPlanBuilderFactory("other", [
  "General Warm-up:1:General Warm-up|Specific Warm-up:1:Specific Warm-up|Main WOD:1:Main WOD|Cool-down & Mobility:1:Cool-down & Mobility",
  "Warmup:1:Warmup|Threshold Repeats:4:Threshold Row:Easy Row|Cooldown:1:Cooldown",
  "Warmup:1:Warmup|Steady Endurance:1:Steady Endurance|Cooldown:1:Cooldown",
  "Warmup:1:Warmup|Race Simulation:1:Race Simulation|Finishing Effort:1:Finishing Effort|Cooldown:1:Cooldown",
]);

/**
 * CrossFit WOD - Other Activity
 * Total time: 45 minutes
 * Estimated Common Load: ~80
 */
export const CROSSFIT_WOD: RecordingServiceActivityPlan = {
  id: "6a9b0c1d-2e3f-4a5b-ac7d-8e9f0a1b2c3d",
  name: "CrossFit WOD",
  description: "High-intensity CrossFit activity of the day",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "General Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.maxHR(65)],
      notes: "Row/bike, dynamic stretching, movement prep",
    })
    .step({
      name: "Specific Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.maxHR(70)],
      notes: "Practice WOD movements at light weight/modified versions",
    })
    .step({
      name: "Main WOD",
      duration: Duration.minutes(15),
      targets: [Target.maxHR(90)],
      notes: "AMRAP, EMOM, or time-based activity - push hard but maintain form",
    })
    .step({
      name: "Cool-down & Mobility",
      duration: Duration.minutes(10),
      targets: [Target.maxHR(50)],
      notes: "Easy movement, static stretching, foam rolling",
    })
    .build(),
};

/** ActivityCategory-agnostic rowing erg threshold development session. */
export const OTHER_THRESHOLD_ROW: RecordingServiceActivityPlan = {
  id: "5d191bf2-0c3e-4a47-8d58-9bc83ef67101",
  name: "Rowing Erg Threshold Intervals",
  description: "Executable non-bike, non-run threshold intervals on a rowing ergometer.",
  gps_recording_enabled: false,
  structure: createPlan()
    .warmup({ duration: Duration.minutes(12), targets: [Target.rpe(3)] })
    .interval({
      name: "Threshold Repeats",
      repeat: 4,
      steps: [
        {
          name: "Threshold Row",
          duration: Duration.minutes(8),
          targets: [Target.rpe(8)],
        },
        {
          name: "Easy Row",
          duration: Duration.minutes(3),
          targets: [Target.rpe(2)],
        },
      ],
    })
    .cooldown({ duration: Duration.minutes(10), targets: [Target.rpe(2)] })
    .build(),
};

/** Race-specific mixed-modality simulation for the canonical `other` category. */
export const OTHER_RACE_SIMULATION: RecordingServiceActivityPlan = {
  id: "1f6ea8cb-5df9-42cb-9f04-3ca5a8a6d6d1",
  name: "Other Race Simulation",
  description:
    "Race-specific mixed-modality simulation with sustained work, controlled transitions, and a finishing effort.",
  gps_recording_enabled: false,
  structure: createPlan()
    .warmup({ duration: Duration.minutes(12), targets: [Target.rpe(3)] })
    .step({
      name: "Race Simulation",
      duration: Duration.minutes(36),
      targets: [Target.rpe(7)],
      notes: "Sustain event-specific pacing and practice planned transitions or fueling.",
    })
    .step({
      name: "Finishing Effort",
      duration: Duration.minutes(8),
      targets: [Target.rpe(8)],
      notes: "Finish strongly while preserving movement quality.",
    })
    .cooldown({ duration: Duration.minutes(8), targets: [Target.rpe(2)] })
    .build(),
};

export const SAMPLE_OTHER_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  CROSSFIT_WOD,
  OTHER_THRESHOLD_ROW,
  OTHER_RACE_SIMULATION,
];
