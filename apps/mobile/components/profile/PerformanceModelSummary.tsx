import type { AthletePerformanceOverview } from "@repo/core/performance-model";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { buildPerformanceModelSummary } from "@repo/ui/lib/performance-model-summary";
import { Pressable, View } from "react-native";

type PerformanceModelSummaryProps = {
  error?: string | null;
  isLoading?: boolean;
  onRetry?: () => void;
  overview?: AthletePerformanceOverview;
};

export function PerformanceModelSummary({
  error,
  isLoading,
  onRetry,
  overview,
}: PerformanceModelSummaryProps) {
  return (
    <View className="gap-3" testID="performance-model-summary">
      <View className="gap-1">
        <Text className="text-xl font-semibold text-foreground">Current performance</Text>
        <Text className="text-sm text-muted-foreground">
          Current values personalize training when enough recent activity data is available.
        </Text>
      </View>

      {isLoading ? (
        <Card>
          <CardContent className="p-4">
            <Text className="text-sm text-muted-foreground">Loading current performance…</Text>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="gap-3 p-4">
            <Text className="font-semibold text-foreground">
              Current performance could not be loaded.
            </Text>
            {onRetry ? (
              <Pressable
                accessibilityLabel="Retry"
                accessibilityRole="button"
                className="self-start rounded-xl border border-border px-3 py-2"
                onPress={onRetry}
              >
                <Text className="text-sm font-semibold text-foreground">Retry</Text>
              </Pressable>
            ) : null}
          </CardContent>
        </Card>
      ) : overview ? (
        buildPerformanceModelSummary(overview).map((group) => (
          <Card key={group.activityCategory} testID={`performance-model-${group.activityCategory}`}>
            <CardContent className="gap-4 p-4">
              <Text className="text-lg font-semibold text-foreground">{group.title}</Text>
              {group.items.map((item, index) => (
                <View
                  accessible
                  accessibilityLabel={`${group.title} ${item.label}: ${item.valueLabel}, ${item.statusLabel}.${item.status === "unavailable" ? "" : ` Confidence: ${item.confidenceLabel}. Freshness: ${item.freshnessLabel}.`} Training impact: ${item.trainingImpact}${item.action ? ` ${item.action}` : ""}`}
                  className={`gap-2 ${index === 0 ? "" : "border-t border-border pt-4"}`}
                  key={item.id}
                  testID={`performance-model-item-${item.id}`}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text className="font-medium text-foreground">{item.label}</Text>
                      <Text className="text-lg font-semibold text-foreground">
                        {item.valueLabel}
                      </Text>
                    </View>
                    <View className="rounded-full bg-muted px-2.5 py-1">
                      <Text className="text-xs font-semibold text-foreground">
                        {item.statusLabel}
                      </Text>
                    </View>
                  </View>
                  {item.status === "unavailable" ? null : (
                    <Text className="text-xs text-muted-foreground">
                      Confidence: {item.confidenceLabel} · Freshness: {item.freshnessLabel}
                    </Text>
                  )}
                  <Text className="text-sm text-muted-foreground">
                    <Text className="font-medium text-foreground">Training impact: </Text>
                    {item.trainingImpact}
                  </Text>
                  {item.action ? (
                    <Text className="text-sm font-medium text-foreground">{item.action}</Text>
                  ) : null}
                </View>
              ))}
            </CardContent>
          </Card>
        ))
      ) : null}
    </View>
  );
}
