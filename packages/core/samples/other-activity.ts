import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilderFactory } from "./activity-plan-builder";
import type { SystemActivityPlanTemplate as RecordingServiceActivityPlan } from "./types";

const createPlan = createSystemActivityPlanBuilderFactory("other", [
  "Centering & Breath:1:Centering & Breath|Sun Salutations:1:Sun Salutations|Standing Poses:1:Standing Poses|Floor Sequence:1:Floor Sequence|Relaxation:1:Relaxation",
  "Dynamic Warm-up:1:Dynamic Warm-up|Easy Routes:1:Easy Routes|Interval 3:8:Challenging Route:Rest & Recovery|Volume Climbing:1:Volume Climbing|Cool-down & Stretch:1:Cool-down & Stretch",
  "Trail Approach:1:Trail Approach|Uphill Section:1:Uphill Section|Summit Break:1:Summit Break|Trail Descent:1:Trail Descent",
  "General Warm-up:1:General Warm-up|Specific Warm-up:1:Specific Warm-up|Main WOD:1:Main WOD|Cool-down & Mobility:1:Cool-down & Mobility",
  "Easy Start:1:Easy Start|Steady Walk:1:Steady Walk|Easy Finish:1:Easy Finish",
  "Warmup:1:Warmup|Threshold Repeats:4:Threshold Row:Easy Row|Cooldown:1:Cooldown",
  "Warmup:1:Warmup|Steady Endurance:1:Steady Endurance|Cooldown:1:Cooldown",
  "Warmup:1:Warmup|Race Simulation:1:Race Simulation|Finishing Effort:1:Finishing Effort|Cooldown:1:Cooldown",
]);

/**
 * Yoga Flow - Other Activity
 * Total time: 60 minutes
 * Estimated Common Load: ~30
 */
export const YOGA_FLOW: RecordingServiceActivityPlan = {
  id: "3d6e7f8a-9b0c-4d2e-bf4a-5b6c7d8e9f0a",
  name: "Yoga Flow",
  description: "Gentle yoga flow for flexibility and mindfulness",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Centering & Breath",
      duration: Duration.minutes(10),
      targets: [Target.maxHR(50)],
      notes: "Focus on breathing, gentle movements to center yourself",
    })
    .step({
      name: "Sun Salutations",
      duration: Duration.minutes(20),
      targets: [Target.maxHR(60)],
      notes: "5-8 rounds of sun salutation A and B, link breath with movement",
    })
    .step({
      name: "Standing Poses",
      duration: Duration.minutes(15),
      targets: [Target.maxHR(55)],
      notes: "Warrior poses, triangle, tree pose - hold for 5-8 breaths each",
    })
    .step({
      name: "Floor Sequence",
      duration: Duration.minutes(10),
      targets: [Target.maxHR(45)],
      notes: "Hip openers, twists, gentle backbends",
    })
    .step({
      name: "Relaxation",
      duration: Duration.minutes(5),
      targets: [Target.maxHR(40)],
      notes: "Complete stillness, body scan, deep relaxation",
    })
    .build(),
};

/**
 * Rock Climbing - Other Activity
 * Total time: 90 minutes
 * Estimated Common Load: ~70
 */
export const ROCK_CLIMBING_SESSION: RecordingServiceActivityPlan = {
  id: "4e7f8a9b-0c1d-4e3f-8a5b-6c7d8e9f0a1b",
  name: "Rock Climbing Session",
  description: "Indoor/outdoor rock climbing session with warm-up and cool-down",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Dynamic Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.maxHR(60)],
      notes: "Arm circles, finger/wrist mobility, easy traversing or easy routes",
    })
    .step({
      name: "Easy Routes",
      duration: Duration.minutes(20),
      targets: [Target.maxHR(65)],
      notes: "Climb 3-5 easy routes to get movement patterns flowing",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Challenging Route",
          duration: Duration.minutes(5),
          targets: [Target.maxHR(80)],
          notes: "Project routes, work specific moves, push your grade",
        },
        {
          name: "Rest & Recovery",
          duration: Duration.minutes(3),
          targets: [Target.maxHR(55)],
          notes: "Complete rest, hydrate, chalk up, visualize next attempt",
        },
      ],
    })
    .step({
      name: "Volume Climbing",
      duration: Duration.minutes(15),
      targets: [Target.maxHR(70)],
      notes: "Climb continuously on moderate routes for endurance",
    })
    .step({
      name: "Cool-down & Stretch",
      duration: Duration.minutes(10),
      targets: [Target.maxHR(50)],
      notes: "Easy traversing, forearm stretches, shoulder mobility",
    })
    .build(),
};

