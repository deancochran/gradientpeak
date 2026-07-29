type ExistingEventPlanReference = {
  activity_plan?: { id?: unknown } | null;
  activity_plan_id?: unknown;
};

/**
 * Existing events linked to an unavailable plan cannot be
 * edited on mobile. The relation can be omitted by a partial event response,
 * so a top-level plan ID is enough to fail closed.
 */
export function isExistingEventActivityPlanEditable(
  event: ExistingEventPlanReference | null | undefined,
) {
  const hasLinkedPlan = event?.activity_plan_id != null || event?.activity_plan?.id != null;

  return !hasLinkedPlan || event?.activity_plan?.id != null;
}
