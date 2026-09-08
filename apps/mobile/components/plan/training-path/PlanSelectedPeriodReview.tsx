import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { TouchableOpacity, View } from "react-native";
import { parseDateKey } from "@/lib/calendar/dateMath";
import type { DailyTrainingAdjustmentPoint } from "./DailyTrainingAdjustmentChart";
import { TrainingPathSelectedDayPanel } from "./TrainingPathSelectedDayPanel";

type Review = inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanPeriodReview"];

function signed(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function periodTitle(startDate: string) {
  const date = parseDateKey(startDate);
  return `Week of ${format(date, "MMMM d")}`;
}

function periodDates(startDate: string, endDate: string) {
  return `${format(parseDateKey(startDate), "MMM d")}–${format(parseDateKey(endDate), "MMM d")}`;
}

function temporalLabel(state: Review["periodState"] | undefined) {
  if (state === "historical") return "Completed period";
  if (state === "current") return "In progress";
  if (state === "future") return "Scheduled period";
  return "Period review";
}

function workloadFinding(review: Review) {
  const finding = review.findings.find((candidate) => candidate.type !== "coverage_limited");
  if (!finding) return null;
  const difference = Math.abs(finding.workload - finding.targetLoad);
  const direction = finding.type.endsWith("below_target") ? "below" : "above";
  const subject = finding.type.startsWith("historical")
    ? "Completed Load"
    : finding.type.startsWith("future")
      ? "Scheduled Load"
      : "Completed plus remaining Load";
  return `${subject} is ${Math.round(difference)} ${direction} the recommended target.`;
}

function stateFinding(review: Review) {
  const state = review.trainingState.selected;
  if (review.periodState === "future" && state.scheduled.endpoint) {
    return `The schedule projects Fitness ${Math.round(state.scheduled.endpoint.fitness)} and Form ${signed(state.scheduled.endpoint.form)} at week end.`;
  }
  if (state.actual.end && state.actual.delta) {
    const scope = review.periodState === "current" ? "so far this week" : "across the week";
    const projection =
      review.periodState === "current" && state.scheduled.endpoint
        ? ` Scheduled endpoint: Fitness ${Math.round(state.scheduled.endpoint.fitness)}, Form ${signed(state.scheduled.endpoint.form)}.`
        : "";
    return `Calculated Fitness changed ${signed(state.actual.delta.fitness)} ${scope}; Form is ${signed(state.actual.end.form)}.${projection}`;
  }
  return null;
}

export function PlanSelectedPeriodReview({
  fallbackPoint,
  loading,
  onOpenDetails,
  onRetry,
  review,
}: {
  fallbackPoint: DailyTrainingAdjustmentPoint | null;
  loading: boolean;
  onOpenDetails: () => void;
  onRetry: () => void;
  review: Review | null;
}) {
  const startDate =
    review?.selectedPeriod.startDate ?? fallbackPoint?.bucketStartDate ?? fallbackPoint?.date;
  const endDate =
    review?.selectedPeriod.endDate ?? fallbackPoint?.bucketEndDate ?? fallbackPoint?.date;
  if (!startDate || !endDate) return null;

  const reviewLine = review
    ? review.periodState === "future"
      ? (stateFinding(review) ?? workloadFinding(review))
      : (workloadFinding(review) ?? stateFinding(review))
    : null;

  return (
    <TrainingPathSelectedDayPanel
      action={
        <TouchableOpacity
          accessibilityLabel="Open week training breakdown"
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-xl border border-border px-3"
          onPress={onOpenDetails}
          testID="plan-selected-period-training-breakdown"
        >
          <Text className="text-xs font-semibold text-foreground">Training breakdown</Text>
        </TouchableOpacity>
      }
      eventCount={1}
      loading={loading && !review}
      metadata={[periodDates(startDate, endDate), temporalLabel(review?.periodState)]}
      testID="plan-selected-period-review"
      title={periodTitle(startDate)}
    >
      {reviewLine ? (
        <View className="gap-1.5" testID="plan-selected-period-findings">
          <Text className="text-sm leading-5 text-foreground">{reviewLine}</Text>
        </View>
      ) : loading ? null : (
        <View className="gap-2" testID="plan-selected-period-unavailable">
          <Text className="text-sm text-muted-foreground">
            Detailed period findings are unavailable. The chart totals remain visible above.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            className="min-h-11 self-start justify-center rounded-xl border border-border px-3"
            onPress={onRetry}
          >
            <Text className="text-xs font-semibold text-foreground">Try again</Text>
          </TouchableOpacity>
        </View>
      )}
    </TrainingPathSelectedDayPanel>
  );
}
