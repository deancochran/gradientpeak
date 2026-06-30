import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import type { DailyTrainingAdjustmentPoint } from "./DailyTrainingAdjustmentChart";

export type DailyTrainingAdjustmentTrayProps = {
  point: DailyTrainingAdjustmentPoint;
  testID?: string;
};

function valueOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatTss(value: number) {
  return `${Math.round(value)} TSS`;
}

function formatSignedTss(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "On target";
  return `${rounded > 0 ? "+" : ""}${rounded} TSS`;
}

export function DailyTrainingAdjustmentTray({
  point,
  testID = "daily-training-adjustment-tray",
}: DailyTrainingAdjustmentTrayProps) {
  const target = valueOrZero(point.targetLoadTss);
  const actual = valueOrZero(point.actualOrScheduledLoadTss);
  const planned = valueOrZero(point.plannedLoadTss) + valueOrZero(point.tentativePlannedLoadTss);
  const displayedPlanned = actual > 0 ? actual : planned;
  const delta = valueOrZero(point.loadDeltaTss ?? actual - target);

  return (
    <View className="gap-2 rounded-2xl bg-card px-3 py-3" testID={testID}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground">{point.date}</Text>
          <Text className="text-xs text-muted-foreground">Daily adjustment</Text>
        </View>
        <Text className="text-sm font-semibold text-foreground">{formatSignedTss(delta)}</Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <InlineMetric label="Recommended" value={formatTss(target)} />
        <InlineMetric label="Planned" value={formatTss(displayedPlanned)} />
        {point.formTsb != null ? (
          <InlineMetric label="Form" value={point.formTsb.toFixed(1)} />
        ) : null}
        {point.readinessScore != null ? (
          <InlineMetric label="Readiness" value={`${Math.round(point.readinessScore * 100)}%`} />
        ) : null}
      </View>
      {point.annotations?.length ? (
        <View className="gap-1">
          {point.annotations.map((annotation) => (
            <Text
              className="text-xs text-muted-foreground"
              key={`${annotation.code}-${annotation.message ?? ""}`}
            >
              {annotation.message ?? annotation.code}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline gap-1.5">
      <Text className="text-[10px] font-medium text-muted-foreground">{label}</Text>
      <Text className="text-xs font-semibold text-foreground">{value}</Text>
    </View>
  );
}
