import type {
  ActivityPlanActivitySegment,
  ActivityPlanInterval,
  ActivityPlanIntervalStep,
  ActivityPlanSegment,
  CanonicalActivityCategory,
  EditableActivityPlanStructure,
} from "@repo/core";
import { ACTIVITY_PLAN_LIMITS } from "@repo/core";
import { randomUUID } from "expo-crypto";
import { create } from "zustand";

export type { EditableActivityPlanStructure } from "@repo/core";

export type ActivityPlanCopyResult = { success: true } | { success: false; error: string };

interface ActivityPlanCreationState {
  name: string;
  description: string;
  /** The one plan-level activity_category; all authored activity segments inherit it. */
  activityCategory: CanonicalActivityCategory;
  structure: EditableActivityPlanStructure;
  notes: string;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setActivityCategory: (activity_category: CanonicalActivityCategory) => void;
  setStructure: (structure: EditableActivityPlanStructure) => void;
  setSegments: (segments: ActivityPlanSegment[]) => void;
  setNotes: (notes: string) => void;
  addSegment: (segment: ActivityPlanSegment) => void;
  updateSegment: (segmentId: string, segment: ActivityPlanSegment) => void;
  removeSegment: (segmentId: string) => void;
  reorderSegments: (segments: ActivityPlanSegment[]) => void;
  addInterval: (interval: ActivityPlanInterval, segmentId?: string) => void;
  updateInterval: (intervalId: string, interval: ActivityPlanInterval) => void;
  removeInterval: (intervalId: string) => void;
  reorderIntervals: (intervals: ActivityPlanInterval[], segmentId?: string) => void;
  copyInterval: (intervalId: string) => ActivityPlanCopyResult;
  addStepToInterval: (intervalId: string, step: ActivityPlanIntervalStep) => void;
  updateStepInInterval: (
    intervalId: string,
    stepId: string,
    step: ActivityPlanIntervalStep,
  ) => void;
  removeStepFromInterval: (intervalId: string, stepId: string) => void;
  reorderStepsInInterval: (intervalId: string, steps: ActivityPlanIntervalStep[]) => void;
  copyStepInInterval: (intervalId: string, stepId: string) => ActivityPlanCopyResult;
  reset: () => void;
}

