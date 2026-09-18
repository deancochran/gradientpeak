import type { ActivityDisplayModel, PlanningLedger, SemanticMetric } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { CalendarDays, Dumbbell, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { PlannedActivityCard } from "@/components/shared/PlannedActivityCard";
import {
  ResourceCardHeader,
  ResourceCardShell,
  ResourceMetricsRow,
} from "@/components/shared/ResourceCardPrimitives";
import {
  formatIntensityMetric,
  formatLedgerDate,
  formatLoadMetric,
  formatMetricDuration,
  metricNumber,
} from "./planningLedgerPresentation";

type LedgerEntry = PlanningLedger["entries"][number];
type NavigationTarget = NonNullable<LedgerEntry["navigation"]>;

function metric(
  value: LedgerEntry["load"],
  key: "common_load" | "elapsed_duration" | "normalized_intensity",
  label: string,
  unit: "load" | "ratio" | "seconds",
): SemanticMetric {
  const numericValue = metricNumber(value);
  return numericValue === null
    ? { key, label, reason: `${label} is unavailable.`, status: "unavailable", unit, value: null }
    : { key, label, reason: null, status: "available", unit, value: numericValue };
}

function displayMetrics(entry: LedgerEntry) {
  return [
    metricNumber(entry.load) === null
      ? null
      : { label: "Load", value: formatLoadMetric(entry.load) },
    metricNumber(entry.intensity) === null
      ? null
      : { label: "Intensity", value: formatIntensityMetric(entry.intensity) },
    metricNumber(entry.contributingDurationSeconds) === null
      ? null
      : { label: "Duration", value: formatMetricDuration(entry.contributingDurationSeconds) },
  ].filter((item): item is { label: string; value: string } => item !== null);
}

export function LedgerEntries({
  completedActivities,
  entries,
  onOpenEntry,
  period,
}: {
  completedActivities: readonly ActivityDisplayModel[];
  entries: readonly LedgerEntry[];
  onOpenEntry: (target: NavigationTarget) => void;
  period: PlanningLedger["period"];
}) {
  const activities = new Map(completedActivities.map((activity) => [activity.id, activity]));
  return (
    <View className="gap-2" testID="planning-ledger-entry-list">
      {entries.length ? (
        entries.map((entry) => {
          const navigation = entry.navigation;
          if (entry.kind === "planned")
            return (
              <PlannedActivityCard
                key={`${entry.kind}-${entry.id}`}
                {...(navigation ? { onPress: () => onOpenEntry(navigation) } : {})}
                plannedActivity={{
                  calendarDate: entry.date,
                  id: entry.id,
                  metrics: [
                    metric(entry.load, "common_load", "Load", "load"),
                    metric(entry.intensity, "normalized_intensity", "Intensity", "ratio"),
                    metric(
                      entry.contributingDurationSeconds,
                      "elapsed_duration",
                      "Duration",
                      "seconds",
                    ),
                  ],
                  plan: null,
                  status: entry.status.toLowerCase().includes("cancel") ? "cancelled" : "scheduled",
                  subtitle: entry.status,
                  title: entry.title,
                }}
                testID={`planning-ledger-entry-${entry.kind}-${entry.id}`}
                variant="compact"
              />
            );
          if (entry.kind === "event" || entry.kind === "group_event") {
            const typeLabel = entry.kind === "group_event" ? "Group event" : "Calendar event";
            return (
              <ResourceCardShell
                {...(navigation
                  ? { accessibilityLabel: `Open ${typeLabel.toLowerCase()} ${entry.title}` }
                  : {})}
                compact
                key={`${entry.kind}-${entry.id}`}
                {...(navigation ? { onPress: () => onOpenEntry(navigation) } : {})}
                testID={`planning-ledger-entry-${entry.kind}-${entry.id}`}
              >
                <ResourceCardHeader
                  compact
                  description={`${formatLedgerDate(entry.date)} · ${entry.status}`}
                  icon={entry.kind === "group_event" ? UsersRound : CalendarDays}
                  title={entry.title}
                />
                <ResourceMetricsRow compact metrics={displayMetrics(entry)} />
              </ResourceCardShell>
            );
          }
          const activity = activities.get(entry.id);
          return activity ? (
            <ActivityCard
              activity={activity}
              dateMode="absolute"
              key={`${entry.kind}-${entry.id}`}
              {...(navigation ? { onPress: () => onOpenEntry(navigation) } : {})}
              showNotes={false}
              testID={`planning-ledger-entry-${entry.kind}-${entry.id}`}
            />
          ) : (
            <ResourceCardShell
              {...(navigation
                ? { accessibilityLabel: `Open completed activity ${entry.title}` }
                : {})}
              compact
              key={`${entry.kind}-${entry.id}`}
              {...(navigation ? { onPress: () => onOpenEntry(navigation) } : {})}
              testID={`planning-ledger-entry-${entry.kind}-${entry.id}`}
            >
              <ResourceCardHeader
                compact
                description={`${formatLedgerDate(entry.date)} · Completed`}
                icon={Dumbbell}
                title={entry.title}
              />
              <ResourceMetricsRow compact metrics={displayMetrics(entry)} />
            </ResourceCardShell>
          );
        })
      ) : (
        <Text className="text-sm text-muted-foreground">
          {period === "day"
            ? "No planned or completed activities are available for this day."
            : "No planned or completed activities are available for the selected day."}
        </Text>
      )}
    </View>
  );
}
