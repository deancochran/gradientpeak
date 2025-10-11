import type { RecordingServiceActivityPlan } from "../schemas";

/**
 * Easy Endurance Ride - Outdoor
 * Total time: 60 minutes
 * Estimated TSS: ~45
 */
export const EASY_ENDURANCE_RIDE: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Easy Endurance Ride",
  description: "Comfortable outdoor ride focusing on aerobic base building",
  activity_type: "outdoor_bike",
  estimated_tss: 45,
  estimated_duration: 3600, // 60 minutes
  structure: {
    steps: [
      {
        name: "Easy Ride",
        description: "Maintain comfortable conversational pace",
        type: "step",
        duration: { type: "time", value: 3600, unit: "seconds" }, // 60 min
        targets: [{ type: "%FTP", intensity: 60 }],
        notes: "Keep effort relaxed - you should be able to hold a conversation easily",
      },
    ],
  },
};

/**
 * Sweet Spot Outdoor Ride
 * Total time: 75 minutes
 * Estimated TSS: ~85
 */
export const SWEET_SPOT_OUTDOOR_RIDE: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Sweet Spot Intervals",
  description: "Outdoor ride with sweet spot power intervals",
  activity_type: "outdoor_bike",
  estimated_tss: 85,
  estimated_duration: 4500, // 75 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Warm-up",
        description: "Gradual warm-up to prepare for intervals",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%FTP", intensity: 55 }],
        notes: "Start easy and gradually build intensity",
      },

      // Sweet spot intervals
      {
        type: "repetition",
        repeat: 3,
        steps: [
          {
            name: "Sweet Spot Interval",
            description: "Sustained effort at sweet spot power",
            type: "step",
            duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
            targets: [{ type: "%FTP", intensity: 88 }],
            notes: "Maintain steady power in the sweet spot zone (85-90% FTP)",
          },
          {
            name: "Easy Recovery",
            description: "Easy spinning recovery",
            type: "step",
            duration: { type: "time", value: 300, unit: "seconds" }, // 5 min
            targets: [{ type: "%FTP", intensity: 50 }],
            notes: "Easy spinning to recover between intervals",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy spinning to finish",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%FTP", intensity: 50 }],
        notes: "Easy spinning to bring heart rate down",
      },
    ],
  },
};

/**
 * Tempo Intervals - Outdoor
 * Total time: 80 minutes
 * Estimated TSS: ~90
 */
export const TEMPO_INTERVALS_RIDE: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Tempo Intervals",
  description: "Outdoor ride with sustained tempo efforts",
  activity_type: "outdoor_bike",
  estimated_tss: 90,
  estimated_duration: 4800, // 80 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Progressive Warm-up",
        description: "Build intensity gradually",
        type: "step",
        duration: { type: "time", value: 1200, unit: "seconds" }, // 20 min
        targets: [{ type: "%FTP", intensity: 60 }],
        notes: "Gradually increase effort to prepare for tempo work",
      },

      // Tempo block 1
      {
        name: "Tempo Block 1",
        description: "First sustained tempo effort",
        type: "step",
        duration: { type: "time", value: 1200, unit: "seconds" }, // 20 min
        targets: [{ type: "%FTP", intensity: 78 }],
        notes: "Steady tempo effort - should feel moderately hard but sustainable",
      },

      // Recovery
      {
        name: "Easy Recovery",
        description: "Recovery between tempo blocks",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%FTP", intensity: 55 }],
        notes: "Easy spinning to recover",
      },

      // Tempo block 2
      {
        name: "Tempo Block 2",
        description: "Second sustained tempo effort",
        type: "step",
        duration: { type: "time", value: 1200, unit: "seconds" }, // 20 min
        targets: [{ type: "%FTP", intensity: 78 }],
        notes: "Maintain same effort as first block",
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy spinning to finish",
        type: "step",
        duration: { type: "time", value: 600, unit: "seconds" }, // 10 min
        targets: [{ type: "%FTP", intensity: 50 }],
        notes: "Easy spinning to normalize heart rate",
      },
    ],
  },
};

/**
 * Climbing Intervals - Outdoor
 * Total time: 70 minutes
 * Estimated TSS: ~95
 */
