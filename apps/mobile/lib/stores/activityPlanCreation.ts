import { type Step, type StepOrRepetition } from "@repo/core";
import { create } from "zustand";

interface ActivityPlanCreationState {
  // Form data
  name: string;
  description: string;
  activityType: string;
  structure: {
    steps: StepOrRepetition[];
  };

  // Actions
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setActivityType: (type: string) => void;
  setStructure: (structure: { steps: StepOrRepetition[] }) => void;
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
  activityType: "outdoor_run",
  structure: { steps: [] },
};

export const useActivityPlanCreationStore = create<ActivityPlanCreationState>(
  (set) => ({
    // Initial state
    ...initialState,

    // Actions
    setName: (name) => set({ name }),
    setDescription: (description) => set({ description }),
    setActivityType: (activityType) => set({ activityType }),
    setStructure: (structure) => set({ structure }),

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

    reorderSteps: (steps) =>
      set({ structure: { steps } }),

    updateRepeatAtIndex: (index, repeat) =>
      set((state) => {
        const newSteps = [...state.structure.steps];
        newSteps[index] = repeat;
        return { structure: { steps: newSteps } };
      }),

    reset: () => set({
      ...initialState,
      name: generateDefaultActivityName(), // Generate fresh timestamp on reset
    }),
  })
);
