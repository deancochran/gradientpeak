import { activityPlanAuthoringStructureSchema } from "../activity-plan";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import type { SystemActivityPlanTemplate } from "./types";

const target = (intensity: number) => [{ type: "RPE" as const, intensity }];

function componentPlan({
  id,
  name,
  description,
  activity_category,
  segmentId,
  intervalId,
  stepId,
  seconds,
  intensity,
}: {
  id: string;
  name: string;
  description: string;
  activity_category: CanonicalActivityCategory;
  segmentId: string;
  intervalId: string;
  stepId: string;
  seconds: number;
  intensity: number;
}): SystemActivityPlanTemplate {
  return {
    id,
    name,
    description,
    gps_recording_enabled: activity_category === "run" || activity_category === "bike",
    structure: activityPlanAuthoringStructureSchema.parse({
      version: 3,
      activity_category,
      segments: [
        {
          id: segmentId,
          name,
          role: "activity",
          intervals: [
            {
              id: intervalId,
              name,
              repetitions: 1,
              steps: [
                {
                  id: stepId,
                  name,
                  purpose: "work",
                  duration: { type: "time", seconds },
                  targets: target(intensity),
                },
              ],
            },
          ],
        },
      ],
    }),
  };
}

export const SPRINT_TRIATHLON_SWIM_COMPONENT = componentPlan({
  id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116201",
  name: "Sprint Base Swim",
  description: "Swim component for a same-day sprint-base schedule.",
  activity_category: "swim",
  segmentId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116211",
  intervalId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116212",
  stepId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116213",
  seconds: 1200,
  intensity: 5,
});

export const SPRINT_TRIATHLON_BIKE_COMPONENT = componentPlan({
  id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116202",
  name: "Sprint Base Bike",
  description: "Bike component for a same-day sprint-base schedule.",
  activity_category: "bike",
  segmentId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116221",
  intervalId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116222",
  stepId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116223",
  seconds: 2700,
  intensity: 6,
});

export const SPRINT_TRIATHLON_RUN_COMPONENT = componentPlan({
  id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116203",
  name: "Sprint Base Run",
  description: "Run component for a same-day sprint-base schedule.",
  activity_category: "run",
  segmentId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116231",
  intervalId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116232",
  stepId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116233",
  seconds: 1500,
  intensity: 6,
});

export const DUATHLON_OPENING_RUN_COMPONENT = componentPlan({
  id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116204",
  name: "Duathlon Base Run",
  description: "Opening run component for a same-day duathlon-base schedule.",
  activity_category: "run",
  segmentId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116241",
  intervalId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116242",
  stepId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116243",
  seconds: 1200,
  intensity: 5,
});

export const DUATHLON_BIKE_COMPONENT = componentPlan({
  id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116205",
  name: "Duathlon Base Bike",
  description: "Bike component for a same-day duathlon-base schedule.",
  activity_category: "bike",
  segmentId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116251",
  intervalId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116252",
  stepId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116253",
  seconds: 2400,
  intensity: 6,
});

export const DUATHLON_CLOSING_RUN_COMPONENT = componentPlan({
  id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116206",
  name: "Duathlon Progression Run",
  description: "Closing run component for a same-day duathlon-base schedule.",
  activity_category: "run",
  segmentId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116261",
  intervalId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116262",
  stepId: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116263",
  seconds: 1200,
  intensity: 7,
});

/** Single-activity_category components intentionally scheduled as independent same-day events. */
export const SAMPLE_MULTISPORT_COMPONENT_ACTIVITIES = [
  SPRINT_TRIATHLON_SWIM_COMPONENT,
  SPRINT_TRIATHLON_BIKE_COMPONENT,
  SPRINT_TRIATHLON_RUN_COMPONENT,
  DUATHLON_OPENING_RUN_COMPONENT,
  DUATHLON_BIKE_COMPONENT,
  DUATHLON_CLOSING_RUN_COMPONENT,
] as const;
