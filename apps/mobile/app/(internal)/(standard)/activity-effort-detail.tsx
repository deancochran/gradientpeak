import { decodePolyline } from "@repo/core";
import { Card, CardContent, CardTitle } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { skipToken } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, Clock3, Ellipsis, Timer, Zap } from "lucide-react-native";
import React, { useMemo } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { ActivityRouteMap } from "@/components/activity/maps/ActivityRouteMap";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function formatEffortTitle(category: string, type: string) {
  return `${category.replace(/_/g, " ")} ${type}`;
}

export default function ActivityEffortDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const utils = api.useUtils();

  const { data: effort, isLoading } = api.activityEfforts.getById.useQuery(
    { id: id! },
    { enabled: !!id },
  );
  const { data: activityData } = api.activities.getById.useQuery(
    effort?.activity_id ? { id: effort.activity_id } : skipToken,
  );

  const deleteMutation = api.activityEfforts.delete.useMutation({
    onSuccess: async () => {
      await utils.activityEfforts.getForProfile.invalidate();
      router.back();
    },
    onError: (err) => {
      Alert.alert("Error", err.message || "Failed to delete effort");
    },
  });

  const routeCoordinates = useMemo(() => {
    const polyline = activityData?.activity?.polyline;
    return polyline ? decodePolyline(polyline) : [];
  }, [activityData?.activity?.polyline]);

  const handleDelete = () => {
    if (!effort) return;
    Alert.alert("Delete Effort", "Are you sure you want to delete this activity effort?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate({ id: effort.id }),
      },
    ]);
  };

  const renderHeaderActions = () => (
    <DropdownMenu>
      <DropdownMenuTrigger testID="activity-effort-detail-options-trigger">
        <View className="rounded-full p-2">
          <Icon as={Ellipsis} size={18} className="text-foreground" />
        </View>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        <DropdownMenuItem
          onPress={handleDelete}
          variant="destructive"
          testID="activity-effort-detail-options-delete"
        >
          <Text>{deleteMutation.isPending ? "Deleting..." : "Delete Effort"}</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!effort) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">Effort not found</Text>
      </View>
    );
  }

  const linkedActivity = activityData?.activity;
  const derived = activityData?.derived;

  return (
    <View className="flex-1 bg-background" testID="activity-effort-detail-screen">
      <Stack.Screen options={{ headerRight: renderHeaderActions }} />
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
                    Recorded {new Date(effort.recorded_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <View className="flex-row flex-wrap gap-2">
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    Value: {effort.value} {effort.unit}
                  </Text>
                </View>
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    Duration: {formatDuration(effort.duration_seconds)}
                  </Text>
                </View>
                {effort.start_offset != null ? (
                  <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                    <Text className="text-xs font-medium text-foreground">
                      Started at: {formatDuration(effort.start_offset)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </CardContent>
          </Card>

          {linkedActivity ? (
            <Card className="rounded-3xl border border-border bg-card">
              <CardContent className="gap-4 p-4">
                <View className="gap-1">
                  <Text className="text-sm font-semibold text-foreground">
                    Performed on activity
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Open the linked activity for the full recording and analysis.
                  </Text>
                </View>
                <View className="rounded-2xl border border-border bg-muted/10 px-4 py-3">
                  <Text className="text-base font-semibold text-foreground">
                    {linkedActivity.name}
                  </Text>
                  <Text className="mt-1 text-sm text-muted-foreground">
                    {new Date(linkedActivity.started_at).toLocaleString()}
                  </Text>
                  <View className="mt-3 flex-row flex-wrap gap-2">
                    <View className="rounded-full border border-border bg-background px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        Distance: {(linkedActivity.distance_meters / 1000).toFixed(2)} km
                      </Text>
                    </View>
                    <View className="rounded-full border border-border bg-background px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        Duration: {formatDuration(linkedActivity.duration_seconds)}
                      </Text>
                    </View>
                    {derived?.stress.tss != null ? (
                      <View className="rounded-full border border-border bg-background px-3 py-1.5">
                        <Text className="text-xs font-medium text-foreground">
                          TSS: {Math.round(derived.stress.tss)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Card className="rounded-2xl border border-border bg-background">
                  <CardContent className="p-3">
                    <Text
                      className="text-sm font-medium text-primary"
                      onPress={() => navigateTo(ROUTES.ACTIVITIES.DETAIL(linkedActivity.id) as any)}
                    >
                      Open Activity
                    </Text>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          ) : null}

          {routeCoordinates.length > 0 ? (
            <ActivityRouteMap coordinates={routeCoordinates} height={240} title="Route" />
          ) : null}

          {linkedActivity && effort.start_offset != null ? (
            <Card className="rounded-3xl border border-border bg-card">
              <CardContent className="gap-3 p-4">
                <CardTitle>Segment context</CardTitle>
                <View className="gap-2 rounded-2xl border border-border bg-muted/10 px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Icon as={Clock3} size={16} className="text-muted-foreground" />
                      <Text className="text-xs text-muted-foreground">Start offset</Text>
                    </View>
                    <Text className="text-sm font-medium text-foreground">
                      {formatDuration(effort.start_offset)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Icon as={Timer} size={16} className="text-muted-foreground" />
                      <Text className="text-xs text-muted-foreground">Segment duration</Text>
                    </View>
                    <Text className="text-sm font-medium text-foreground">
                      {formatDuration(effort.duration_seconds)}
                    </Text>
                  </View>
                </View>
              </CardContent>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
