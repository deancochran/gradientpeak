import type {
  ActivityPlanActivitySegment,
  ActivityPlanInterval,
  ActivityPlanIntervalStep,
  ActivityPlanSegmentV3,
  ActivityPlanStructureV3,
  CanonicalSport,
  EditableActivityPlanStructure,
} from "@repo/core";
import { activityPlanStructureSchemaV3 } from "@repo/core/activity-plan";

export type ActivityPlanSegmentRole = ActivityPlanSegmentV3["role"];

function id() {
  return crypto.randomUUID();
}

export function createActivityPlanStep(name = "Steady effort"): ActivityPlanIntervalStep {
  return {
    id: id(),
    name,
    duration: { type: "time", seconds: 600 },
    targets: [{ type: "RPE", intensity: 5 }],
  };
}

export function createActivityPlanInterval(name = "Main set"): ActivityPlanInterval {
  return {
    id: id(),
    name,
    repetitions: 1,
    steps: [createActivityPlanStep()],
  };
}

export function createActivityPlanSegment(
  role: ActivityPlanSegmentRole,
  category: CanonicalSport = "run",
): ActivityPlanSegmentV3 {
  if (role === "activity") {
    return {
      id: id(),
      role,
      name: "Main activity",
      category,
      intervals: [createActivityPlanInterval()],
    };
  }

  return {
    id: id(),
    role,
    name: role === "transition" ? "Transition" : "Rest",
    duration: { type: "time", seconds: role === "transition" ? 300 : 60 },
  };
}

export function createActivityPlanStructure(
  category: CanonicalSport = "run",
): EditableActivityPlanStructure {
  return { version: 3, segments: [createActivityPlanSegment("activity", category)] };
}

export function parseActivityPlanStructure(value: unknown): ActivityPlanStructureV3 {
  return activityPlanStructureSchemaV3.parse(value);
}

export function updateActivitySegment(
  structure: EditableActivityPlanStructure,
  segmentId: string,
  update: (segment: ActivityPlanSegmentV3) => ActivityPlanSegmentV3,
): EditableActivityPlanStructure {
  return {
    version: 3,
    segments: structure.segments.map((segment) =>
      segment.id === segmentId ? update(segment) : segment,
    ),
  };
}

export function updateActivityInterval(
  structure: EditableActivityPlanStructure,
  intervalId: string,
  update: (interval: ActivityPlanInterval) => ActivityPlanInterval,
): EditableActivityPlanStructure {
  return {
    version: 3,
    segments: structure.segments.map((segment) =>
      segment.role === "activity"
        ? {
            ...segment,
            intervals: segment.intervals.map((interval) =>
              interval.id === intervalId ? update(interval) : interval,
            ),
          }
        : segment,
    ),
  };
}

export function updateActivityStep(
  structure: EditableActivityPlanStructure,
  intervalId: string,
  stepId: string,
  update: (step: ActivityPlanIntervalStep) => ActivityPlanIntervalStep,
) {
  return updateActivityInterval(structure, intervalId, (interval) => ({
    ...interval,
    steps: interval.steps.map((step) => (step.id === stepId ? update(step) : step)),
  }));
}

export function moveActivityPlanItem<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const item = next[index];
  const targetItem = next[target];
  if (item === undefined || targetItem === undefined) return items;
  next[index] = targetItem;
  next[target] = item;
  return next;
}

export function isActivitySegment(
  segment: ActivityPlanSegmentV3,
): segment is ActivityPlanActivitySegment {
  return segment.role === "activity";
}
