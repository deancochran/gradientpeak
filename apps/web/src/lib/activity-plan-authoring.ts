import type {
  ActivityPlanActivitySegment,
  ActivityPlanInterval,
  ActivityPlanIntervalStep,
  ActivityPlanSegment,
  ActivityPlanStructure,
  CanonicalActivityCategory,
  EditableActivityPlanStructure,
} from "@repo/core";
import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { isTargetTypePermittedForActivity } from "@repo/core/targets";

export type ActivityPlanSegmentRole = ActivityPlanSegment["role"];

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
  activity_category: CanonicalActivityCategory = "run",
): ActivityPlanSegment {
  if (role === "activity") {
    return {
      id: id(),
      role,
      name: "Main activity",
      activity_category,
      intervals: [createActivityPlanInterval()],
    };
  }

  return {
    id: id(),
    role,
    name: "Rest",
    duration: { type: "time", seconds: 60 },
  };
}

export function getActivityPlanActivityCategory(
  structure: EditableActivityPlanStructure,
): CanonicalActivityCategory {
  return (
    structure.segments.find((segment) => segment.role === "activity")?.activity_category ?? "run"
  );
}

export function hasIncompatibleTargets(
  structure: EditableActivityPlanStructure,
  activity_category: CanonicalActivityCategory,
) {
  return structure.segments.some(
    (segment) =>
      segment.role === "activity" &&
      segment.intervals.some((interval) =>
        interval.steps.some((step) =>
          step.targets.some(
            (target) =>
              !isTargetTypePermittedForActivity({
                activityCategory: activity_category,
                targetType: target.type,
              }),
          ),
        ),
      ),
  );
}

export function applyActivityPlanActivityCategory(
  structure: EditableActivityPlanStructure,
  activity_category: CanonicalActivityCategory,
  resetIncompatibleTargets = false,
): EditableActivityPlanStructure {
  return {
    version: 3,
    segments: structure.segments.map((segment) => {
      if (segment.role !== "activity") return segment;
      return {
        ...segment,
        activity_category: activity_category,
        intervals: segment.intervals.map((interval) => ({
          ...interval,
          steps: interval.steps.map((step) => ({
            ...step,
            targets:
              resetIncompatibleTargets &&
              step.targets.some(
                (target) =>
                  !isTargetTypePermittedForActivity({
                    activityCategory: activity_category,
                    targetType: target.type,
                  }),
              )
                ? [{ type: "RPE", intensity: 5 }]
                : step.targets,
          })),
        })),
      };
    }),
  };
}

export function createActivityPlanStructure(
  activity_category: CanonicalActivityCategory = "run",
): EditableActivityPlanStructure {
  return { version: 3, segments: [createActivityPlanSegment("activity", activity_category)] };
}

export function parseActivityPlanStructure(value: unknown): ActivityPlanStructure {
  return activityPlanStructureSchema.parse(value);
}

export function updateActivitySegment(
  structure: EditableActivityPlanStructure,
  segmentId: string,
  update: (segment: ActivityPlanSegment) => ActivityPlanSegment,
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
  segment: ActivityPlanSegment,
): segment is ActivityPlanActivitySegment {
  return segment.role === "activity";
}
