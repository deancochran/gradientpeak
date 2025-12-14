import {
  type ActivityPlanStructureV2,
  type PlanStepV2,
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

  // V2 Step management
  addStep: (step: PlanStepV2) => void;
  addSteps: (steps: PlanStepV2[]) => void;
  updateStep: (index: number, step: PlanStepV2) => void;
  removeStep: (index: number) => void;
  removeSteps: (indices: number[]) => void;
  reorderSteps: (steps: PlanStepV2[]) => void;

  // Segment management
  updateSegmentName: (oldName: string, newName: string) => void;
  removeSegment: (segmentName: string) => void;

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
  structure: { version: 2 as const, steps: [] },
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

    // V2 Step management
    addStep: (step) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: [...state.structure.steps, step],
        },
      })),

    addSteps: (steps) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: [...state.structure.steps, ...steps],
        },
      })),

    updateStep: (index, step) =>
      set((state) => {
        const newSteps = [...state.structure.steps];
        newSteps[index] = step;
        return { structure: { version: 2, steps: newSteps } };
      }),

    removeStep: (index) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: state.structure.steps.filter((_, i) => i !== index),
        },
      })),

    removeSteps: (indices) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: state.structure.steps.filter((_, i) => !indices.includes(i)),
        },
      })),

    reorderSteps: (steps) => set({ structure: { version: 2, steps } }),

    // Segment management
    updateSegmentName: (oldName, newName) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: state.structure.steps.map((step) =>
            step.segmentName === oldName
              ? { ...step, segmentName: newName }
              : step,
          ),
        },
      })),

    removeSegment: (segmentName) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: state.structure.steps.filter(
            (step) => step.segmentName !== segmentName,
          ),
        },
      })),

    reset: () =>
      set({
        ...initialState,
        name: generateDefaultActivityName(), // Generate fresh timestamp on reset
      }),
  }),
);
