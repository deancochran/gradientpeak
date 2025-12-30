import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Yoga Flow - Other Activity
 * Total time: 60 minutes
 * Estimated TSS: ~30
 */
export const YOGA_FLOW: RecordingServiceActivityPlan = {
  id: "3d6e7f8a-9b0c-1d2e-3f4a-5b6c7d8e9f0a",
  version: "2.0",
  name: "Yoga Flow",
  description: "Gentle yoga flow for flexibility and mindfulness",
  activity_category: "other",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Centering & Breath",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(50)],
      notes: "Focus on breathing, gentle movements to center yourself",
    })
    .step({
      name: "Sun Salutations",
      duration: Duration.minutes(20),
      targets: [Target.thresholdHR(60)],
      notes: "5-8 rounds of sun salutation A and B, link breath with movement",
    })
    .step({
      name: "Standing Poses",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(55)],
      notes: "Warrior poses, triangle, tree pose - hold for 5-8 breaths each",
    })
    .step({
      name: "Floor Sequence",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(45)],
      notes: "Hip openers, twists, gentle backbends",
    })
    .step({
      name: "Relaxation",
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(40)],
      notes: "Complete stillness, body scan, deep relaxation",
    })
    .build(),
};

/**
 * Rock Climbing - Other Activity
 * Total time: 90 minutes
 * Estimated TSS: ~70
 */
export const ROCK_CLIMBING_SESSION: RecordingServiceActivityPlan = {
  id: "4e7f8a9b-0c1d-2e3f-4a5b-6c7d8e9f0a1b",
  version: "2.0",
  name: "Rock Climbing Session",
  description:
    "Indoor/outdoor rock climbing session with warm-up and cool-down",
  activity_category: "other",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Dynamic Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(60)],
      notes:
        "Arm circles, finger/wrist mobility, easy traversing or easy routes",
    })
    .step({
      name: "Easy Routes",
      duration: Duration.minutes(20),
      targets: [Target.thresholdHR(65)],
      notes: "Climb 3-5 easy routes to get movement patterns flowing",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Challenging Route",
          duration: Duration.minutes(5),
          targets: [Target.thresholdHR(80)],
          notes: "Project routes, work specific moves, push your grade",
        },
        {
          name: "Rest & Recovery",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(55)],
          notes: "Complete rest, hydrate, chalk up, visualize next attempt",
        },
      ],
    })
    .step({
      name: "Volume Climbing",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(70)],
      notes: "Climb continuously on moderate routes for endurance",
    })
    .step({
      name: "Cool-down & Stretch",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(50)],
      notes: "Easy traversing, forearm stretches, shoulder mobility",
    })
    .build(),
};

/**
 * Hiking Adventure - Other Activity
 * Total time: 120 minutes
 * Estimated TSS: ~60
 */
export const HIKING_ADVENTURE: RecordingServiceActivityPlan = {
  id: "5f8a9b0c-1d2e-3f4a-5b6c-7d8e9f0a1b2c",
  version: "2.0",
  name: "Hiking Adventure",
  description: "Moderate-intensity hiking with varied terrain",
  activity_category: "other",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Trail Approach",
      duration: Duration.minutes(30),
      targets: [Target.thresholdHR(65)],
      notes: "Steady pace on relatively flat or gently rolling terrain",
    })
    .step({
      name: "Uphill Section",
      duration: Duration.minutes(40),
      targets: [Target.thresholdHR(75)],
      notes: "Steady uphill hiking, adjust pace to maintain breathing rhythm",
    })
    .step({
      name: "Summit Break",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(50)],
      notes: "Hydrate, fuel, take photos, enjoy the accomplishment",
    })
    .step({
      name: "Trail Descent",
      duration: Duration.minutes(40),
      targets: [Target.thresholdHR(60)],
      notes:
        "Control pace on downhill, focus on foot placement and knee impact",
    })
    .build(),
};

/**
 * CrossFit WOD - Other Activity
 * Total time: 45 minutes
 * Estimated TSS: ~80
 */
export const CROSSFIT_WOD: RecordingServiceActivityPlan = {
  id: "6a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d",
  version: "2.0",
  name: "CrossFit WOD",
  description: "High-intensity CrossFit activity of the day",
  activity_category: "other",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "General Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Row/bike, dynamic stretching, movement prep",
    })
    .step({
      name: "Specific Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(70)],
      notes: "Practice WOD movements at light weight/modified versions",
    })
    .step({
      name: "Main WOD",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(88)],
      notes:
        "AMRAP, EMOM, or time-based activity - push hard but maintain form",
    })
    .step({
      name: "Cool-down & Mobility",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(50)],
      notes: "Easy movement, static stretching, foam rolling",
    })
    .build(),
};

/**
 * Walking Recovery - Other Activity
 * Total time: 45 minutes
 * Estimated TSS: ~20
 */
export const WALKING_RECOVERY: RecordingServiceActivityPlan = {
  id: "7b0c1d2e-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
  version: "2.0",
  name: "Recovery Walk",
  description: "Gentle walking session for active recovery",
  activity_category: "other",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Easy Start",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(55)],
      notes: "Very comfortable walking pace, focus on posture and breathing",
    })
    .step({
      name: "Steady Walk",
      duration: Duration.minutes(20),
      targets: [Target.thresholdHR(60)],
      notes: "Slightly brisker pace but still conversational",
    })
    .step({
      name: "Easy Finish",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(55)],
      notes: "Return to gentle pace, enjoy the surroundings",
    })
    .build(),
};

export const SAMPLE_OTHER_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  YOGA_FLOW,
  ROCK_CLIMBING_SESSION,
  HIKING_ADVENTURE,
  CROSSFIT_WOD,
  WALKING_RECOVERY,
];
