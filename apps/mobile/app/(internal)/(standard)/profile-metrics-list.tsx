import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { HeartPulse, Scale, TrendingUp } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function getMetricLabel(metricType: string) {
  return metricType
    .replace(/_/g, " ")
    .replace(/kg/g, "kg")
    .replace(/hrv rmssd/i, "HRV RMSSD")
    .replace(/vo2 max/i, "VO2 Max")
    .replace(/lthr/i, "LTHR")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getMetricIcon(metricType: string) {
  if (metricType.includes("weight")) return Scale;
  if (metricType.includes("hr") || metricType.includes("hrv") || metricType.includes("lthr")) {
    return HeartPulse;
  }
  return TrendingUp;
}

export default function ProfileMetricsListScreen() {
  const navigateTo = useAppNavigate();
  const { data, isLoading, error } = api.profileMetrics.list.useQuery({ limit: 100, offset: 0 });
  const metrics = data?.items ?? [];

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-base font-semibold text-foreground">
          Unable to load profile metrics
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">{error.message}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={metrics}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-4 p-4 pb-6"
        ListHeaderComponent={
          metrics.length > 0 ? (
            <View className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
              <Text className="text-sm text-muted-foreground">
                {metrics.length} {metrics.length === 1 ? "metric" : "metrics"}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-12">
            <Text className="text-lg font-medium text-foreground">No profile metrics yet</Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground">
              Your profile metrics will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const MetricIcon = getMetricIcon(item.metric_type);
          return (
            <Pressable
              onPress={() => navigateTo(ROUTES.PROFILE_METRICS.DETAIL(item.id) as any)}
              testID={`profile-metric-list-item-${item.id}`}
            >
              <Card className="rounded-3xl border border-border bg-card">
                <CardContent className="flex-row items-start gap-3 p-4">
                  <View className="rounded-full bg-muted/30 p-2.5">
                    <Icon as={MetricIcon} size={18} className="text-foreground" />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text className="text-base font-semibold text-foreground">
                      {getMetricLabel(item.metric_type)}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {item.value} {item.unit}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {new Date(item.recorded_at).toLocaleDateString()}
                    </Text>
                  </View>
                </CardContent>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
