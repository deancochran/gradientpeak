import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * Easy Aerobic Run - Outdoor
 * Total time: 30 minutes
 * Estimated TSS: ~25
 */
export const EASY_AEROBIC_RUN: RecordingServiceActivityPlan = {
  id: "3b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e",
  version: "2.0",
  name: "Easy Aerobic Run",
  description: "Comfortable outdoor run focusing on aerobic base building",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Easy Run",
      duration: Duration.minutes(30),
      targets: [Target.thresholdHR(65)],
      notes: "Should feel comfortable and easy - you should be able to hold a conversation",
    })
    .build(),
};

/**
 * Tempo Run - Outdoor
 * Total time: 60 minutes
 * Estimated TSS: ~75
 */
export const TEMPO_RUN: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Tempo Run",
  description: "Sustained tempo effort with warm-up and cool-down",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Warm-up Jog",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
      notes: "Gradually increase pace to prepare for tempo",
    })
    .step({
      name: "Tempo Block",
      duration: Duration.minutes(30),
      targets: [Target.thresholdHR(85)],
      notes: "Steady, controlled effort - should feel comfortably hard",
    })
    .step({
      name: "Cool-down Jog",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
      notes: "Relax and gradually bring heart rate down",
    })
    .build(),
};

/**
 * Interval Training - Outdoor
 * Total time: 55 minutes
 * Estimated TSS: ~85
 */
export const INTERVAL_RUN: RecordingServiceActivityPlan = {
  id: "4c7d8e9f-0a1b-2c3d-4e5f-6a7b8c9d0e1f",
  version: "2.0",
  name: "5K Pace Intervals",
  description: "High-intensity intervals at 5K race pace",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Warm-up",
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
      notes: "Start easy and gradually build pace",
    })
    .interval({
      repeat: 6,
      steps: [
        {
          name: "5K Pace Interval",
          duration: Duration.minutes(3),
          targets: [Target.thresholdHR(95)],
          notes: "Run at your 5K race pace - this should feel hard",
        },
        {
          name: "Recovery Jog",
          duration: Duration.minutes(2),
          targets: [Target.thresholdHR(70)],
          notes: "Active recovery - keep moving but very easy",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Easy pace to bring heart rate down",
    })
    .build(),
};

/**
 * Long Run - Outdoor
 * Total time: 90 minutes
 * Estimated TSS: ~65
 */
export const LONG_RUN: RecordingServiceActivityPlan = {
  id: "5d8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
  version: "2.0",
  name: "Long Steady Run",
  description: "Extended aerobic run for endurance building",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Easy Start",
      duration: Duration.minutes(30),
      targets: [Target.thresholdHR(65)],
      notes: "Start easy and settle into rhythm",
    })
    .step({
      name: "Steady Middle",
      duration: Duration.seconds(3000), // 50 minutes
      targets: [Target.thresholdHR(75)],
      notes: "Maintain steady, comfortable effort",
    })
    .step({
      name: "Easy Finish",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Relax and finish strong but controlled",
    })
    .build(),
};

/**
 * Fartlek Run - Outdoor
 * Total time: 50 minutes
 * Estimated TSS: ~70
 */
export const FARTLEK_RUN: RecordingServiceActivityPlan = {
  id: "6e9f0a1b-2c3d-4e5f-6a7b-8c9d0e1f2a3b",
  version: "2.0",
  name: "Fartlek Training",
  description: "Unstructured speed play with varied intensities",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .step({
      name: "Warm-up",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Start easy and prepare for varied efforts",
    })
    .interval({
      repeat: 8,
      steps: [
        {
          name: "Hard Surge",
          duration: Duration.seconds(90),
          targets: [Target.thresholdHR(90)],
          notes: "Surge to hard effort - use terrain and feel",
        },
        {
          name: "Easy Recovery",
          duration: Duration.seconds(150),
          targets: [Target.thresholdHR(70)],
          notes: "Relax and recover between surges",
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Easy pace to bring heart rate down",
    })
    .build(),
};

export const SYSTEM_TEMPO_RUN: RecordingServiceActivityPlan = {
  id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
  version: "2.0",
  name: "Tempo Run",
  description:
    "20 minute tempo run at 85% threshold heart rate - Comfortably hard sustained effort",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
      notes: "Easy warmup pace",
    })
    .step({
      name: "Tempo",
      duration: Duration.minutes(20),
      targets: [Target.thresholdHR(85), Target.bpm(165)],
      notes: "Comfortably hard tempo pace",
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
      notes: "Easy cool down",
    })
    .build(),
};

export const SYSTEM_THRESHOLD_INTERVALS_RUN: RecordingServiceActivityPlan = {
  id: "c7d3e6f5-0a4b-9c8d-3e2f-4a1b7c6d5e3a",
  version: "2.0",
  name: "Threshold Intervals",
  description: "6x1km at 95% threshold heart rate with 2min recovery - Build speed endurance",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
    })
    .interval({
      repeat: 6,
      name: "Intervals",
      steps: [
        {
          name: "Fast",
          duration: Duration.km(1),
          targets: [Target.thresholdHR(95)],
          notes: "Threshold pace",
        },
        {
          name: "Recovery",
          duration: Duration.minutes(2),
          targets: [Target.thresholdHR(60)],
          notes: "Easy jog",
        },
      ],
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
    })
    .build(),
};

