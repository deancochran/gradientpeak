import {
  type ActivityPlanStructureV2,
  type IntervalV2,
  type IntervalStepV2,
} from "@repo/core/schemas/activity_plan_v2";
import { create } from "zustand";

interface ActivityPlanCreationState {
  // Form data
  name: string;
  description: string;
  activityLocation: "outdoor" | "indoor";
  activityCategory: "run" | "bike" | "swim" | "strength" | "other";
  structure: ActivityPlanStructureV2;
  routeId: string | null;
  notes: string;

  // Actions
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setActivityLocation: (location: "outdoor" | "indoor") => void;
  setActivityCategory: (
    category: "run" | "bike" | "swim" | "strength" | "other",
  ) => void;
  setStructure: (structure: ActivityPlanStructureV2) => void;
  setRouteId: (routeId: string | null) => void;
  setNotes: (notes: string) => void;

  // V2 Interval management
  addInterval: (interval: IntervalV2) => void;
  updateInterval: (intervalId: string, interval: IntervalV2) => void;
  removeInterval: (intervalId: string) => void;
  reorderIntervals: (intervals: IntervalV2[]) => void;
  copyInterval: (intervalId: string) => void;

  // Step management within intervals
  addStepToInterval: (intervalId: string, step: IntervalStepV2) => void;
  updateStepInInterval: (
    intervalId: string,
    stepId: string,
    step: IntervalStepV2,
  ) => void;
  removeStepFromInterval: (intervalId: string, stepId: string) => void;
  reorderStepsInInterval: (intervalId: string, steps: IntervalStepV2[]) => void;
  copyStepInInterval: (intervalId: string, stepId: string) => void;

  // Reset
  reset: () => void;
}

/**
 * Generate a default timestamped activity name
 */
function generateDefaultActivityName(): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `Activity Plan - ${date} ${time}`;
}

const initialState = {
  name: generateDefaultActivityName(),
  description: "",
  activityLocation: "outdoor" as const,
  activityCategory: "run" as const,
  structure: { version: 2 as const, intervals: [] },
  routeId: null,
  notes: "",
};

export const useActivityPlanCreationStore = create<ActivityPlanCreationState>(
  (set) => ({
    // Initial state
    ...initialState,

    // Actions
    setName: (name) => set({ name }),
    setDescription: (description) => set({ description }),
    setActivityLocation: (activityLocation) => set({ activityLocation }),
    setActivityCategory: (activityCategory) => set({ activityCategory }),
    setStructure: (structure) => set({ structure }),
    setRouteId: (routeId) => set({ routeId }),
    setNotes: (notes) => set({ notes }),

    // V2 Interval management
    addInterval: (interval) =>
      set((state) => ({
        structure: {
          version: 2,
          intervals: [...state.structure.intervals, interval],
        },
      })),

    updateInterval: (intervalId, interval) =>
      set((state) => ({
        structure: {
          version: 2,
          intervals: state.structure.intervals.map((i) =>
            i.id === intervalId ? interval : i,
          ),
        },
      })),

    removeInterval: (intervalId) =>
      set((state) => ({
        structure: {
          version: 2,
          intervals: state.structure.intervals.filter(
            (i) => i.id !== intervalId,
          ),
        },
      })),

    reorderIntervals: (intervals) =>
      set({ structure: { version: 2, intervals } }),

    copyInterval: (intervalId) =>
      set((state) => {
        const interval = state.structure.intervals.find(
          (i) => i.id === intervalId,
        );
        if (!interval) return state;

        // Create a deep copy with new IDs
        const copiedInterval: IntervalV2 = {
          ...interval,
          id: crypto.randomUUID(),
          name: `${interval.name} (Copy)`,
          steps: interval.steps.map((step) => ({
            ...step,
            id: crypto.randomUUID(),
          })),
        };

        return {
          structure: {
            version: 2,
            intervals: [...state.structure.intervals, copiedInterval],
          },
        };
      }),

    // Step management within intervals
    addStepToInterval: (intervalId, step) =>
      set((state) => ({
        structure: {
          version: 2,
          intervals: state.structure.intervals.map((interval) =>
            interval.id === intervalId
              ? { ...interval, steps: [...interval.steps, step] }
              : interval,
          ),
        },
      })),

    updateStepInInterval: (intervalId, stepId, step) =>
      set((state) => ({
        structure: {
          version: 2,
          intervals: state.structure.intervals.map((interval) =>
            interval.id === intervalId
              ? {
                  ...interval,
                  steps: interval.steps.map((s) =>
                    s.id === stepId ? step : s,
                  ),
                }
              : interval,
          ),
        },
      })),

    removeStepFromInterval: (intervalId, stepId) =>
      set((state) => ({
        structure: {
          version: 2,
          intervals: state.structure.intervals.map((interval) =>
            interval.id === intervalId
              ? {
                  ...interval,
                  steps: interval.steps.filter((s) => s.id !== stepId),
                }
              : interval,
          ),
        },
      })),

    reorderStepsInInterval: (intervalId, steps) =>
      set((state) => ({
        structure: {
          version: 2,
          intervals: state.structure.intervals.map((interval) =>
            interval.id === intervalId ? { ...interval, steps } : interval,
          ),
        },
      })),

    copyStepInInterval: (intervalId, stepId) =>
      set((state) => {
        const interval = state.structure.intervals.find(
          (i) => i.id === intervalId,
        );
        if (!interval) return state;

        const step = interval.steps.find((s) => s.id === stepId);
        if (!step) return state;

        // Create a copy with new ID
        const copiedStep: IntervalStepV2 = {
          ...step,
          id: crypto.randomUUID(),
          name: `${step.name} (Copy)`,
        };

        return {
          structure: {
            version: 2,
            intervals: state.structure.intervals.map((i) =>
              i.id === intervalId
                ? { ...i, steps: [...i.steps, copiedStep] }
                : i,
            ),
          },
        };
      }),

    reset: () =>
      set({
        ...initialState,
        name: generateDefaultActivityName(), // Generate fresh timestamp on reset
      }),
  }),
);
