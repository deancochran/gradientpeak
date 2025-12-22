import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Easy Endurance Ride - Outdoor
 * Total time: 60 minutes
 * Estimated TSS: ~45
 */
export const EASY_ENDURANCE_RIDE: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Easy Endurance Ride",
  description: "Comfortable outdoor ride focusing on aerobic base building",
  activity_category: "bike",
  activity_location: "outdoor",
  structure: createPlan()
    .step({
      name: "Easy Ride",
      duration: Duration.minutes(60),
      targets: [Target.ftp(60)],
      notes:
        "Keep effort relaxed - you should be able to hold a conversation easily",
    })
    .build(),
};

/**
 * Sweet Spot Outdoor Ride
 * Total time: 75 minutes
 * Estimated TSS: ~85
 */
export const SWEET_SPOT_OUTDOOR_RIDE: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Sweet Spot Intervals",
  description: "Outdoor ride with sweet spot power intervals",
  activity_category: "bike",
  activity_location: "outdoor",
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
          targets: [Target.ftp(88)],
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
 * Estimated TSS: ~90
 */
export const TEMPO_INTERVALS_RIDE: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Tempo Intervals",
  description: "Outdoor ride with sustained tempo efforts",
  activity_category: "bike",
  activity_location: "outdoor",
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
      targets: [Target.ftp(78)],
      notes:
        "Steady tempo effort - should feel moderately hard but sustainable",
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
      targets: [Target.ftp(78)],
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
 * Estimated TSS: ~95
 */
export const CLIMBING_INTERVALS_RIDE: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Climbing Intervals",
  description: "High-intensity climbing intervals for outdoor terrain",
  activity_category: "bike",
  activity_location: "outdoor",
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
 * Estimated TSS: ~80
 */
export const GROUP_RIDE_SIMULATION: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Group Ride Simulation",
  description: "Variable intensity ride simulating group ride dynamics",
  activity_category: "bike",
  activity_location: "outdoor",
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
      targets: [Target.ftp(150)],
      notes: "All-out sprint to simulate group ride finish",
    })
    .step({
      name: "Cool-down Spin",
      duration: Duration.minutes(14),
      targets: [Target.ftp(50)],
      notes: "Easy spinning to cool down after efforts",
    })
    .build(),
};

export const SAMPLE_OUTDOOR_BIKE_ACTIVITIES: Array<RecordingServiceActivityPlan> =
  [
    EASY_ENDURANCE_RIDE,
    SWEET_SPOT_OUTDOOR_RIDE,
    TEMPO_INTERVALS_RIDE,
    CLIMBING_INTERVALS_RIDE,
    GROUP_RIDE_SIMULATION,
  ];
