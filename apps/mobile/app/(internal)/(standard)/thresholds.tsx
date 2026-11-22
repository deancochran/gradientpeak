import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";

type ThresholdOverview =
  inferRouterOutputs<AppRouter>["athleteIntelligence"]["getThresholdOverview"];
type HistoryItem = ThresholdOverview["history"]["items"][number];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatPace(seconds: number) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatThreshold(category: "bike" | "run" | "swim", value: number) {
  if (category === "bike") return `${Math.round(value)} W`;
  return category === "run"
    ? `${formatPace(1000 / value)} /km`
    : `${formatPace(100 / value)} /100m`;
}

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function ThresholdHistoryChart({ items }: { items: readonly HistoryItem[] }) {
  const ordered = [...items].sort((left, right) =>
    left.effectiveAt.localeCompare(right.effectiveAt),
  );
  const values = ordered.map((item) => item.value);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const span = Math.max(maximum - minimum, maximum * 0.05, 1);
  return (
    <View
      accessibilityLabel={`Threshold progression with ${ordered.length} calculated values`}
      className="h-24 flex-row items-end gap-1 rounded-xl bg-muted/20 px-2 py-2"
      importantForAccessibility="no-hide-descendants"
      testID="threshold-history-chart"
    >
      {ordered.map((item) => (
        <View
          className="min-w-2 flex-1 rounded-t-sm bg-primary/70"
          key={item.thresholdId}
          style={{ height: 12 + ((item.value - minimum) / span) * 68 }}
          testID={`threshold-history-point-${item.thresholdId}`}
        />
      ))}
    </View>
  );
}

function ThresholdOverviewScreen() {
  const router = useRouter();
  const overviewQuery = api.athleteIntelligence.getThresholdOverview.useQuery({
    historyLimit: 100,
  });

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 py-5"
      testID="threshold-overview-screen"
    >
      <View className="gap-1">
        <Text className="text-2xl font-semibold text-foreground">Thresholds</Text>
        <Text className="text-sm text-muted-foreground">
          Calculated from eligible completed activities. Removing source activity data triggers
          recalculation.
        </Text>
      </View>
      {overviewQuery.isLoading ? (
        <LoadingState message="Loading thresholds..." testID="threshold-overview-loading" />
      ) : overviewQuery.isError ? (
        <ErrorState
          description="Try again to load calculated thresholds."
          onAction={() => void overviewQuery.refetch()}
          testID="threshold-overview-error"
          title="Thresholds unavailable"
        />
      ) : overviewQuery.data ? (
        <>
          <Text className="text-xs capitalize text-muted-foreground">
            Publication {overviewQuery.data.publication.status} · revision{" "}
            {overviewQuery.data.publication.publishedRevision ?? "unavailable"}
          </Text>
          <View className="gap-3" testID="threshold-overview-current">
            {(["bike", "run", "swim"] as const).map((activityCategory) => {
              const threshold = overviewQuery.data.current.thresholds[activityCategory];
              return (
                <Card key={activityCategory}>
                  <CardContent className="gap-1 p-4">
                    <Text className="text-sm font-medium capitalize text-muted-foreground">
                      {activityCategory}
                    </Text>
                    <Text className="text-xl font-semibold text-foreground">
                      {threshold.status === "available"
                        ? formatThreshold(activityCategory, threshold.value)
                        : "—"}
                    </Text>
                    <Text className="text-xs capitalize text-muted-foreground">
                      {threshold.status === "available"
                        ? `${threshold.freshness} · ${dateFormatter.format(new Date(threshold.effectiveAt))}`
                        : "No eligible calculated value"}
                    </Text>
                    {threshold.status === "available" ? (
                      <Text className="text-xs capitalize text-muted-foreground">
                        {readable(threshold.method)} · {Math.round(threshold.confidence * 100)}%
                        confidence
                      </Text>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </View>
          {(["bike", "run", "swim"] as const).map((activityCategory) => {
            const history = overviewQuery.data.history.items.filter(
              (item) => item.activityCategory === activityCategory,
            );
            if (!history.length) return null;
            return (
              <View
                className="gap-3"
                key={activityCategory}
                testID={`threshold-history-${activityCategory}`}
              >
                <Text className="text-lg font-semibold capitalize text-foreground">
                  {activityCategory} progression
                </Text>
                <ThresholdHistoryChart items={history} />
                {history.map((item) => (
                  <View
                    className="gap-2 rounded-xl border border-border p-3"
                    key={item.thresholdId}
                  >
                    <Text className="font-semibold text-foreground">
                      {formatThreshold(activityCategory, item.value)} ·{" "}
                      {dateFormatter.format(new Date(item.effectiveAt))}
                    </Text>
                    <Text className="text-xs capitalize text-muted-foreground">
                      {readable(item.method)} · {Math.round(item.confidence * 100)}% confidence ·
                      policy {item.policyVersion}
                    </Text>
                    {item.sourceActivities.map((activity) => (
                      <TouchableOpacity
                        accessibilityLabel={`Open source activity ${activity.name}`}
                        accessibilityRole="button"
                        className="min-h-11 justify-center rounded-lg bg-muted/30 px-3"
                        key={activity.id}
                        onPress={() =>
                          router.navigate(ROUTES.ACTIVITIES.DETAIL(activity.id) as never)
                        }
                        testID={`threshold-source-activity-${activity.id}`}
                      >
                        <Text className="text-sm font-medium text-foreground">{activity.name}</Text>
                        <Text className="text-xs text-muted-foreground">
                          {dateFormatter.format(new Date(activity.finishedAt))}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            );
          })}
          {overviewQuery.data.history.items.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              No calculated threshold changes yet.
            </Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

export default function ThresholdOverviewScreenWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ThresholdOverviewScreen />
    </ErrorBoundary>
  );
}