export function createMinimalActivityPlanStructure(
  activityName = "Main Activity",
  activity_category: CanonicalActivityCategory = "run",
): EditableActivityPlanStructure {
  return {
    version: 3,
    activity_category,
    segments: [
      {
        id: randomUUID(),
        name: activityName,
        role: "activity",
        intervals: [
          {
            id: randomUUID(),
            name: activityName,
            repetitions: 1,
            steps: [
              {
                id: randomUUID(),
                name: activityName,
                purpose: "work",
                duration: { type: "time", seconds: 300 },
                targets: [{ type: "RPE", intensity: 5 }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function mapActivitySegments(
  structure: EditableActivityPlanStructure,
  map: (segment: ActivityPlanActivitySegment) => ActivityPlanActivitySegment,
): EditableActivityPlanStructure {
  return {
    version: 3,
    activity_category: structure.activity_category,
    segments: structure.segments.map((segment) =>
      segment.role === "activity" ? map(segment) : segment,
    ),
  };
}

const initialState = {
  name: "Untitled Run",
  description: "",
  activityCategory: "run" as CanonicalActivityCategory,
  structure: {
    version: 3 as const,
    activity_category: "run" as CanonicalActivityCategory,
    segments: createMinimalActivityPlanStructure().segments,
  },
  notes: "",
};

function expandedStepOccurrences(structure: EditableActivityPlanStructure) {
  return structure.segments.reduce(
    (total, segment) =>
      total +
      (segment.role === "activity"
        ? segment.intervals.reduce(
            (segmentTotal, interval) => segmentTotal + interval.steps.length * interval.repetitions,
            0,
          )
        : 0),
    0,
  );
}

function copyStep(step: ActivityPlanIntervalStep): ActivityPlanIntervalStep {
  return {
    ...step,
    id: randomUUID(),
    name: `${step.name} (Copy)`,
    duration: { ...step.duration },
    targets: step.targets.map((target) => ({ ...target })),
  };
}

export const useActivityPlanCreationStore = create<ActivityPlanCreationState>((set) => ({
  ...initialState,
  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),
  setActivityCategory: (activityCategory) =>
    set((state) => ({
      activityCategory,
      structure: { ...state.structure, activity_category: activityCategory },
    })),
  setStructure: (structure) =>
    set((state) =>
      structure.activity_category === state.activityCategory ? { structure } : state,
    ),
  setSegments: (segments) =>
    set((state) => ({
      structure: {
        version: 3,
        activity_category: state.activityCategory,
        segments,
      },
    })),
  setNotes: (notes) => set({ notes }),
  addSegment: (segment) =>
    set((state) => ({
      structure: {
        version: 3,
        activity_category: state.activityCategory,
        segments: [...state.structure.segments, segment],
      },
    })),
  updateSegment: (segmentId, segment) =>
    set((state) => {
      const segments = state.structure.segments.map((item) =>
        item.id === segmentId ? segment : item,
      );
      return {
        structure: {
          version: 3,
          activity_category: state.activityCategory,
          segments,
        },
      };
    }),
  removeSegment: (segmentId) =>
    set((state) => ({
      structure: {
        version: 3,
        activity_category: state.activityCategory,
        segments: state.structure.segments.filter((item) => item.id !== segmentId),
      },
    })),
  reorderSegments: (segments) =>
    set((state) => ({
      structure: {
        version: 3,
        activity_category: state.activityCategory,
        segments,
      },
    })),
  addInterval: (interval, segmentId) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) =>
        segment.id === segmentId ||
        (!segmentId &&
          segment === state.structure.segments.find((item) => item.role === "activity"))
          ? { ...segment, intervals: [...segment.intervals, interval] }
          : segment,
      ),
    })),
  updateInterval: (intervalId, interval) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) => ({
        ...segment,
        intervals: segment.intervals.map((item) => (item.id === intervalId ? interval : item)),
      })),
    })),
  removeInterval: (intervalId) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) => ({
        ...segment,
        intervals: segment.intervals.filter((item) => item.id !== intervalId),
      })),
    })),
  reorderIntervals: (intervals, segmentId) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) =>
        segment.id === segmentId ||
        (!segmentId &&
          segment.intervals.some((item) => intervals.some((candidate) => candidate.id === item.id)))
          ? { ...segment, intervals }
          : segment,
      ),
    })),
  copyInterval: (intervalId) => {
    let result: ActivityPlanCopyResult = {
      success: false,
      error: "Interval was not found.",
    };
    set((state) => {
      const segment = state.structure.segments.find(
        (item) =>
          item.role === "activity" && item.intervals.some((interval) => interval.id === intervalId),
      );
      if (!segment || segment.role !== "activity") return state;
      const interval = segment.intervals.find((item) => item.id === intervalId);
      if (!interval) return state;
      if (segment.intervals.length >= ACTIVITY_PLAN_LIMITS.maxIntervalsPerActivity) {
        result = {
          success: false,
          error: `An activity can contain at most ${ACTIVITY_PLAN_LIMITS.maxIntervalsPerActivity} intervals.`,
        };
        return state;
      }
      if (
        expandedStepOccurrences(state.structure) + interval.steps.length * interval.repetitions >
        ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences
      ) {
        result = {
          success: false,
          error: `A plan cannot exceed ${ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences} expanded step occurrences.`,
        };
        return state;
      }
      const copiedInterval: ActivityPlanInterval = {
        ...interval,
        id: randomUUID(),
        name: `${interval.name} (Copy)`,
        steps: interval.steps.map(copyStep),
      };
      result = { success: true };
      return {
        structure: mapActivitySegments(state.structure, (item) =>
          item.id === segment.id
            ? {
                ...item,
                intervals: [
                  ...item.intervals.slice(0, item.intervals.indexOf(interval) + 1),
                  copiedInterval,
                  ...item.intervals.slice(item.intervals.indexOf(interval) + 1),
                ],
              }
            : item,
        ),
      };
    });
    return result;
  },
  addStepToInterval: (intervalId, step) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) => ({
        ...segment,
        intervals: segment.intervals.map((interval) =>
          interval.id === intervalId ? { ...interval, steps: [...interval.steps, step] } : interval,
        ),
      })),
    })),
  updateStepInInterval: (intervalId, stepId, step) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) => ({
        ...segment,
        intervals: segment.intervals.map((interval) =>
          interval.id === intervalId
            ? {
                ...interval,
                steps: interval.steps.map((item) => (item.id === stepId ? step : item)),
              }
            : interval,
        ),
      })),
    })),
  removeStepFromInterval: (intervalId, stepId) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) => ({
        ...segment,
        intervals: segment.intervals.map((interval) =>
          interval.id === intervalId
            ? {
                ...interval,
                steps: interval.steps.filter((item) => item.id !== stepId),
              }
            : interval,
        ),
      })),
    })),
  reorderStepsInInterval: (intervalId, steps) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) => ({
        ...segment,
        intervals: segment.intervals.map((interval) =>
          interval.id === intervalId ? { ...interval, steps } : interval,
        ),
      })),
    })),
  copyStepInInterval: (intervalId, stepId) => {
    let result: ActivityPlanCopyResult = {
      success: false,
      error: "Step was not found.",
    };
    set((state) => {
      const interval = state.structure.segments
        .filter((segment): segment is ActivityPlanActivitySegment => segment.role === "activity")
        .flatMap((segment) => segment.intervals)
        .find((item) => item.id === intervalId);
      const step = interval?.steps.find((item) => item.id === stepId);
      if (!interval || !step) return state;
      if (interval.steps.length >= ACTIVITY_PLAN_LIMITS.maxStepsPerInterval) {
        result = {
          success: false,
          error: `An interval can contain at most ${ACTIVITY_PLAN_LIMITS.maxStepsPerInterval} steps.`,
        };
        return state;
      }
      if (
        expandedStepOccurrences(state.structure) + interval.repetitions >
        ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences
      ) {
        result = {
          success: false,
          error: `A plan cannot exceed ${ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences} expanded step occurrences.`,
        };
        return state;
      }
      const copiedStep = copyStep(step);
      result = { success: true };
      return {
        structure: mapActivitySegments(state.structure, (segment) => ({
          ...segment,
          intervals: segment.intervals.map((item) =>
            item.id === intervalId
              ? {
                  ...item,
                  steps: [
                    ...item.steps.slice(0, item.steps.indexOf(step) + 1),
                    copiedStep,
                    ...item.steps.slice(item.steps.indexOf(step) + 1),
                  ],
                }
              : item,
          ),
        })),
      };
    });
    return result;
  },
  reset: () => set(initialState),
}));
