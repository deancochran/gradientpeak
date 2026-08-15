import type {
  AthletePerformanceOverview,
  AthletePerformanceOverviewItem,
} from "@repo/core/performance-model";

export type PerformanceModelSummaryItem = AthletePerformanceOverviewItem & {
  confidenceLabel: string;
  freshnessLabel: string;
  id:
    | "bike_threshold_power"
    | "bike_lthr"
    | "bike_max_heart_rate"
    | "run_threshold_pace"
    | "run_lthr"
    | "run_max_heart_rate"
    | "swim_threshold_pace"
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
        summaryItem("bike_threshold_power", "Threshold Power", overview.thresholds.bike),
        summaryItem("bike_lthr", "LTHR", overview.heartRate.bike.lthr),
        summaryItem("bike_max_heart_rate", "Max heart rate", overview.heartRate.bike.maxHeartRate),
      ],
    },
    {
      activityCategory: "run",
      title: "Run",
      items: [
        summaryItem("run_threshold_pace", "Threshold Pace", overview.thresholds.run),
        summaryItem("run_lthr", "LTHR", overview.heartRate.run.lthr),
        summaryItem("run_max_heart_rate", "Max heart rate", overview.heartRate.run.maxHeartRate),
      ],
    },
    {
      activityCategory: "swim",
      title: "Swim",
      items: [
        summaryItem("swim_threshold_pace", "Swim Threshold Pace", overview.thresholds.swim),
        summaryItem("swim_lthr", "LTHR", overview.heartRate.swim.lthr),
        summaryItem("swim_max_heart_rate", "Max heart rate", overview.heartRate.swim.maxHeartRate),
      ],
    },
  ];
}
