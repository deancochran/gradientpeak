import { Duration, Target } from "../schemas/activity_payload";
import { createSystemActivityPlanBuilderFactory } from "./activity-plan-builder";
import type { SystemActivityPlanTemplate as RecordingServiceActivityPlan } from "./types";

const createPlan = createSystemActivityPlanBuilderFactory("bike", [
  "Easy Ride:1:Easy Ride",
  "Warm-up:1:Warm-up|Interval 2:3:Sweet Spot Interval:Easy Recovery|Cool-down:1:Cool-down",
  "Progressive Warm-up:1:Progressive Warm-up|Tempo Block 1:1:Tempo Block 1|Easy Recovery:1:Easy Recovery|Tempo Block 2:1:Tempo Block 2|Cool-down:1:Cool-down",
  "Warm-up:1:Warm-up|Interval 2:5:Climbing Interval:Recovery Descent|Cool-down:1:Cool-down",
  "Group Warm-up:1:Group Warm-up|Interval 2:8:Attack/Chase:Group Tempo:Easy Spinning|Sprint Finish:1:Sprint Finish|Cool-down Spin:1:Cool-down Spin",
  "Warmup:1:Warmup|Main Set:1:Zone 2 Endurance|Cooldown:1:Cooldown",
  "Warmup:1:Warmup|Settled Endurance:1:Settled Endurance|Progressive Lift:2:Tempo Lift:Easy Reset|Steady Finish:1:Steady Finish|Cooldown:1:Cooldown",
]);

/**
 * Easy Endurance Ride - Outdoor
 * Total time: 60 minutes
 * Estimated Common Load: ~45
 */
/**
 * Sweet Spot Outdoor Ride
 * Total time: 75 minutes
 * Estimated Common Load: ~85
 */
export const SWEET_SPOT_OUTDOOR_RIDE: RecordingServiceActivityPlan = {
  id: "9d2e3f4a-5b6c-4d8e-9f0a-1b2c3d4e5f6a",
  name: "Outdoor Sweet Spot Intervals",
  description: "Outdoor ride with sweet spot power intervals",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.ftp(55)],
      notes: "Start easy and gradually build intensity",
    })
    .interval({
      repeat: 3,
      steps: [
        {
          name: "Sweet Spot Interval",
          duration: Duration.minutes(15),
          targets: [Target.ftp(90)],
          notes: "Maintain steady power in sweet spot zone (85-90% FTP)",
        },
        {
          name: "Easy Recovery",
          duration: Duration.minutes(5),
          targets: [Target.ftp(50)],
          notes: "Easy spinning to recover between intervals",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.ftp(50)],
      notes: "Easy spinning to bring heart rate down",
    })
    .build(),
};

/**
 * Tempo Intervals - Outdoor
 * Total time: 80 minutes
 * Estimated Common Load: ~90
 */
export const TEMPO_INTERVALS_RIDE: RecordingServiceActivityPlan = {
  id: "0e3f4a5b-6c7d-4e9f-8a1b-2c3d4e5f6a7b",
  name: "Tempo Intervals",
  description: "Outdoor ride with sustained tempo efforts",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Progressive Warm-up",
      duration: Duration.minutes(20),
      targets: [Target.ftp(60)],
      notes: "Gradually increase effort to prepare for tempo work",
    })
    .step({
      name: "Tempo Block 1",
      duration: Duration.minutes(20),
      targets: [Target.ftp(80)],
      notes: "Steady tempo effort - should feel moderately hard but sustainable",
    })
    .step({
      name: "Easy Recovery",
      duration: Duration.minutes(10),
      targets: [Target.ftp(55)],
      notes: "Easy spinning to recover",
    })
    .step({
      name: "Tempo Block 2",
      duration: Duration.minutes(20),
      targets: [Target.ftp(80)],
      notes: "Maintain same effort as first block",
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.ftp(50)],
      notes: "Easy spinning to normalize heart rate",
    })
    .build(),
};

/**
 * Climbing Intervals - Outdoor
 * Total time: 70 minutes
 * Estimated Common Load: ~95
 */
