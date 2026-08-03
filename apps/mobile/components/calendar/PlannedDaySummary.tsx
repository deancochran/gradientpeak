import type { ActivityPrescriptionQuantificationBundle } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { getActivityQuantificationPresentation } from "@repo/ui/lib/activity-quantification-presentation";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { announcePlannedDaySummaryRetryStatus } from "./plannedDaySummaryAccessibility";

export type MobilePlannedDaySummaryData = {
  summary: {
    eventCount: number;
    activity_categories: string[];
    totalDurationSeconds: number | null;
    prescriptionQuantification: ActivityPrescriptionQuantificationBundle;
  };
  source: {
    complete: true;
    eventCount: number;
    unavailableEstimateCount: number;
    unavailablePlanCount: number;
    unlinkedPlanCount: number;
  };
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatActivityCategory(activity_category: string) {
  return activity_category.charAt(0).toUpperCase() + activity_category.slice(1);
}

/** Formats the API's stable activity_category composition without implying an activity order. */
export function formatPlannedDayActivityCategories(activity_categories: readonly string[]) {
  return [...new Set(activity_categories)].map(formatActivityCategory).join(" + ");
}

/** Uses the same compact duration units as the web planned-workload summary. */
export function formatPlannedDayDuration(totalDurationSeconds: number | null) {
  if (typeof totalDurationSeconds !== "number" || !Number.isFinite(totalDurationSeconds)) {
    return "Unavailable";
  }
  if (totalDurationSeconds <= 0) return "0m";

  const totalSeconds = Math.floor(totalDurationSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function PlannedDaySummaryDetails({ data }: { data: MobilePlannedDaySummaryData }) {
  const { source, summary } = data;
  const hasPartialInformation =
    source.unavailableEstimateCount > 0 ||
    source.unavailablePlanCount > 0 ||
    source.unlinkedPlanCount > 0;

  if (summary.eventCount === 0) {
    return <Text className="text-sm text-muted-foreground">No planned Events for this day.</Text>;
  }

  const activity_categories = formatPlannedDayActivityCategories(summary.activity_categories);
  const quantification = getActivityQuantificationPresentation(summary.prescriptionQuantification);
  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text className="text-sm text-muted-foreground">Planned Events</Text>
        <Text className="text-base font-semibold text-foreground">
          {pluralize(summary.eventCount, "Event")}
        </Text>
      </View>
      <View className="gap-2">
        <Text className="text-sm text-muted-foreground">ActivityCategory mix</Text>
        <Text
          accessibilityLabel={
            activity_categories ? activity_categories.replaceAll(" + ", " plus ") : "Unavailable"
          }
          className="text-base font-semibold text-foreground"
        >
          {activity_categories || "Unavailable"}
        </Text>
      </View>
      <View className="gap-2">
        <Text className="text-sm text-muted-foreground">Planned duration</Text>
        <Text className="text-base font-semibold text-foreground">
          {summary.totalDurationSeconds === null
            ? "Unavailable"
            : formatPlannedDayDuration(summary.totalDurationSeconds)}
        </Text>
      </View>
      <View className="gap-2">
        <Text className="text-sm text-muted-foreground">{quantification.commonLoad.label}</Text>
        <Text className="text-base font-semibold text-foreground">
          {quantification.commonLoad.value}
        </Text>
      </View>
      <View className="gap-2">
        <Text className="text-sm text-muted-foreground">
          {quantification.normalizedIntensity.label}
        </Text>
        <Text className="text-base font-semibold text-foreground">
          {quantification.normalizedIntensity.value}
        </Text>
      </View>
      <Text className="text-xs text-muted-foreground">
        {quantification.commonLoad.evidence}. {quantification.commonLoad.explanation}
      </Text>

      {hasPartialInformation ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
          Partial information:{" "}
          {source.unavailableEstimateCount > 0
            ? `${pluralize(source.unavailableEstimateCount, "Event")} has unavailable planned estimates. `
            : ""}
          {source.unavailablePlanCount > 0
            ? `${pluralize(source.unavailablePlanCount, "linked plan")} is unavailable. `
            : ""}
          {source.unlinkedPlanCount > 0
            ? `${pluralize(source.unlinkedPlanCount, "Event")} has no linked plan.`
            : ""}
        </Text>
      ) : null}
    </View>
  );
}

export function PlannedDaySummary({
  data,
  error,
  isLoading,
  onRetry,
}: {
  data?: MobilePlannedDaySummaryData;
  error: boolean;
  isLoading: boolean;
  onRetry: () => Promise<unknown> | undefined;
}) {
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const announceRetryStatus = (message: string) => {
    setRetryStatus(message);
    announcePlannedDaySummaryRetryStatus(message);
  };

  const handleRetry = async () => {
    if (isRetrying) return;

    setIsRetrying(true);
    announceRetryStatus("Retrying planned workload.");
    try {
      await onRetry();
      announceRetryStatus("Planned workload retry finished.");
    } catch {
      announceRetryStatus("Planned workload retry failed. The error remains available.");
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <View
      accessibilityLabel="Planned workload summary"
      accessibilityRole="summary"
      className="rounded-3xl border border-border bg-card px-4 py-4"
      testID="calendar-day-planned-summary"
    >
      <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
        Planned workload
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">
        Scheduled/completed planned workload; cancelled excluded. Totals are planned estimates, not
        actual or remaining load.
      </Text>

      <View className="mt-4 gap-3">
        {isLoading && !data && !isRetrying ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
            Loading planned workload...
          </Text>
        ) : null}

        {retryStatus ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
            {retryStatus}
          </Text>
        ) : null}

        {error ? (
          <View accessibilityRole="alert" className="gap-3">
            <Text className="text-sm text-foreground">Planned workload could not be loaded.</Text>
            <TouchableOpacity
              accessibilityHint="Attempts to load the planned workload again."
              accessibilityLabel="Retry planned workload"
              accessibilityRole="button"
              accessibilityState={{ busy: isRetrying, disabled: isRetrying }}
              className="self-start rounded-full border border-border px-4 py-3"
              disabled={isRetrying}
              onPress={() => void handleRetry()}
              testID="calendar-day-planned-summary-retry"
            >
              <Text className="text-sm font-semibold text-foreground">
                {isRetrying ? "Retrying planned workload..." : "Retry planned workload"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {data ? <PlannedDaySummaryDetails data={data} /> : null}
      </View>
    </View>
  );
}
