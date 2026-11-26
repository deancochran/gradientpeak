import { useThresholdHistory } from "@repo/api/threshold-history";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import {
  formatThresholdDate,
  formatThresholdValue,
  groupThresholdHistory,
  ThresholdHistoryChart,
  thresholdMetricLabel,
} from "@repo/ui/components/threshold-history";
import { useRouter } from "expo-router";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { ROUTES } from "@/lib/constants/routes";

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function ThresholdOverviewScreen() {
  const router = useRouter();
  const {
    historyItems,
    loadEarlier,
    nextHistoryCursor,
    olderQuery,
    overview,
    overviewQuery,
    requestedCursor,
  } = useThresholdHistory();

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
      ) : overviewQuery.isError && !overviewQuery.data ? (
        <ErrorState
          description="Try again to load calculated thresholds."
          onAction={() => void overviewQuery.refetch()}
          testID="threshold-overview-error"
          title="Thresholds unavailable"
        />
      ) : overview ? (
        <>
          {overviewQuery.isError ? (
            <ErrorState
              description="Showing cached threshold data. Try again to refresh it."
              onAction={() => void overviewQuery.refetch()}
              testID="threshold-overview-refresh-error"
              title="Latest threshold refresh failed"
            />
          ) : null}
          <Text className="text-xs capitalize text-muted-foreground">
            Publication {overview.publication.status} · revision{" "}
            {overview.publication.publishedRevision ?? "unavailable"}
          </Text>
          <View className="gap-3" testID="threshold-overview-current">
            {(["bike", "run", "swim"] as const).map((activityCategory) => {
              const threshold = overview.current.thresholds[activityCategory];
              return (
                <Card key={activityCategory}>
                  <CardContent className="gap-1 p-4">
                    <Text className="text-sm font-medium capitalize text-muted-foreground">
                      {activityCategory}
                    </Text>
                    <Text className="text-xl font-semibold text-foreground">
                      {threshold.status === "available"
                        ? formatThresholdValue(threshold.value, threshold.unit, activityCategory)
                        : "—"}
                    </Text>
                    <Text className="text-xs capitalize text-muted-foreground">
                      {threshold.status === "available"
                        ? `${threshold.freshness} · ${formatThresholdDate(threshold.effectiveAt)}`
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
          {groupThresholdHistory(historyItems).map((series) => {
            return (
              <View className="gap-3" key={series.id} testID={`threshold-history-${series.id}`}>
                <Text className="text-lg font-semibold text-foreground">
                  {thresholdMetricLabel(series.activityCategory, series.metric)}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Chronological calculated values on one {series.unit} scale.
                </Text>
                <ThresholdHistoryChart
                  emptyMessage="No values available for this threshold."
                  series={series}
                  testId={`threshold-history-chart-${series.id}`}
                />
                {series.points.map((item) => (
                  <View
                    className="gap-2 rounded-xl border border-border p-3"
                    key={item.thresholdId}
                  >
                    <Text className="font-semibold text-foreground">
                      {formatThresholdValue(item.value, item.unit, item.activityCategory)} ·{" "}
                      {formatThresholdDate(item.effectiveAt)}
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
                          {formatThresholdDate(activity.finishedAt)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            );
          })}
          {nextHistoryCursor ? (
            <TouchableOpacity
              accessibilityLabel="Load earlier threshold history"
              accessibilityRole="button"
              className="min-h-11 justify-center rounded-lg bg-muted/30 px-3"
              disabled={requestedCursor !== null}
              onPress={loadEarlier}
              testID="threshold-history-load-earlier"
            >
              <Text className="text-sm font-medium text-foreground">
                {requestedCursor ? "Loading earlier history..." : "Load earlier history"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {olderQuery.isError && requestedCursor ? (
            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">
                Earlier threshold history could not be loaded. Loaded history is unchanged.
              </Text>
              <TouchableOpacity
                accessibilityLabel="Retry earlier threshold history"
                accessibilityRole="button"
                className="min-h-11 justify-center rounded-lg bg-muted/30 px-3"
                onPress={() => void olderQuery.refetch()}
              >
                <Text className="text-sm font-medium text-foreground">Try again</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {historyItems.length === 0 ? (
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
