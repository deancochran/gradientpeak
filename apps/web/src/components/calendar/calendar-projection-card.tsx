import type { CalendarProjectionItem } from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import { PlannedActivityCard } from "../activity-plan/planned-activity-card";
import { GoalCard } from "../planning/goal-card";
import { ActivityListCard } from "../protected/activity-route-primitives";

function formatItemTime(item: CalendarProjectionItem) {
  if (item.timing.allDay) return "All day";
  if (!item.timing.startsAt) return "Scheduled";
  return new Date(item.timing.startsAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: item.timing.timezone,
  });
}

export function CalendarProjectionCard({ item }: { item: CalendarProjectionItem }) {
  if (item.activity) {
    return <ActivityListCard activity={item.activity} href={item.navigation.href} />;
  }
  if (item.kind === "planned_activity") return <PlannedActivityCard item={item} />;
  if (item.kind === "goal") {
    return (
      <GoalCard
        goal={{
          id: item.id,
          objectiveSummary: item.goal?.objectiveSummary,
          targetDate: item.calendarDate,
          title: item.title,
          typeLabel: item.goal?.typeLabel,
        }}
        href={item.navigation.href}
      />
    );
  }
  return (
    <a
      className="block rounded-xl border p-4 transition-colors hover:border-primary hover:bg-accent/40"
      href={item.navigation.href}
    >
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block font-medium">{item.title}</span>
          <span className="block text-sm text-muted-foreground">{formatItemTime(item)}</span>
        </span>
        <Badge variant="outline">{item.status}</Badge>
      </span>
    </a>
  );
}