export const CLIMBING_INTERVALS_RIDE: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Climbing Intervals",
  description: "High-intensity climbing intervals for outdoor terrain",
  activity_type: "outdoor_bike",
  estimated_tss: 95,
  estimated_duration: 4200, // 70 minutes
  structure: {
    steps: [
      // Warm-up
      {
        name: "Warm-up",
        description: "Prepare for high-intensity climbing",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%FTP", intensity: 60 }],
        notes: "Include some brief higher efforts to open the legs",
      },

      // Climbing intervals
      {
        type: "repetition",
        repeat: 5,
        steps: [
          {
            name: "Climbing Interval",
            description: "High-intensity climbing effort",
            type: "step",
            duration: { type: "time", value: 360, unit: "seconds" }, // 6 min
            targets: [{ type: "%FTP", intensity: 95 }],
            notes: "Find a good climb and push hard - aim for threshold power",
          },
          {
            name: "Recovery Descent",
            description: "Easy recovery on descent or flat",
            type: "step",
            duration: { type: "time", value: 240, unit: "seconds" }, // 4 min
            targets: [{ type: "%FTP", intensity: 45 }],
            notes: "Use terrain to recover - easy spinning or coasting",
          },
        ],
      },

      // Cool-down
      {
        name: "Cool-down",
        description: "Easy ride to finish",
        type: "step",
        duration: { type: "time", value: 900, unit: "seconds" }, // 15 min
        targets: [{ type: "%FTP", intensity: 50 }],
        notes: "Easy spinning on flat terrain to recover",
      },
    ],
  },
};

/**
 * Group Ride Simulation - Outdoor
 * Total time: 90 minutes
 * Estimated TSS: ~80
 */
export const GROUP_RIDE_SIMULATION: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "Group Ride Simulation",
  description: "Variable intensity ride simulating group ride dynamics",
  activity_type: "outdoor_bike",
  estimated_tss: 80,
  estimated_duration: 5400, // 90 minutes
  structure: {
    steps: [
      // Easy start
      {
        name: "Group Warm-up",
        description: "Easy pace as group settles in",
        type: "step",
        duration: { type: "time", value: 1200, unit: "seconds" }, // 20 min
        targets: [{ type: "%FTP", intensity: 60 }],
        notes: "Conversational pace as group gets organized",
      },

      // Variable efforts simulating group dynamics
      {
        type: "repetition",
        repeat: 8,
        steps: [
          {
            name: "Attack/Chase",
            description: "Hard effort simulating attacks or chases",
            type: "step",
            duration: { type: "time", value: 120, unit: "seconds" }, // 2 min
            targets: [{ type: "%FTP", intensity: 100 }],
            notes: "Hard effort to simulate attacks or bridging gaps",
          },
          {
            name: "Group Tempo",
            description: "Steady group pace",
            type: "step",
            duration: { type: "time", value: 180, unit: "seconds" }, // 3 min
            targets: [{ type: "%FTP", intensity: 75 }],
            notes: "Steady pace as group settles after effort",
          },
          {
            name: "Easy Spinning",
            description: "Recovery in the group",
            type: "step",
            duration: { type: "time", value: 120, unit: "seconds" }, // 2 min
            targets: [{ type: "%FTP", intensity: 55 }],
            notes: "Easy spinning in the bunch",
          },
        ],
      },

      // Final sprint simulation
      {
        name: "Sprint Finish",
        description: "Final sprint to finish",
        type: "step",
        duration: { type: "time", value: 60, unit: "seconds" }, // 1 min
        targets: [{ type: "%FTP", intensity: 150 }],
        notes: "All-out sprint to simulate group ride finish",
      },

      // Cool-down
      {
        name: "Cool-down Spin",
        description: "Easy cool-down",
        type: "step",
        duration: { type: "time", value: 840, unit: "seconds" }, // 14 min
        targets: [{ type: "%FTP", intensity: 50 }],
        notes: "Easy spinning to cool down after efforts",
      },
    ],
  },
};

export const SAMPLE_OUTDOOR_BIKE_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  EASY_ENDURANCE_RIDE,
  SWEET_SPOT_OUTDOOR_RIDE,
  TEMPO_INTERVALS_RIDE,
  CLIMBING_INTERVALS_RIDE,
  GROUP_RIDE_SIMULATION,
];
