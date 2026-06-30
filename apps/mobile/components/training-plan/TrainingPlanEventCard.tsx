import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { CalendarDays, Zap } from "lucide-react-native";
import { Pressable, View } from "react-native";
import {
  type ResourceMetric,
  ResourceMetricsRow,
} from "@/components/shared/ResourceCardPrimitives";

export type TrainingPlanEventCardProps = {
  metricParts?: string[];
  metrics?: ResourceMetric[];
  onPress?: () => void;
  scheduleLabel: string;
  statusLabel?: string | null;
  subtitle?: string | null;
  testID?: string;
  title: string;
  variant?: "default" | "compact";
};

export function TrainingPlanEventCard({
  metricParts = [],
  metrics,
  onPress,
  scheduleLabel,
  statusLabel,
  subtitle,
  testID,
  title,
  variant = "default",
}: TrainingPlanEventCardProps) {
  const planned = !statusLabel;
  const compact = variant === "compact";
  const resolvedMetrics = metrics ?? metricParts.map((part) => ({ label: part, value: part }));
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      className={`${compact ? "rounded-xl p-3" : "rounded-2xl p-4"} border bg-card ${planned ? "border-primary/10" : "border-border"}`}
      disabled={!onPress}
      onPress={onPress}
      testID={testID}
    >
      <View className="gap-1.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            numberOfLines={1}
          >
            {scheduleLabel}
          </Text>
          {statusLabel ? (
            <View className="rounded-full bg-primary/10 px-2 py-0.5">
              <Text className="text-[10px] font-medium text-primary">{statusLabel}</Text>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          <Icon
            as={planned ? Zap : CalendarDays}
            size={14}
            className={planned ? "text-primary" : "text-muted-foreground"}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-foreground" numberOfLines={2}>
              {title}
            </Text>
          </View>
        </View>
        {subtitle ? (
          <Text className="pl-6 text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {resolvedMetrics.length > 0 ? (
          <View className="ml-6 mt-1 rounded-2xl bg-muted/30 px-3 py-3">
            <ResourceMetricsRow compact={compact} metrics={resolvedMetrics} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
