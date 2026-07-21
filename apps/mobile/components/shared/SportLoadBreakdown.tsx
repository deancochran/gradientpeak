import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { getActivityLoadLabels } from "@/lib/activity-load-presentation";
import { formatEstimatedIntensityFactor, formatEstimatedTss } from "@/lib/estimatedMetrics";

export type SportLoadMeasurement = {
  key?: string;
  category: string;
  tss?: number | null;
  intensity_factor?: number | null;
  method?: string | null;
  unavailable_reason?: string | null;
};

function unavailableLabel(reason: SportLoadMeasurement["unavailable_reason"]): string {
  if (reason === "threshold_missing") return "No prior threshold";
  if (reason === "private_data") return "Private";
  if (reason === "invalid_data") return "Invalid data";
  if (reason === "activity_data_missing") return "Missing activity data";
  return "Unavailable";
}

function categoryName(category: string): string {
  return category
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function SportLoadBreakdown({
  loads,
  testID,
}: {
  loads: readonly SportLoadMeasurement[];
  testID?: string;
}) {
  if (loads.length === 0) return null;

  const categoryCounts = new Map<string, number>();

  return (
    <View className="gap-2" testID={testID}>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Sport-specific load
      </Text>
      {loads.map((load, index) => {
        const occurrence = (categoryCounts.get(load.category) ?? 0) + 1;
        categoryCounts.set(load.category, occurrence);
        const totalForCategory = loads.filter((item) => item.category === load.category).length;
        const categoryLabel = `${categoryName(load.category)}${
          totalForCategory > 1 ? ` ${occurrence}` : ""
        }`;
        const labels = getActivityLoadLabels(load.method);
        const tss = formatEstimatedTss(load.tss, { includeUnit: false });
        const intensity = formatEstimatedIntensityFactor(load.intensity_factor);

        return (
          <View
            className="flex-row items-center justify-between gap-3"
            key={load.key ?? `${load.category}-${index}`}
          >
            <Text className="text-xs font-medium text-foreground">{categoryLabel}</Text>
            <Text className="text-xs text-muted-foreground">
              {tss || intensity
                ? `${labels.load} ${tss ?? "--"} · ${labels.intensity} ${intensity ?? "--"}`
                : unavailableLabel(load.unavailable_reason)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
