import type {
  AthletePerformanceOverview,
  AthletePerformanceOverviewItem,
} from "@repo/core/performance-model";

export type PerformanceModelSummaryItem = AthletePerformanceOverviewItem & {
  confidenceLabel: string;
  freshnessLabel: string;
  id:
    | "bike_five_second_power"
    | "bike_planning_threshold_power"
    | "bike_estimated_threshold_duration"
    | "bike_duration_retention"
    | "bike_lthr"
    | "bike_max_heart_rate"
    | "run_planning_threshold_pace"
    | "run_duration_retention"
    | "run_lthr"
    | "run_max_heart_rate"
    | "swim_css_pace"
    | "swim_lthr"
    | "swim_max_heart_rate";
  label: string;
  statusLabel: string;
  valueLabel: string;
};

export type PerformanceModelSummaryGroup = {
  activityCategory: "bike" | "run" | "swim";
  items: PerformanceModelSummaryItem[];
  title: string;
};

function statusLabel(status: AthletePerformanceOverviewItem["status"]): string {
  if (status === "available") return "Available";
  if (status === "partial") return "Limited";
  return "Not available";
}

function confidenceLabel(confidence: AthletePerformanceOverviewItem["confidence"]): string {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  if (confidence === "low") return "Low";
  return "Not available";
}

function freshnessLabel(freshness: AthletePerformanceOverviewItem["freshness"]): string {
  if (freshness === "current") return "Current";
  if (freshness === "stale") return "Out of date";
  return "Not available";
}

function summaryItem(
  id: PerformanceModelSummaryItem["id"],
  label: string,
  item: AthletePerformanceOverviewItem,
): PerformanceModelSummaryItem {
  return {
    ...item,
    id,
    label,
    statusLabel: statusLabel(item.status),
    confidenceLabel: confidenceLabel(item.confidence),
    freshnessLabel: freshnessLabel(item.freshness),
    valueLabel: item.value ?? "Not available",
  };
}

/** Shared semantic presentation of the athlete-safe overview returned by the API. */
export function buildPerformanceModelSummary(
  overview: AthletePerformanceOverview,
): PerformanceModelSummaryGroup[] {
  return [
    {
      activityCategory: "bike",
      title: "Bike",
      items: [
        summaryItem("bike_five_second_power", "Five-second power", overview.bike.fiveSecondPower),
        summaryItem(
          "bike_planning_threshold_power",
          "Planning threshold power",
          overview.bike.planningThresholdPower,
        ),
        summaryItem(
          "bike_estimated_threshold_duration",
          "Estimated threshold duration",
          overview.bike.estimatedThresholdDuration,
        ),
        summaryItem(
          "bike_duration_retention",
          "Duration retention",
          overview.bike.durationRetention,
        ),
        summaryItem("bike_lthr", "LTHR", overview.bike.lthr),
        summaryItem("bike_max_heart_rate", "Max heart rate", overview.bike.maxHeartRate),
      ],
    },
    {
      activityCategory: "run",
      title: "Run",
      items: [
        summaryItem(
          "run_planning_threshold_pace",
          "Planning threshold pace",
          overview.run.planningThresholdPace,
        ),
        summaryItem("run_duration_retention", "Duration retention", overview.run.durationRetention),
        summaryItem("run_lthr", "LTHR", overview.run.lthr),
        summaryItem("run_max_heart_rate", "Max heart rate", overview.run.maxHeartRate),
      ],
    },
    {
      activityCategory: "swim",
      title: "Swim",
      items: [
        summaryItem("swim_css_pace", "CSS pace", overview.swim.cssPace),
        summaryItem("swim_lthr", "LTHR", overview.swim.lthr),
        summaryItem("swim_max_heart_rate", "Max heart rate", overview.swim.maxHeartRate),
      ],
    },
  ];
}