export const CLIMBING_INTERVALS_RIDE: RecordingServiceActivityPlan = {
  id: "1f4a5b6c-7d8e-4f0a-9b2c-3d4e5f6a7b8c",
  name: "Climbing Intervals",
  description: "High-intensity climbing intervals for outdoor terrain",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.ftp(60)],
      notes: "Include some brief higher efforts to open the legs",
    })
    .interval({
      repeat: 5,
      steps: [
        {
          name: "Climbing Interval",
          duration: Duration.minutes(6),
          targets: [Target.ftp(95)],
          notes: "Find a good climb and push hard - aim for threshold power",
        },
        {
          name: "Recovery Descent",
          duration: Duration.minutes(4),
          targets: [Target.ftp(45)],
          notes: "Use terrain to recover - easy spinning or coasting",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(15),
      targets: [Target.ftp(50)],
      notes: "Easy spinning on flat terrain to recover",
    })
    .build(),
};

/**
 * Group Ride Simulation - Outdoor
 * Total time: 90 minutes
 * Estimated Common Load: ~80
 */
export const GROUP_RIDE_SIMULATION: RecordingServiceActivityPlan = {
  id: "2a5b6c7d-8e9f-4a1b-ac3d-4e5f6a7b8c9d",
  name: "Group Ride Simulation",
  description: "Variable intensity ride simulating group ride dynamics",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Group Warm-up",
      duration: Duration.minutes(20),
      targets: [Target.ftp(60)],
      notes: "Conversational pace as group gets organized",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Attack/Chase",
          duration: Duration.minutes(2),
          targets: [Target.ftp(100)],
          notes: "Hard effort to simulate attacks or bridging gaps",
        },
        {
          name: "Group Tempo",
          duration: Duration.minutes(3),
          targets: [Target.ftp(75)],
          notes: "Steady pace as group settles after effort",
        },
        {
          name: "Easy Spinning",
          duration: Duration.minutes(2),
          targets: [Target.ftp(55)],
          notes: "Easy spinning in the bunch",
        },
      ],
    })
    .step({
      name: "Sprint Finish",
      duration: Duration.minutes(1),
      targets: [Target.rpe(10)],
      notes:
        "Give your best effort over the full minute to simulate a group ride finish; maintain bike control rather than trying to hold peak sprint power throughout.",
    })
    .step({
      name: "Cool-down Spin",
      duration: Duration.minutes(14),
      targets: [Target.ftp(50)],
      notes: "Easy spinning to cool down after efforts",
    })
    .build(),
};

export const SYSTEM_PROGRESSIVE_LONG_ENDURANCE_RIDE: RecordingServiceActivityPlan = {
  id: "6f2a4c8e-1b3d-4f6a-8c9e-2d4b6f8a1c3e",
  name: "Progressive Long Endurance Ride",
  description: "Long endurance ride with steady tempo lifts to build late-ride durability.",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(15),
      targets: [Target.ftp(60)],
      notes: "Start relaxed and build cadence smoothly.",
    })
    .step({
      name: "Settled Endurance",
      duration: Duration.minutes(55),
      targets: [Target.ftp(70)],
      notes: "Lock into conversational endurance riding.",
    })
    .interval({
      repeat: 2,
      name: "Progressive Lift",
      steps: [
        {
          name: "Tempo Lift",
          duration: Duration.minutes(10),
          targets: [Target.ftp(75)],
          notes: "Raise pressure without drifting above controlled tempo.",
        },
        {
          name: "Easy Reset",
          duration: Duration.minutes(8),
          targets: [Target.ftp(60)],
          notes: "Recover while keeping pedals moving.",
        },
      ],
    })
    .step({
      name: "Steady Finish",
      duration: Duration.minutes(25),
      targets: [Target.ftp(70)],
      notes: "Finish with durable aerobic pressure, not a fade.",
    })
    .cooldown({
      duration: Duration.minutes(8),
      targets: [Target.ftp(55)],
      notes: "Spin out the legs before ending the ride.",
    })
    .build(),
};

export const SAMPLE_OUTDOOR_BIKE_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  SWEET_SPOT_OUTDOOR_RIDE,
  TEMPO_INTERVALS_RIDE,
  CLIMBING_INTERVALS_RIDE,
  GROUP_RIDE_SIMULATION,
  SYSTEM_PROGRESSIVE_LONG_ENDURANCE_RIDE,
];
