import { decodePolyline } from "@repo/core";
import { formatEffortDuration } from "@repo/core/athlete-inputs";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { skipToken } from "@tanstack/react-query";
import { type Href, useLocalSearchParams } from "expo-router";
import { Zap } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { ActivityRouteMap } from "@/components/activity/maps/ActivityRouteMap";
import { ActivityCard, type ActivityCardActivity } from "@/components/shared/ActivityCard";
import { EmptyState, LoadingState } from "@/components/shared/ScreenState";
import { formatActivityEffortPresentationValue } from "@/lib/activity-efforts/curves";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { formatDateStamp } from "@/lib/display/formatters";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function formatEffortTitle(category: string, type: string) {
  return `${category.replace(/_/g, " ")} ${type}`;
}

export default function ActivityEffortDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const effortId = typeof id === "string" ? id : "";
  const navigateTo = useAppNavigate();
  const { profile, user } = useAuth();

  const { data: effort, isLoading } = api.activityEfforts.getById.useQuery(
    { id: effortId },
    { enabled: !!effortId },
  );
  const { data: activityData } = api.activities.getById.useQuery(
    effort?.activity_id ? { id: effort.activity_id } : skipToken,
  );

  const routeCoordinates = useMemo(() => {
    const polyline = activityData?.activity?.polyline;
    return polyline ? decodePolyline(polyline) : [];
  }, [activityData?.activity?.polyline]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState message="Loading effort..." />
      </View>
    );
  }

  if (!effort) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <EmptyState title="Effort not found" />
      </View>
    );
  }

  const linkedActivity = activityData?.activity;
  const derived = activityData?.derived;
  const linkedActivityCard: ActivityCardActivity | null = linkedActivity
    ? {
        ...linkedActivity,
        derived: { stress: derived?.stress ?? null },
      }
    : null;
  const activityOwner = user?.id
    ? {
        avatar_url: profile?.avatar_url ?? null,
        id: user.id,
        username: profile?.username ?? user.email?.split("@")[0] ?? "You",
      }
    : null;
  return (
    <View className="flex-1 bg-background" testID="activity-effort-detail-screen">
      <ScrollView className="flex-1">
        <View className="gap-4 p-4 pb-6">
          <Card className="rounded-3xl border border-border bg-card">
            <CardContent className="gap-4 p-4">
              <View className="flex-row items-start gap-3">
                <View className="rounded-full bg-muted/30 p-2.5">
                  <Icon as={Zap} size={18} className="text-foreground" />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-2xl font-semibold capitalize text-foreground">
                    {formatEffortTitle(effort.activity_category, effort.effort_type)}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    Recorded {formatDateStamp(effort.recorded_at, "Unknown date")}
                  </Text>
                </View>
              </View>

              <View className="flex-row flex-wrap gap-2">
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    Value: {formatActivityEffortPresentationValue(effort)}
                  </Text>
                </View>
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    Duration: {formatEffortDuration(effort.duration_seconds)}
                  </Text>
                </View>
                {effort.start_offset != null ? (
                  <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                    <Text className="text-xs font-medium text-foreground">
                      Started at: {formatEffortDuration(effort.start_offset)}
                    </Text>
                  </View>
                ) : null}
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium capitalize text-foreground">
                    Source: {(effort.source ?? "unknown").replaceAll("_", " ")}
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>

          {linkedActivityCard ? (
            <ActivityCard
              activity={linkedActivityCard}
              dateMode="absolute"
              onPress={() => navigateTo(ROUTES.ACTIVITIES.DETAIL(linkedActivityCard.id) as Href)}
              owner={activityOwner}
              testID="activity-effort-open-activity"
              variant="list"
            />
          ) : null}

          {routeCoordinates.length > 0 ? (
            <ActivityRouteMap coordinates={routeCoordinates} height={240} title="Route" />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
