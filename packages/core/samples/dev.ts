import type { RecordingServiceActivityPlan } from "../schemas";
import { createPlan, Duration, Target } from "../schemas/activity_payload";

/**
 * DEV SAMPLE 1 – Indoor Bike Trainer Stress Test
 * Demonstrates %FTP, cadence, and interval handling.
 */
export const DEV_SAMPLE_BIKE: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "DEV – Indoor Bike Trainer Schema Demo",
  description:
    "Compact 1-minute activity using mixed target types and intervals to validate schema logic.",
  structure: createPlan()
    .step({
      name: "Warm-up Spin",
      duration: Duration.seconds(8),
      targets: [Target.ftp(55)],
      notes: "Basic warm-up validation step",
    })
    .interval({
      repeat: 2,
      steps: [
        {
          name: "Cadence Surge",
          duration: Duration.seconds(6),
          targets: [Target.cadence(110), Target.ftp(85)],
          notes: "Dual-target test",
        },
        {
          name: "Recovery",
          duration: Duration.seconds(4),
          targets: [Target.ftp(50)],
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.seconds(12),
      targets: [Target.thresholdHR(70)],
      notes: "Schema end step",
    })
    .build(),
};

/**
 * DEV SAMPLE 2 – Outdoor Run Test
 * Validates HR, RPE, and mixed step durations.
 */
export const DEV_SAMPLE_RUN: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "DEV – Outdoor Run Schema Demo",
  description:
    "1-minute developer activity to validate heart-rate and RPE parsing for run-type plans.",
  structure: createPlan()
    .step({
      name: "Warm-up Jog",
      duration: Duration.seconds(10),
      targets: [Target.thresholdHR(60)],
    })
    .step({
      name: "Tempo Push",
      duration: Duration.seconds(15),
      targets: [Target.maxHR(90), Target.rpe(8)],
      notes: "Dual HR + RPE mapping",
    })
    .step({
      name: "Short Recovery",
      duration: Duration.seconds(10),
      targets: [Target.rpe(4)],
    })
    .interval({
      repeat: 2,
      steps: [
        {
          name: "Strides",
          duration: Duration.seconds(5),
          targets: [Target.cadence(180)],
        },
      ],
    })
    .step({
      name: "Cooldown",
      duration: Duration.seconds(10),
      targets: [Target.thresholdHR(65)],
    })
    .build(),
};

/**
 * DEV SAMPLE 3 – Indoor Treadmill Test
 * Includes RPE, speed, and nested repetition sequence.
 */
export const DEV_SAMPLE_TREADMILL: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "DEV – Treadmill Schema Demo",
  description:
    "Short treadmill validation activity testing RPE, speed, and intervals.",
  structure: createPlan()
    .step({
      name: "Walk Warm-up",
      duration: Duration.seconds(10),
      targets: [Target.speed(4.5)],
    })
    .interval({
      repeat: 2,
      steps: [
        {
          name: "Run Burst",
          duration: Duration.seconds(8),
          targets: [Target.rpe(9)],
          notes: "Short high effort",
        },
        {
          name: "Recovery Jog",
          duration: Duration.seconds(4),
          targets: [Target.speed(5.0)],
        },
      ],
    })
    .step({
      name: "Cool-down",
      duration: Duration.seconds(10),
      targets: [Target.rpe(5)],
    })
    .build(),
};

/**
 * DEV SAMPLE 4 – Indoor Swim Test
 * Tests distance-based durations, RPE, and cadence (stroke rate) targets.
 */
export const DEV_SAMPLE_SWIM: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "DEV – Swim Schema Demo",
  description:
    "Compact swim plan verifying distance units and stroke-rate handling.",
  structure: createPlan()
    .step({
      name: "Warm-up",
      duration: Duration.meters(25),
      targets: [Target.rpe(4)],
    })
    .step({
      name: "Drill",
      duration: Duration.meters(25),
      targets: [Target.cadence(40)],
      notes: "Stroke rate check",
    })
    .interval({
      repeat: 2,
      steps: [
        {
          name: "Sprint Length",
          duration: Duration.meters(12.5),
          targets: [Target.rpe(9)],
        },
      ],
    })
    .step({
      name: "Easy Finish",
      duration: Duration.meters(25),
      targets: [Target.rpe(3)],
    })
    .build(),
};

/**
 * DEV SAMPLE 5 – Indoor Strength Test
 * Validates repetitions, resistance control, and multi-metric targeting.
 */
export const DEV_SAMPLE_STRENGTH: RecordingServiceActivityPlan = {
  version: "2.0",
  name: "DEV – Strength Schema Demo",
  description:
    "One-minute strength training plan to validate reps, resistance, and dual targets.",
  structure: createPlan()
    .step({
      name: "Warm-up Stretch",
      duration: Duration.seconds(10),
      targets: [Target.rpe(3)],
    })
    .interval({
      repeat: 2,
      steps: [
        {
          name: "Push-ups",
          duration: Duration.reps(10),
          targets: [Target.rpe(8)],
        },
        {
          name: "Squat Hold",
          duration: Duration.seconds(6),
          targets: [Target.rpe(10)],
          notes: "Resistance + control example",
        },
      ],
    })
    .step({
      name: "Cooldown Stretch",
      duration: Duration.seconds(10),
      targets: [Target.rpe(4)],
    })
    .build(),
};

/**
 * Combined developer test exports
 */
export const SAMPLE_DEV_ACTIVITIES: Array<RecordingServiceActivityPlan> = [
  DEV_SAMPLE_BIKE,
  DEV_SAMPLE_RUN,
  DEV_SAMPLE_TREADMILL,
  DEV_SAMPLE_SWIM,
  DEV_SAMPLE_STRENGTH,
];
