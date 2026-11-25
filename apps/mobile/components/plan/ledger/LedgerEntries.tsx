import type { ActivityDisplayModel, PlanningLedger, SemanticMetric } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { CalendarDays, Dumbbell, UsersRound } from "lucide-react-native";
import { Fragment } from "react";
import { View } from "react-native";
import { ActivityCard } from "@/components/shared/ActivityCard";
import {
  PlannedActivityCard,
  type PlannedActivityCardData,
} from "@/components/shared/PlannedActivityCard";
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
export type LedgerNavigationTarget =
  | NonNullable<LedgerEntry["navigation"]>
  | { id: string; target: "planned_session" };

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

function plannedActivity(
  entry: LedgerEntry,
  completedSession?: PlannedActivityCardData,
): PlannedActivityCardData {
  const metrics = [
    metric(entry.load, "common_load", "Load", "load"),
    metric(entry.intensity, "normalized_intensity", "Intensity", "ratio"),
    metric(entry.contributingDurationSeconds, "elapsed_duration", "Duration", "seconds"),
  ];
  if (completedSession) {
    return {
      ...completedSession,
      metrics,
    };
  }
  return {
    calendarDate: entry.date,
    id: entry.id,
    metrics,
    plan: null,
    status: entry.status.toLowerCase().includes("cancel") ? "cancelled" : "scheduled",
    subtitle: entry.status,
    title: entry.title,
  };
}

export function LedgerEntries({
  completedActivities,
  completedPlannedSessions = [],
  entries,
  onOpenEntry,
  period,
}: {
  completedActivities: readonly ActivityDisplayModel[];
  completedPlannedSessions?: readonly PlannedActivityCardData[];
  entries: readonly LedgerEntry[];
  onOpenEntry: (target: LedgerNavigationTarget) => void;
  period: PlanningLedger["period"];
}) {
  const activities = new Map(completedActivities.map((activity) => [activity.id, activity]));
  const completedSessions = new Map(
    completedPlannedSessions.map((session) => [session.id, session]),
  );
  const renderedEntries = entries.map((entry) => {
    const navigation = entry.navigation;
    if (entry.kind === "planned") {
      const completedSession = completedSessions.get(entry.id);
      return {
        id: `${entry.kind}-${entry.id}`,
        node: (
          <PlannedActivityCard
            {...(navigation
              ? {
                  onPress: () => onOpenEntry({ id: navigation.id, target: "planned_session" }),
                }
              : {})}
            plannedActivity={plannedActivity(entry, completedSession)}
            testID={
              completedSession
                ? `planning-ledger-completed-session-${completedSession.id}`
                : `planning-ledger-entry-${entry.kind}-${entry.id}`
            }
            variant="compact"
          />
        ),
      };
    }
    if (entry.kind === "event" || entry.kind === "group_event") {
      const typeLabel = entry.kind === "group_event" ? "Group event" : "Calendar event";
      return {
        id: `${entry.kind}-${entry.id}`,
        node: (
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
        ),
      };
    }
    const activity = activities.get(entry.id);
    return {
      id: `${entry.kind}-${entry.id}`,
      node: activity ? (
        <ActivityCard
          activity={activity}
          dateMode="absolute"
          {...(navigation ? { onPress: () => onOpenEntry(navigation) } : {})}
          showNotes={false}
          testID={`planning-ledger-entry-${entry.kind}-${entry.id}`}
        />
      ) : (
        <ResourceCardShell
          {...(navigation ? { accessibilityLabel: `Open completed activity ${entry.title}` } : {})}
          compact
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
      ),
    };
  });
  const supplementalCompletedSessions = completedPlannedSessions.filter(
    (session) => !entries.some((entry) => entry.kind === "planned" && entry.id === session.id),
  );
  renderedEntries.push(
    ...supplementalCompletedSessions.map((session) => ({
      id: `completed-session-${session.id}`,
      node: (
        <PlannedActivityCard
          onPress={() => onOpenEntry({ id: session.id, target: "planned_session" })}
          plannedActivity={session}
          testID={`planning-ledger-completed-session-${session.id}`}
          variant="compact"
        />
      ),
    })),
  );
  return (
    <View className="gap-2" testID="planning-ledger-entry-list">
      {renderedEntries.length ? (
        renderedEntries.map((entry) => <Fragment key={entry.id}>{entry.node}</Fragment>)
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