export const SYSTEM_LONG_EASY_RUN: RecordingServiceActivityPlan = {
  id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
  version: "2.0",
  name: "Long Easy Run",
  description: "15km easy long run at 70% threshold heart rate - Build aerobic endurance",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(65)],
    })
    .step({
      name: "Easy Long Run",
      duration: Duration.km(15),
      targets: [Target.thresholdHR(70), Target.bpm(145)],
      notes: "Maintain steady aerobic pace",
      intervalName: "Main Set",
    })
    .cooldown({
      duration: Duration.minutes(5),
      targets: [Target.thresholdHR(60)],
    })
    .build(),
};

export const SYSTEM_MARATHON_PACE_LONG_RUN: RecordingServiceActivityPlan = {
  id: "7e5f8a9b-1c4d-4e6f-8a2b-9c1d3e5f7a9b",
  version: "2.0",
  name: "Marathon Pace Long Run",
  description: "Long run with controlled marathon-pace segments to build race-specific durability.",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.minutes(15),
      targets: [Target.thresholdHR(65)],
      notes: "Ease in and settle into relaxed aerobic rhythm.",
    })
    .step({
      name: "Aerobic Settling",
      duration: Duration.minutes(40),
      targets: [Target.thresholdHR(70), Target.bpm(148)],
      notes: "Stay smooth and controlled before race-pace work begins.",
    })
    .step({
      name: "Marathon Pace",
      duration: Duration.minutes(20),
      targets: [Target.thresholdHR(82), Target.bpm(158)],
      notes: "Controlled race pace with strong form and even effort.",
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.thresholdHR(60)],
      notes: "Relax the pace and finish under control.",
    })
    .build(),
};

export const SYSTEM_TRACK_100M_STRIDES: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Track 100m Strides",
  description:
    "Classic track strides session: easy distance warmup, 5x100m fast relaxed strides, 100m walk recoveries, and easy distance cooldown.",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.meters(800),
      targets: [Target.thresholdHR(65)],
      notes: "Two easy laps before controlled fast running.",
    })
    .interval({
      repeat: 5,
      name: "Strides",
      steps: [
        {
          name: "Fast Stride",
          duration: Duration.meters(100),
          targets: [Target.rpe(8)],
          notes: "Fast but relaxed on the straightaway; focus on form, not sprinting.",
        },
        {
          name: "Walk Recovery",
          duration: Duration.meters(100),
          targets: [Target.rpe(2)],
          notes: "Walk or very easy shuffle back under control.",
        },
      ],
    })
    .cooldown({
      duration: Duration.meters(800),
      targets: [Target.thresholdHR(60)],
      notes: "Two easy laps to finish loose.",
    })
    .build(),
};

export const SYSTEM_TRACK_200M_REPEATS: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Track 200m Repeats",
  description: "Turnover-focused 16x200m track workout with equal-distance 200m jog recoveries.",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.km(1.6),
      targets: [Target.thresholdHR(65)],
      notes: "Four easy laps before the repeat set.",
    })
    .interval({
      repeat: 16,
      name: "200m Repeats",
      steps: [
        {
          name: "Fast 200m",
          duration: Duration.meters(200),
          targets: [Target.rpe(9)],
          notes: "Fast, smooth, and controlled; keep mechanics crisp.",
        },
        {
          name: "Recovery 200m",
          duration: Duration.meters(200),
          targets: [Target.thresholdHR(60)],
          notes: "Jog the curve easily before the next rep.",
        },
      ],
    })
    .cooldown({
      duration: Duration.km(1.6),
      targets: [Target.thresholdHR(60)],
    })
    .build(),
};

export const SYSTEM_TRACK_400M_REPEATS: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Track 400m Repeats",
  description:
    "Staple 8x400m track session for 5K/10K speed, using 100m distance recoveries instead of timed rest.",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.km(1.6),
      targets: [Target.thresholdHR(65)],
      notes: "Four easy laps with drills or strides if desired.",
    })
    .interval({
      repeat: 8,
      name: "400m Repeats",
      steps: [
        {
          name: "Fast 400m",
          duration: Duration.meters(400),
          targets: [Target.rpe(8)],
          notes: "One lap at controlled 10K to 5K effort.",
        },
        {
          name: "Recovery 100m",
          duration: Duration.meters(100),
          targets: [Target.thresholdHR(60)],
          notes: "Easy jog or walk recovery by distance.",
        },
      ],
    })
    .cooldown({
      duration: Duration.km(1.6),
      targets: [Target.thresholdHR(60)],
    })
    .build(),
};

