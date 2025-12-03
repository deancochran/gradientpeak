import { type Step, type StepOrRepetition } from "@repo/core";
import { create } from "zustand";

interface ActivityPlanCreationState {
  // Form data
  name: string;
  description: string;
  activityLocation: "outdoor" | "indoor";
  activityCategory: "run" | "bike" | "swim" | "strength" | "other";
  structure: {
    steps: StepOrRepetition[];
  };
  routeId: string | null;
  notes: string;

  // Actions
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setActivityLocation: (location: "outdoor" | "indoor") => void;
  setActivityCategory: (
    category: "run" | "bike" | "swim" | "strength" | "other",
  ) => void;
  setStructure: (structure: { steps: StepOrRepetition[] }) => void;
  setRouteId: (routeId: string | null) => void;
  setNotes: (notes: string) => void;
  updateStep: (index: number, step: StepOrRepetition) => void;
  addStep: (step: Step) => void;
  addRepeat: (repeat: StepOrRepetition) => void;
  removeStep: (index: number) => void;
  reorderSteps: (steps: StepOrRepetition[]) => void;

  // Repeat editing
  updateRepeatAtIndex: (index: number, repeat: StepOrRepetition) => void;

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
  structure: { steps: [] },
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

    updateStep: (index, step) =>
      set((state) => {
        const newSteps = [...state.structure.steps];
        newSteps[index] = step;
        return { structure: { steps: newSteps } };
      }),

    addStep: (step) =>
      set((state) => ({
        structure: { steps: [...state.structure.steps, step] },
      })),

    addRepeat: (repeat) =>
      set((state) => ({
        structure: { steps: [...state.structure.steps, repeat] },
      })),

    removeStep: (index) =>
      set((state) => ({
        structure: {
          steps: state.structure.steps.filter((_, i) => i !== index),
        },
      })),

    reorderSteps: (steps) => set({ structure: { steps } }),

    updateRepeatAtIndex: (index, repeat) =>
      set((state) => {
        const newSteps = [...state.structure.steps];
        newSteps[index] = repeat;
        return { structure: { steps: newSteps } };
      }),

    reset: () =>
      set({
        ...initialState,
        name: generateDefaultActivityName(), // Generate fresh timestamp on reset
      }),
  }),
);
