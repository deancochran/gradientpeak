import type { CalendarProjectionItem } from "@repo/core";
import { CalendarDays } from "lucide-react-native";
import { ActivityPlanCard } from "./ActivityPlanCard";
import { ActivityPlanMetricsRow } from "./ActivityPlanSummary";
import {
  ResourceCardHeader,
  ResourceCardShell,
  ResourceMetricsRow,
} from "./ResourceCardPrimitives";

export type PlannedActivityCardData = Pick<
  CalendarProjectionItem,
  "calendarDate" | "id" | "metrics" | "plan" | "status" | "subtitle" | "title"
>;

type PlannedActivityCardProps = {
  onPress?: () => void;
  plannedActivity: PlannedActivityCardData;
  testID?: string;
  variant?: "default" | "compact";
};

function statusLabel(status: PlannedActivityCardData["status"]) {
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "expired") return "Unverified";
  return "Planned";
}

export function PlannedActivityCard({
  onPress,
  plannedActivity,
  testID,
  variant = "default",
}: PlannedActivityCardProps) {
  if (plannedActivity.plan) {
    return (
      <ActivityPlanCard
        {...(onPress !== undefined ? { onPress } : {})}
        plan={{ ...plannedActivity.plan, metrics: plannedActivity.metrics }}
        showScheduleInfo
        testID={testID ?? `planned-activity-card-${plannedActivity.id}`}
        variant={variant}
      />
    );
  }

  const compact = variant === "compact";
  return (
    <ResourceCardShell
      {...(onPress
        ? { accessibilityLabel: `Open planned activity ${plannedActivity.title}`, onPress }
        : {})}
      compact={compact}
      contentClassName={compact ? "gap-3 px-2" : "gap-3 px-3"}
      testID={testID ?? `planned-activity-card-${plannedActivity.id}`}
    >
      <ResourceCardHeader
        compact={compact}
        description={plannedActivity.subtitle}
        descriptionFallback="Activity details are not available yet."
        {...(compact ? { descriptionNumberOfLines: 2 } : {})}
        icon={CalendarDays}
        iconClassName="text-blue-600"
        iconContainerClassName="bg-blue-500/15"
        title={plannedActivity.title}
        titleFallback="Planned activity"
      />
      <ActivityPlanMetricsRow projectionMetrics={plannedActivity.metrics} />
      <ResourceMetricsRow
        compact={compact}
        maxItems={2}
        metrics={[
          { label: "Date", value: plannedActivity.calendarDate },
          { label: "Status", value: statusLabel(plannedActivity.status) },
        ]}
        testID="planned-activity-card-metrics"
      />
    </ResourceCardShell>
  );
}
