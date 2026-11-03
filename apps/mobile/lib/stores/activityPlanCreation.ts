import type {
  ActivityPlanDraftItem,
  ActivityPlanDraftStep,
  ActivityPlanDraftStructure,
  CanonicalActivityCategory,
} from "@repo/core";
import {
  duplicateActivityPlanItem,
  insertActivityPlanItem,
  moveActivityPlanItem,
  removeActivityPlanItem,
  ungroupActivityPlanRepeat,
} from "@repo/core";
import { randomUUID } from "expo-crypto";
import { create } from "zustand";

export type { ActivityPlanDraftStructure } from "@repo/core";
export type ActivityPlanOperationResult = { success: true } | { success: false; error: string };

function result(operation: { ok: boolean; reason?: string }): ActivityPlanOperationResult {
  if (operation.ok) return { success: true };
  const messages = {
    not_found: "That item is no longer available.",
    invalid_destination: "That item cannot be moved to this location.",
    limit_exceeded: "This change exceeds the activity-plan limits.",
    duplicate_id: "This change would create duplicate item IDs.",
  } as const;
  return {
    success: false,
    error: messages[operation.reason as keyof typeof messages] ?? "Structure change failed.",
  };
}

interface ActivityPlanCreationState {
  name: string;
  description: string;
  activityCategory: CanonicalActivityCategory | null;
  structure: ActivityPlanDraftStructure;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setActivityCategory: (activityCategory: CanonicalActivityCategory | null) => void;
  setStructure: (structure: ActivityPlanDraftStructure) => void;
  insertItem: (
    item: ActivityPlanDraftItem,
    location?: { repeatId?: string; index: number },
  ) => ActivityPlanOperationResult;
  removeItem: (id: string) => ActivityPlanOperationResult;
  duplicateItem: (id: string) => ActivityPlanOperationResult;
  moveItem: (id: string, to: { repeatId?: string; index: number }) => ActivityPlanOperationResult;
  ungroupRepeat: (id: string) => ActivityPlanOperationResult;
  updateStep: (step: ActivityPlanDraftStep) => ActivityPlanOperationResult;
  updateRepeatCount: (id: string, count: number) => ActivityPlanOperationResult;
  reset: () => void;
}

export function createBlankActivityPlanDraft(): ActivityPlanDraftStructure {
  return { version: 5, activity_category: null, items: [] };
}

const createInitialState = () => ({
  name: "",
  description: "",
  activityCategory: null,
  structure: createBlankActivityPlanDraft(),
});

export const useActivityPlanCreationStore = create<ActivityPlanCreationState>((set) => ({
  ...createInitialState(),
  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),
  setActivityCategory: (activityCategory) =>
    set((state) => ({
      activityCategory,
      structure: { ...state.structure, activity_category: activityCategory },
    })),
  setStructure: (structure) => set({ structure, activityCategory: structure.activity_category }),
  insertItem: (item, location) => {
    let outcome: ActivityPlanOperationResult = { success: true };
    set((state) => {
      const operation = insertActivityPlanItem(
        state.structure.items,
        location ?? { index: state.structure.items.length },
        item,
      );
      outcome = result(operation);
      return operation.ok ? { structure: { ...state.structure, items: operation.items } } : state;
    });
    return outcome;
  },
  removeItem: (id) => {
    let outcome: ActivityPlanOperationResult = { success: true };
    set((state) => {
      const operation = removeActivityPlanItem(state.structure.items, id);
      outcome = result(operation);
      return operation.ok ? { structure: { ...state.structure, items: operation.items } } : state;
    });
    return outcome;
  },
  duplicateItem: (id) => {
    let outcome: ActivityPlanOperationResult = { success: true };
    set((state) => {
      const operation = duplicateActivityPlanItem(state.structure.items, id, randomUUID);
      outcome = result(operation);
      return operation.ok ? { structure: { ...state.structure, items: operation.items } } : state;
    });
    return outcome;
  },
  moveItem: (id, to) => {
    let outcome: ActivityPlanOperationResult = { success: true };
    set((state) => {
      const operation = moveActivityPlanItem(state.structure.items, id, to);
      outcome = result(operation);
      return operation.ok ? { structure: { ...state.structure, items: operation.items } } : state;
    });
    return outcome;
  },
  ungroupRepeat: (id) => {
    let outcome: ActivityPlanOperationResult = { success: true };
    set((state) => {
      const operation = ungroupActivityPlanRepeat(state.structure.items, id, randomUUID);
      outcome = result(operation);
      return operation.ok ? { structure: { ...state.structure, items: operation.items } } : state;
    });
    return outcome;
  },
  updateStep: (step) => {
    let found = false;
    set((state) => ({
      structure: {
        ...state.structure,
        items: state.structure.items.map((item) => {
          if (item.type === "step") {
            if (item.id !== step.id) return item;
            found = true;
            return step;
          }
          const steps = item.steps.map((child) => {
            if (child.id !== step.id) return child;
            found = true;
            return step;
          });
          return steps === item.steps ? item : { ...item, steps };
        }),
      },
    }));
    return found
      ? { success: true }
      : { success: false, error: "That step is no longer available." };
  },
  updateRepeatCount: (id, count) => {
    if (!Number.isInteger(count) || count < 2 || count > 50)
      return { success: false, error: "Repeat count must be between 2 and 50." };
    let outcome: ActivityPlanOperationResult = {
      success: false,
      error: "That repeat is no longer available.",
    };
    set((state) => {
      const rootIndex = state.structure.items.findIndex(
        (item) => item.type === "repeat" && item.id === id,
      );
      if (rootIndex < 0) return state;
      const candidate = state.structure.items.map((item) =>
        item.type === "repeat" && item.id === id ? { ...item, count } : item,
      );
      // A same-position Core move validates the complete candidate without changing IDs or topology.
      const operation = moveActivityPlanItem(candidate, id, { index: rootIndex });
      outcome = result(operation);
      return operation.ok ? { structure: { ...state.structure, items: operation.items } } : state;
    });
    return outcome;
  },
  reset: () => set(createInitialState()),
}));
