import type { CalendarProjectionItem, PlanningLedger } from "@repo/core";
import type { PlannedActivityCardData } from "@/components/shared/PlannedActivityCard";

/**
 * Completed planned sessions retain management identity in the calendar
 * projection even when the ledger separately renders their linked activity.
 */
export function completedPlannedSessionsForLedger(
  items: readonly CalendarProjectionItem[],
  ledger: Pick<PlanningLedger, "periodEnd" | "periodStart">,
): PlannedActivityCardData[] {
  return items.flatMap((item) => {
    if (
      item.kind !== "planned_activity" ||
      item.status !== "completed" ||
      !item.plannedSession ||
      item.calendarDate < ledger.periodStart ||
      item.calendarDate > ledger.periodEnd
    ) {
      return [];
    }
    return [
      {
        calendarDate: item.calendarDate,
        id: item.plannedSession.id,
        metrics: item.metrics,
        plan: null,
        status: item.status,
        subtitle: item.subtitle,
        title: item.title,
      },
    ];
  });
}
