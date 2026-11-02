import type { ActivityPlanDraftItem } from "./draft";
import type { ActivityPlanItem, ActivityPlanRepeat, ActivityPlanStep } from "./structure-schema";
import { ACTIVITY_PLAN_LIMITS, getEncodedJsonByteLength } from "./structure-validation";

/** Shared authoring topology. Draft children differ only by allowing incomplete step values. */
export type ActivityPlanEditableItem = ActivityPlanItem | ActivityPlanDraftItem;
type EditableStep = ActivityPlanStep | Extract<ActivityPlanDraftItem, { type: "step" }>;
type EditableRepeat = ActivityPlanRepeat | Extract<ActivityPlanDraftItem, { type: "repeat" }>;
export type ActivityPlanItemLocation = { repeatId?: string; index: number };
export type ActivityPlanStructureOperationResult<
  T extends ActivityPlanEditableItem = ActivityPlanEditableItem,
> =
  | { ok: true; items: T[] }
  | { ok: false; reason: "not_found" | "invalid_destination" | "limit_exceeded" | "duplicate_id" };
type Factory = () => string;

function cloneItems<T extends ActivityPlanEditableItem>(items: readonly T[]): T[] {
  return items.map((item) =>
    item.type === "step"
      ? { ...item, targets: [...item.targets] }
      : { ...item, steps: item.steps.map((step) => ({ ...step, targets: [...step.targets] })) },
  ) as T[];
}
function locate<T extends ActivityPlanEditableItem>(
  items: T[],
  id: string,
): { list: T[] | EditableStep[]; index: number; parent?: EditableRepeat } | null {
  const root = items.findIndex((item) => item.id === id);
  if (root >= 0) return { list: items, index: root };
  for (const item of items)
    if (item.type === "repeat") {
      const index = item.steps.findIndex((step) => step.id === id);
      if (index >= 0) return { list: item.steps, index, parent: item };
    }
  return null;
}
function destination<T extends ActivityPlanEditableItem>(
  items: T[],
  location: ActivityPlanItemLocation,
): T[] | EditableStep[] | null {
  if (location.index < 0 || !Number.isInteger(location.index)) return null;
  if (!location.repeatId) return location.index <= items.length ? items : null;
  const repeat = items.find(
    (item): item is T & EditableRepeat => item.type === "repeat" && item.id === location.repeatId,
  );
  return repeat && location.index <= repeat.steps.length ? repeat.steps : null;
}
function allIds(items: readonly ActivityPlanEditableItem[]): string[] {
  return items.flatMap((item) =>
    item.type === "step" ? [item.id] : [item.id, ...item.steps.map((step) => step.id)],
  );
}
function hasUniqueIds(items: readonly ActivityPlanEditableItem[]): boolean {
  const ids = allIds(items);
  return new Set(ids).size === ids.length;
}
function withinLimits(items: readonly ActivityPlanEditableItem[]): boolean {
  if (items.length > ACTIVITY_PLAN_LIMITS.maxItems) return false;
  let expanded = 0;
  let timedSeconds = 0;
  for (const item of items) {
    const repetitions = item.type === "repeat" ? item.count : 1;
    const steps = item.type === "repeat" ? item.steps : [item];
    for (const step of steps) {
      if (step.duration?.type === "time") timedSeconds += step.duration.seconds * repetitions;
    }
    if (item.type === "step") {
      expanded += 1;
      continue;
    }
    if (
      !Number.isSafeInteger(item.count) ||
      item.count < 2 ||
      item.count > ACTIVITY_PLAN_LIMITS.maxRepeatCount ||
      item.steps.length > ACTIVITY_PLAN_LIMITS.maxStepsPerRepeat
    )
      return false;
    expanded += item.count * item.steps.length;
  }
  // Reserve the largest current category envelope because operations intentionally
  // know only the topology, not category-dependent target policy.
  return (
    expanded <= ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences &&
    timedSeconds <= ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds &&
    getEncodedJsonByteLength({ version: 5, activity_category: "strength", items }) <=
      ACTIVITY_PLAN_LIMITS.maxEncodedJsonBytes
  );
}
function validateResult<T extends ActivityPlanEditableItem>(
  items: T[],
): ActivityPlanStructureOperationResult<T> {
  if (!hasUniqueIds(items)) return { ok: false, reason: "duplicate_id" };
  if (!withinLimits(items)) return { ok: false, reason: "limit_exceeded" };
  return { ok: true, items };
}

