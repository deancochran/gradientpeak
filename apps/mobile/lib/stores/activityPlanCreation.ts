import type {
  ActivityPlanActivitySegment,
  ActivityPlanInterval,
  ActivityPlanIntervalStep,
  ActivityPlanSegmentV3,
  CanonicalSport,
  EditableActivityPlanStructure,
} from "@repo/core";
import { randomUUID } from "expo-crypto";
import { create } from "zustand";

export type { EditableActivityPlanStructure } from "@repo/core";

interface ActivityPlanCreationState {
  name: string;
  description: string;
  /** Presentation default only; segment categories are authoritative. */
  activityCategory: CanonicalSport;
  structure: EditableActivityPlanStructure;
  routeId: string | null;
  notes: string;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setActivityCategory: (category: CanonicalSport) => void;
  setStructure: (structure: EditableActivityPlanStructure) => void;
  setRouteId: (routeId: string | null) => void;
  setNotes: (notes: string) => void;
  addSegment: (segment: ActivityPlanSegmentV3) => void;
  updateSegment: (segmentId: string, segment: ActivityPlanSegmentV3) => void;
  removeSegment: (segmentId: string) => void;
  reorderSegments: (segments: ActivityPlanSegmentV3[]) => void;
  addInterval: (interval: ActivityPlanInterval, segmentId?: string) => void;
  updateInterval: (intervalId: string, interval: ActivityPlanInterval) => void;
  removeInterval: (intervalId: string) => void;
  reorderIntervals: (intervals: ActivityPlanInterval[], segmentId?: string) => void;
  copyInterval: (intervalId: string) => void;
  addStepToInterval: (intervalId: string, step: ActivityPlanIntervalStep) => void;
  updateStepInInterval: (
    intervalId: string,
    stepId: string,
    step: ActivityPlanIntervalStep,
  ) => void;
  removeStepFromInterval: (intervalId: string, stepId: string) => void;
  reorderStepsInInterval: (intervalId: string, steps: ActivityPlanIntervalStep[]) => void;
  copyStepInInterval: (intervalId: string, stepId: string) => void;
  reset: () => void;
}

export function createMinimalActivityPlanStructure(
  activityName = "Main Activity",
  category: CanonicalSport = "run",
): EditableActivityPlanStructure {
  return {
    version: 3,
    segments: [
      {
        id: randomUUID(),
        name: activityName,
        role: "activity",
        category,
        intervals: [
          {
            id: randomUUID(),
            name: activityName,
            repetitions: 1,
            steps: [
              {
                id: randomUUID(),
                name: activityName,
                duration: { type: "untilFinished" },
                targets: [{ type: "RPE", intensity: 5 }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function generateDefaultActivityName(): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `Activity Plan - ${date} ${time}`;
}

function mapActivitySegments(
  structure: EditableActivityPlanStructure,
  map: (segment: ActivityPlanActivitySegment) => ActivityPlanActivitySegment,
): EditableActivityPlanStructure {
  return {
    version: 3,
    segments: structure.segments.map((segment) =>
      segment.role === "activity" ? map(segment) : segment,
    ),
  };
}

const initialState = {
  name: generateDefaultActivityName(),
  description: "",
  activityCategory: "run" as CanonicalSport,
  structure: { version: 3 as const, segments: [] as ActivityPlanSegmentV3[] },
  routeId: null,
  notes: "",
};

export const useActivityPlanCreationStore = create<ActivityPlanCreationState>((set) => ({
  ...initialState,
  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),
  setActivityCategory: (activityCategory) => set({ activityCategory }),
  setStructure: (structure) => set({ structure }),
  setRouteId: (routeId) => set({ routeId }),
  setNotes: (notes) => set({ notes }),
  addSegment: (segment) =>
    set((state) => ({
      structure: { version: 3, segments: [...state.structure.segments, segment] },
    })),
  updateSegment: (segmentId, segment) =>
    set((state) => ({
      structure: {
        version: 3,
        segments: state.structure.segments.map((item) => (item.id === segmentId ? segment : item)),
      },
    })),
  removeSegment: (segmentId) =>
    set((state) => ({
      structure: {
        version: 3,
        segments: state.structure.segments.filter((item) => item.id !== segmentId),
      },
    })),
  reorderSegments: (segments) => set({ structure: { version: 3, segments } }),
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
  copyInterval: (intervalId) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) => {
        const interval = segment.intervals.find((item) => item.id === intervalId);
        if (!interval) return segment;
        return {
          ...segment,
          intervals: [
            ...segment.intervals,
            {
              ...interval,
              id: randomUUID(),
              name: `${interval.name} (Copy)`,
              steps: interval.steps.map((step) => ({ ...step, id: randomUUID() })),
            },
          ],
        };
      }),
    })),
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
            ? { ...interval, steps: interval.steps.filter((item) => item.id !== stepId) }
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
  copyStepInInterval: (intervalId, stepId) =>
    set((state) => ({
      structure: mapActivitySegments(state.structure, (segment) => ({
        ...segment,
        intervals: segment.intervals.map((interval) => {
          if (interval.id !== intervalId) return interval;
          const step = interval.steps.find((item) => item.id === stepId);
          return step
            ? {
                ...interval,
                steps: [
                  ...interval.steps,
                  { ...step, id: randomUUID(), name: `${step.name} (Copy)` },
                ],
              }
            : interval;
        }),
      })),
    })),
  reset: () => set({ ...initialState, name: generateDefaultActivityName() }),
}));
