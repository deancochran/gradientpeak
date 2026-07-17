import type { SystemActivityPlanTemplate } from "./types";

const target = (intensity: number) => [{ type: "RPE" as const, intensity }];
const timedStep = (id: string, name: string, seconds: number, intensity: number) => ({
  id,
  name,
  duration: { type: "time" as const, seconds },
  targets: target(intensity),
});
const activitySegment = (
  id: string,
  name: string,
  category: "run" | "bike" | "swim",
  intervalId: string,
  stepId: string,
  seconds: number,
  intensity: number,
) => ({
  id,
  name,
  role: "activity" as const,
  category,
  intervals: [
    {
      id: intervalId,
      name,
      repetitions: 1,
      steps: [timedStep(stepId, name, seconds, intensity)],
    },
  ],
});
const transition = (id: string, name: string, seconds: number) => ({
  id,
  name,
  role: "transition" as const,
  duration: { type: "time" as const, seconds },
});

export const SPRINT_TRIATHLON_BRICK: SystemActivityPlanTemplate = {
  id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116101",
  version: "3.0",
  name: "Sprint Triathlon Brick",
  description: "Continuous swim-to-bike-to-run brick with explicit timed transitions.",
  activity_category: "other",
  gps_recording_enabled: true,
  structure: {
    version: 3,
    segments: [
      activitySegment(
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116111",
        "Swim",
        "swim",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116112",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116113",
        1200,
        5,
      ),
      transition("73d53dd1-f8b8-4d7f-9ba7-dfa4de116114", "Transition 1", 240),
      activitySegment(
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116115",
        "Bike",
        "bike",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116116",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116117",
        2700,
        6,
      ),
      transition("73d53dd1-f8b8-4d7f-9ba7-dfa4de116118", "Transition 2", 180),
      activitySegment(
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116119",
        "Run",
        "run",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116120",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116121",
        1500,
        6,
      ),
    ],
  } as SystemActivityPlanTemplate["structure"],
};

export const RUN_BIKE_RUN_TRANSITION_PRACTICE: SystemActivityPlanTemplate = {
  id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116102",
  version: "3.0",
  name: "Run-Bike-Run Transition Practice",
  description: "Repeated-category run-to-bike-to-run brick for duathlon transition practice.",
  activity_category: "other",
  gps_recording_enabled: true,
  structure: {
    version: 3,
    segments: [
      activitySegment(
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116131",
        "Opening Run",
        "run",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116132",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116133",
        1200,
        5,
      ),
      transition("73d53dd1-f8b8-4d7f-9ba7-dfa4de116134", "Run to Bike", 180),
      activitySegment(
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116135",
        "Bike",
        "bike",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116136",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116137",
        2400,
        6,
      ),
      transition("73d53dd1-f8b8-4d7f-9ba7-dfa4de116138", "Bike to Run", 180),
      activitySegment(
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116139",
        "Closing Run",
        "run",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116140",
        "73d53dd1-f8b8-4d7f-9ba7-dfa4de116141",
        1200,
        7,
      ),
    ],
  } as SystemActivityPlanTemplate["structure"],
};

export const SAMPLE_MULTISPORT_ACTIVITIES = [
  SPRINT_TRIATHLON_BRICK,
  RUN_BIKE_RUN_TRANSITION_PRACTICE,
] as const;