export const SYSTEM_TRACK_YASSO_800S: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Track Yasso 800s",
  description:
    "Well-known marathon benchmark workout: 8x800m at comfortably hard threshold effort with 400m jog recoveries.",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.km(3.2),
      targets: [Target.thresholdHR(65)],
      notes: "Eight easy laps before the benchmark set.",
    })
    .interval({
      repeat: 8,
      name: "Yasso 800s",
      steps: [
        {
          name: "800m Repeat",
          duration: Duration.meters(800),
          targets: [Target.thresholdHR(88), Target.rpe(8)],
          notes: "Two laps at a consistent comfortably hard effort.",
        },
        {
          name: "Recovery 400m",
          duration: Duration.meters(400),
          targets: [Target.thresholdHR(60)],
          notes: "One easy lap recovery; keep it relaxed.",
        },
      ],
    })
    .cooldown({
      duration: Duration.km(1.6),
      targets: [Target.thresholdHR(60)],
    })
    .build(),
};

export const SYSTEM_TRACK_MILE_REPEATS: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Track Mile Repeats",
  description:
    "Popular distance-runner benchmark: 3x1600m with 400m jog recoveries for pacing control and race-specific endurance.",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.km(1.6),
      targets: [Target.thresholdHR(65)],
    })
    .interval({
      repeat: 3,
      name: "Mile Repeats",
      steps: [
        {
          name: "1600m Repeat",
          duration: Duration.meters(1600),
          targets: [Target.thresholdHR(90), Target.rpe(8)],
          notes: "Four laps just slower than 5K effort; prioritize even pacing.",
        },
        {
          name: "Recovery 400m",
          duration: Duration.meters(400),
          targets: [Target.thresholdHR(60)],
          notes: "One lap easy jog recovery.",
        },
      ],
    })
    .cooldown({
      duration: Duration.km(1.6),
      targets: [Target.thresholdHR(60)],
    })
    .build(),
};

export const SYSTEM_TRACK_LADDER_WORKOUT: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "Track Ladder Workout",
  description:
    "Classic track ladder progressing through 400m, 800m, 1200m, 1600m, then back down with distance-based recoveries.",
  activity_category: "run",
  gps_recording_enabled: true,
  structure: createPlan()
    .warmup({
      duration: Duration.km(1.6),
      targets: [Target.thresholdHR(65)],
      notes: "Four easy laps before the ladder.",
    })
    .interval({
      repeat: 1,
      name: "Ladder",
      steps: [
        {
          name: "400m",
          duration: Duration.meters(400),
          targets: [Target.rpe(8)],
        },
        {
          name: "Recovery 200m",
          duration: Duration.meters(200),
          targets: [Target.thresholdHR(60)],
        },
        {
          name: "800m",
          duration: Duration.meters(800),
          targets: [Target.thresholdHR(88)],
        },
        {
          name: "Recovery 200m",
          duration: Duration.meters(200),
          targets: [Target.thresholdHR(60)],
        },
        {
          name: "1200m",
          duration: Duration.meters(1200),
          targets: [Target.thresholdHR(88)],
        },
        {
          name: "Recovery 400m",
          duration: Duration.meters(400),
          targets: [Target.thresholdHR(60)],
        },
        {
          name: "1600m",
          duration: Duration.meters(1600),
          targets: [Target.thresholdHR(86)],
        },
        {
          name: "Recovery 400m",
          duration: Duration.meters(400),
          targets: [Target.thresholdHR(60)],
        },
        {
          name: "1200m",
          duration: Duration.meters(1200),
          targets: [Target.thresholdHR(88)],
        },
        {
          name: "Recovery 200m",
          duration: Duration.meters(200),
          targets: [Target.thresholdHR(60)],
        },
        {
          name: "800m",
          duration: Duration.meters(800),
          targets: [Target.thresholdHR(90)],
        },
        {
          name: "Recovery 200m",
          duration: Duration.meters(200),
          targets: [Target.thresholdHR(60)],
        },
        {
          name: "400m",
          duration: Duration.meters(400),
          targets: [Target.rpe(9)],
        },
      ],
    })
    .cooldown({
      duration: Duration.km(1.6),
      targets: [Target.thresholdHR(60)],
    })
    .build(),
};

export const SYSTEM_TRACK_RUN_WORKOUTS: Array<RecordingServiceActivityPlan> = [
  SYSTEM_TRACK_100M_STRIDES,
  SYSTEM_TRACK_200M_REPEATS,
  SYSTEM_TRACK_400M_REPEATS,
  SYSTEM_TRACK_YASSO_800S,
  SYSTEM_TRACK_MILE_REPEATS,
  SYSTEM_TRACK_LADDER_WORKOUT,
];

export const SAMPLE_OUTDOOR_RUN_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  EASY_AEROBIC_RUN,
  INTERVAL_RUN,
  LONG_RUN,
  FARTLEK_RUN,
  SYSTEM_TEMPO_RUN,
  SYSTEM_THRESHOLD_INTERVALS_RUN,
  SYSTEM_LONG_EASY_RUN,
  SYSTEM_MARATHON_PACE_LONG_RUN,
  ...SYSTEM_TRACK_RUN_WORKOUTS,
];