/**
 * Hiking Adventure - Other Activity
 * Total time: 120 minutes
 * Estimated Common Load: ~60
 */
export const HIKING_ADVENTURE: RecordingServiceActivityPlan = {
  id: "5f8a9b0c-1d2e-4f4a-9b6c-7d8e9f0a1b2c",
  name: "Hiking Adventure",
  description: "Moderate-intensity hiking with varied terrain",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Trail Approach",
      duration: Duration.minutes(30),
      targets: [Target.maxHR(65)],
      notes: "Steady pace on relatively flat or gently rolling terrain",
    })
    .step({
      name: "Uphill Section",
      duration: Duration.minutes(40),
      targets: [Target.maxHR(75)],
      notes: "Steady uphill hiking, adjust pace to maintain breathing rhythm",
    })
    .step({
      name: "Summit Break",
      duration: Duration.minutes(10),
      targets: [Target.maxHR(50)],
      notes: "Hydrate, fuel, take photos, enjoy the accomplishment",
    })
    .step({
      name: "Trail Descent",
      duration: Duration.minutes(40),
      targets: [Target.maxHR(60)],
      notes: "Control pace on downhill, focus on foot placement and knee impact",
    })
    .build(),
};

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
      targets: [Target.maxHR(88)],
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

/**
 * Walking Recovery - Other Activity
 * Total time: 45 minutes
 * Estimated Common Load: ~20
 */
export const WALKING_RECOVERY: RecordingServiceActivityPlan = {
  id: "7b0c1d2e-3f4a-4b6c-bd8e-9f0a1b2c3d4e",
  name: "Recovery Walk",
  description: "Gentle walking session for active recovery",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Easy Start",
      duration: Duration.minutes(15),
      targets: [Target.maxHR(55)],
      notes: "Very comfortable walking pace, focus on posture and breathing",
    })
    .step({
      name: "Steady Walk",
      duration: Duration.minutes(20),
      targets: [Target.maxHR(60)],
      notes: "Slightly brisker pace but still conversational",
    })
    .step({
      name: "Easy Finish",
      duration: Duration.minutes(10),
      targets: [Target.maxHR(55)],
      notes: "Return to gentle pace, enjoy the surroundings",
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
        { name: "Threshold Row", duration: Duration.minutes(8), targets: [Target.rpe(8)] },
        { name: "Easy Row", duration: Duration.minutes(3), targets: [Target.rpe(2)] },
      ],
    })
    .cooldown({ duration: Duration.minutes(10), targets: [Target.rpe(2)] })
    .build(),
};

/** Long, low-intensity elliptical prescription for activity_category-agnostic endurance. */
export const OTHER_LONG_ENDURANCE_ELLIPTICAL: RecordingServiceActivityPlan = {
  id: "5d191bf2-0c3e-4a47-8d58-9bc83ef67102",
  name: "Long Endurance Elliptical",
  description: "Long continuous low-impact endurance session on an elliptical trainer.",
  gps_recording_enabled: false,
  structure: createPlan()
    .warmup({ duration: Duration.minutes(10), targets: [Target.rpe(2)] })
    .step({
      name: "Steady Endurance",
      duration: Duration.minutes(100),
      targets: [Target.rpe(4)],
      notes: "Maintain smooth, sustainable pressure and relaxed upper-body posture.",
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
  YOGA_FLOW,
  ROCK_CLIMBING_SESSION,
  HIKING_ADVENTURE,
  CROSSFIT_WOD,
  WALKING_RECOVERY,
  OTHER_THRESHOLD_ROW,
  OTHER_LONG_ENDURANCE_ELLIPTICAL,
  OTHER_RACE_SIMULATION,
];
