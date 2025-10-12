import type { RecordingServiceActivityPlan } from "../schemas";

/**
 * DEV SAMPLE 1 – Indoor Bike Trainer Stress Test
 * Demonstrates %FTP, cadence, and nested repetition handling.
 */
export const DEV_SAMPLE_BIKE: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "DEV – Indoor Bike Trainer Schema Demo",
  activity_type: "indoor_bike_trainer",
  description:
    "Compact 1-minute workout using mixed target types and nested steps to validate schema logic.",
  estimated_duration: 60,
  estimated_tss: 1,
  structure: {
    steps: [
      {
        type: "step",
        name: "Warm-up Spin",
        duration: { type: "time", value: 8, unit: "seconds" },
        targets: [{ type: "%FTP", intensity: 55 }],
        notes: "Basic warm-up validation step",
      },
      {
        type: "repetition",
        repeat: 2,
        steps: [
          {
            type: "step",
            name: "Cadence Surge",
            duration: { type: "time", value: 6, unit: "seconds" },
            targets: [
              { type: "cadence", intensity: 110 },
              { type: "%FTP", intensity: 85 },
            ],
            notes: "Dual-target test",
          },
          {
            type: "step",
            name: "Recovery",
            duration: { type: "time", value: 4, unit: "seconds" },
            targets: [{ type: "%FTP", intensity: 50 }],
          },
        ],
      },
      {
        type: "step",
        name: "Cool-down",
        duration: { type: "time", value: 12, unit: "seconds" },
        targets: [{ type: "%ThresholdHR", intensity: 70 }],
        notes: "Schema end step",
      },
    ],
  },
};

/**
 * DEV SAMPLE 2 – Outdoor Run Test
 * Validates HR, RPE, and mixed step durations.
 */
export const DEV_SAMPLE_RUN: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "DEV – Outdoor Run Schema Demo",
  activity_type: "outdoor_run",
  description:
    "1-minute developer workout to validate heart-rate and RPE parsing for run-type plans.",
  estimated_duration: 60,
  estimated_tss: 1,
  structure: {
    steps: [
      {
        type: "step",
        name: "Warm-up Jog",
        duration: { type: "time", value: 10, unit: "seconds" },
        targets: [{ type: "%ThresholdHR", intensity: 60 }],
      },
      {
        type: "step",
        name: "Tempo Push",
        duration: { type: "time", value: 15, unit: "seconds" },
        targets: [
          { type: "%MaxHR", intensity: 90 },
          { type: "RPE", intensity: 8 },
        ],
        notes: "Dual HR + RPE mapping",
      },
      {
        type: "step",
        name: "Short Recovery",
        duration: { type: "time", value: 10, unit: "seconds" },
        targets: [{ type: "RPE", intensity: 4 }],
      },
      {
        type: "repetition",
        repeat: 2,
        steps: [
          {
            type: "step",
            name: "Strides",
            duration: { type: "time", value: 5, unit: "seconds" },
            targets: [{ type: "cadence", intensity: 180 }],
          },
        ],
      },
      {
        type: "step",
        name: "Cooldown",
        duration: { type: "time", value: 10, unit: "seconds" },
        targets: [{ type: "%ThresholdHR", intensity: 65 }],
      },
    ],
  },
};

/**
 * DEV SAMPLE 3 – Indoor Treadmill Test
 * Includes RPE, speed, and nested repetition sequence.
 */
export const DEV_SAMPLE_TREADMILL: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "DEV – Treadmill Schema Demo",
  activity_type: "indoor_treadmill",
  description:
    "Short treadmill validation workout testing RPE, speed, and nested repetitions.",
  estimated_duration: 60,
  estimated_tss: 1,
  structure: {
    steps: [
      {
        type: "step",
        name: "Walk Warm-up",
        duration: { type: "time", value: 10, unit: "seconds" },
        targets: [{ type: "speed", intensity: 4.5 }],
      },
      {
        type: "repetition",
        repeat: 2,
        steps: [
          {
            type: "step",
            name: "Run Burst",
            duration: { type: "time", value: 8, unit: "seconds" },
            targets: [{ type: "RPE", intensity: 9 }],
            notes: "Short high effort",
          },
          {
            type: "step",
            name: "Recovery Jog",
            duration: { type: "time", value: 4, unit: "seconds" },
            targets: [{ type: "speed", intensity: 5.0 }],
          },
        ],
      },
      {
        type: "step",
        name: "Cool-down",
        duration: { type: "time", value: 10, unit: "seconds" },
        targets: [{ type: "RPE", intensity: 5 }],
      },
    ],
  },
};

/**
 * DEV SAMPLE 4 – Indoor Swim Test
 * Tests distance-based durations, RPE, and cadence (stroke rate) targets.
 */
export const DEV_SAMPLE_SWIM: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "DEV – Swim Schema Demo",
  activity_type: "indoor_swim",
  description:
    "Compact swim plan verifying distance units and stroke-rate handling.",
  estimated_duration: 60,
  estimated_tss: 1,
  structure: {
    steps: [
      {
        type: "step",
        name: "Warm-up",
        duration: { type: "distance", value: 25, unit: "meters" },
        targets: [{ type: "RPE", intensity: 4 }],
      },
      {
        type: "step",
        name: "Drill",
        duration: { type: "distance", value: 25, unit: "meters" },
        targets: [{ type: "cadence", intensity: 40 }],
        notes: "Stroke rate check",
      },
      {
        type: "repetition",
        repeat: 2,
        steps: [
          {
            type: "step",
            name: "Sprint Length",
            duration: { type: "distance", value: 12.5, unit: "meters" },
            targets: [{ type: "RPE", intensity: 9 }],
          },
        ],
      },
      {
        type: "step",
        name: "Easy Finish",
        duration: { type: "distance", value: 25, unit: "meters" },
        targets: [{ type: "RPE", intensity: 3 }],
      },
    ],
  },
};

/**
 * DEV SAMPLE 5 – Indoor Strength Test
 * Validates repetitions, resistance control, and multi-metric targeting.
 */
export const DEV_SAMPLE_STRENGTH: RecordingServiceActivityPlan = {
  version: "1.0",
  name: "DEV – Strength Schema Demo",
  activity_type: "indoor_strength",
  description:
    "One-minute strength training plan to validate reps, resistance, and dual targets.",
  estimated_duration: 60,
  estimated_tss: 1,
  structure: {
    steps: [
      {
        type: "step",
        name: "Warm-up Stretch",
        duration: { type: "time", value: 10, unit: "seconds" },
        targets: [{ type: "RPE", intensity: 3 }],
      },
      {
        type: "repetition",
        repeat: 2,
        steps: [
          {
            type: "step",
            name: "Push-ups",
            duration: { type: "repetitions", value: 10, unit: "reps" },
            targets: [{ type: "RPE", intensity: 8 }],
          },
          {
            type: "step",
            name: "Squat Hold",
            duration: { type: "time", value: 6, unit: "seconds" },
            targets: [{ type: "RPE", intensity: 10 }],
            notes: "Resistance + control example",
          },
        ],
      },
      {
        type: "step",
        name: "Cooldown Stretch",
        duration: { type: "time", value: 10, unit: "seconds" },
        targets: [{ type: "RPE", intensity: 4 }],
      },
    ],
  },
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