/** Inserts either a root item or a repeat child without coercing a draft into a saved structure. */
export function insertActivityPlanItem<T extends ActivityPlanEditableItem>(
  items: readonly T[],
  location: ActivityPlanItemLocation,
  item: T,
): ActivityPlanStructureOperationResult<T> {
  const next = cloneItems(items);
  if (
    allIds(next).includes(item.id) ||
    (item.type === "repeat" && item.steps.some((step) => allIds(next).includes(step.id)))
  )
    return { ok: false, reason: "duplicate_id" };
  const list = destination(next, location);
  if (!list || (location.repeatId && item.type === "repeat"))
    return { ok: false, reason: "invalid_destination" };
  (list as T[]).splice(location.index, 0, item);
  return validateResult(next);
}
/** Moves an item atomically. A repeat cannot become a repeat child and empty source repeats are removed. */
export function moveActivityPlanItem<T extends ActivityPlanEditableItem>(
  items: readonly T[],
  id: string,
  to: ActivityPlanItemLocation,
): ActivityPlanStructureOperationResult<T> {
  const next = cloneItems(items);
  const source = locate(next, id);
  if (!source) return { ok: false, reason: "not_found" };
  const moving = source.list[source.index];
  if (!moving) return { ok: false, reason: "not_found" };
  if (moving.type === "repeat" && to.repeatId) return { ok: false, reason: "invalid_destination" };
  source.list.splice(source.index, 1);
  if (source.parent && source.parent.steps.length === 0)
    next.splice(
      next.findIndex((item) => item.id === source.parent?.id),
      1,
    );
  const target = destination(next, to);
  if (!target) return { ok: false, reason: "invalid_destination" };
  (target as T[]).splice(to.index, 0, moving as T);
  return validateResult(next);
}
export function removeActivityPlanItem<T extends ActivityPlanEditableItem>(
  items: readonly T[],
  id: string,
): ActivityPlanStructureOperationResult<T> {
  const next = cloneItems(items);
  const source = locate(next, id);
  if (!source) return { ok: false, reason: "not_found" };
  source.list.splice(source.index, 1);
  if (source.parent && source.parent.steps.length === 0)
    next.splice(
      next.findIndex((item) => item.id === source.parent?.id),
      1,
    );
  return validateResult(next);
}
export function duplicateActivityPlanItem<T extends ActivityPlanEditableItem>(
  items: readonly T[],
  id: string,
  ids: Factory,
): ActivityPlanStructureOperationResult<T> {
  const next = cloneItems(items);
  const source = locate(next, id);
  if (!source) return { ok: false, reason: "not_found" };
  const original = source.list[source.index];
  if (!original) return { ok: false, reason: "not_found" };
  const copy =
    original.type === "step"
      ? { ...original, id: ids(), targets: [...original.targets] }
      : {
          ...original,
          id: ids(),
          steps: original.steps.map((step) => ({ ...step, id: ids(), targets: [...step.targets] })),
        };
  (source.list as T[]).splice(source.index + 1, 0, copy as T);
  return validateResult(next);
}
export function ungroupActivityPlanRepeat<T extends ActivityPlanEditableItem>(
  items: readonly T[],
  repeatId: string,
  ids: Factory,
): ActivityPlanStructureOperationResult<T> {
  if (!withinLimits(items)) return { ok: false, reason: "limit_exceeded" };
  const next = cloneItems(items);
  const index = next.findIndex((item) => item.type === "repeat" && item.id === repeatId);
  const repeat = next[index];
  if (!repeat || repeat.type !== "repeat") return { ok: false, reason: "not_found" };
  // Expand, rather than silently reducing the prescribed dose to a single set.
  const steps = Array.from({ length: repeat.count }, (_, iteration) =>
    repeat.steps.map((step) => ({
      ...step,
      id: iteration === 0 ? step.id : ids(),
      targets: step.targets.map((target) => ({ ...target })),
    })),
  ).flat();
  next.splice(index, 1, ...(steps as T[]));
  return validateResult(next);
}
