import type { CalendarProjectionItem } from "@repo/core";
import { Card, CardContent } from "@repo/ui/components/card";
import { CalendarDays } from "lucide-react";
import { formatDayLabel } from "../../lib/planning";
import { ActivityPlanCard } from "./activity-plan-card";
import { ActivityPlanEstimateRow } from "./activity-plan-estimates";

type PlannedActivityCardData = Pick<
  CalendarProjectionItem,
  "calendarDate" | "id" | "metrics" | "navigation" | "plan" | "status" | "subtitle" | "title"
>;

function statusLabel(status: PlannedActivityCardData["status"]) {
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "expired") return "Unverified";
  return "Planned";
}

export function PlannedActivityCard({ item }: { item: PlannedActivityCardData }) {
  if (item.plan) {
    return (
      <ActivityPlanCard
        href={item.navigation.href}
        openLabel={`Open planned activity ${item.title}`}
        plan={item.plan}
      />
    );
  }

  return (
    <Card
      className="transition-colors hover:border-blue-500/40"
      data-testid={`planned-activity-card-${item.id}`}
    >
      <CardContent className="p-0">
        <a
          aria-label={`Open planned activity ${item.title}`}
          className="flex items-start gap-3 rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={item.navigation.href}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-600">
            <CalendarDays aria-hidden="true" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">{item.title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {item.subtitle || "Activity details are not available yet."}
            </span>
            <ActivityPlanEstimateRow compact metrics={item.metrics} />
            <span className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span>{formatDayLabel(item.calendarDate)}</span>
              <span>{statusLabel(item.status)}</span>
            </span>
          </span>
        </a>
      </CardContent>
    </Card>
  );
}
