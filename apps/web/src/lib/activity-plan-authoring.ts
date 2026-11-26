import type {
  ActivityPlanDraftItem,
  ActivityPlanDraftRepeat,
  ActivityPlanDraftStep,
  ActivityPlanDraftStructure,
  CanonicalActivityCategory,
} from "@repo/core";
import {
  activityPlanStructureSchema,
  duplicateActivityPlanItem,
  insertActivityPlanItem,
  moveActivityPlanItem,
  removeActivityPlanItem,
  ungroupActivityPlanRepeat,
} from "@repo/core/activity-plan";

function id() {
  return crypto.randomUUID();
}

/** New authoring starts deliberately incomplete; Core resolves it before persistence. */
export function createActivityPlanStep(): ActivityPlanDraftStep {
  return { type: "step", id: id(), duration: null, targets: [] };
}

export function createActivityPlanRepeat(): ActivityPlanDraftRepeat {
  return { type: "repeat", id: id(), count: 2, steps: [] };
}

export function createActivityPlanStructure(
  _launchCategory?: CanonicalActivityCategory,
): ActivityPlanDraftStructure {
  return { version: 5, activity_category: null, items: [] };
}

export function parseActivityPlanStructure(value: unknown) {
  return activityPlanStructureSchema.parse(value);
}

function resultItems(result: ReturnType<typeof insertActivityPlanItem<ActivityPlanDraftItem>>) {
  if (!result.ok) {
    const messages = {
      not_found: "This step or repeat is no longer available.",
      invalid_destination: "That move is not allowed. Repeats cannot contain other repeats.",
      limit_exceeded:
        "This change exceeds the activity plan's step, repeat, duration, or size limits.",
      duplicate_id: "This change would create duplicate step identities.",
    };
    throw new Error(messages[result.reason]);
  }
  return result.items;
}

export function insertDraftItem(
  structure: ActivityPlanDraftStructure,
  item: ActivityPlanDraftItem,
  location: { repeatId?: string; index: number },
): ActivityPlanDraftStructure {
  return {
    ...structure,
    items: resultItems(insertActivityPlanItem(structure.items, location, item)),
  };
}

export function moveDraftItem(
  structure: ActivityPlanDraftStructure,
  itemId: string,
  location: { repeatId?: string; index: number },
): ActivityPlanDraftStructure {
  return {
    ...structure,
    items: resultItems(moveActivityPlanItem(structure.items, itemId, location)),
  };
}

export function removeDraftItem(
  structure: ActivityPlanDraftStructure,
  itemId: string,
): ActivityPlanDraftStructure {
  return {
    ...structure,
    items: resultItems(removeActivityPlanItem(structure.items, itemId)),
  };
}

export function duplicateDraftItem(
  structure: ActivityPlanDraftStructure,
  itemId: string,
): ActivityPlanDraftStructure {
  return {
    ...structure,
    items: resultItems(duplicateActivityPlanItem(structure.items, itemId, id)),
  };
}

export function ungroupDraftRepeat(
  structure: ActivityPlanDraftStructure,
  repeatId: string,
): ActivityPlanDraftStructure {
  return {
    ...structure,
    items: resultItems(ungroupActivityPlanRepeat(structure.items, repeatId, id)),
  };
}

/** Step updates preserve its location and draft values, whether root or repeat child. */
export function updateActivityPlanStep(
  structure: ActivityPlanDraftStructure,
  stepId: string,
  update: (step: ActivityPlanDraftStep) => ActivityPlanDraftStep,
): ActivityPlanDraftStructure {
  return {
    ...structure,
    items: structure.items.map((item) => {
      if (item.type === "step") return item.id === stepId ? update(item) : item;
      return {
        ...item,
        steps: item.steps.map((step) => (step.id === stepId ? update(step) : step)),
      };
    }),
  };
}

export function updateActivityPlanRepeat(
  structure: ActivityPlanDraftStructure,
  repeatId: string,
  update: (repeat: ActivityPlanDraftRepeat) => ActivityPlanDraftRepeat,
): ActivityPlanDraftStructure {
  const next = {
    ...structure,
    items: structure.items.map((item) =>
      item.type === "repeat" && item.id === repeatId ? update(item) : item,
    ),
  };
  const index = next.items.findIndex((item) => item.id === repeatId);
  return { ...next, items: resultItems(moveActivityPlanItem(next.items, repeatId, { index })) };
}
