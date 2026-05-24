import { decodePolyline } from "@repo/core";
import { Card, CardContent } from "@repo/ui/components/card";
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
import { Ellipsis, Zap } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { ActivityRouteMap } from "@/components/activity/maps/ActivityRouteMap";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
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
  const { profile, user } = useAuth();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const utils = api.useUtils();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: effort, isLoading } = api.activityEfforts.getById.useQuery(
    { id: id! },
    { enabled: !!id },
  );
  const { data: activityData } = api.activities.getById.useQuery(
    effort?.activity_id ? { id: effort.activity_id } : skipToken,
  );

  const deleteMutation = api.activityEfforts.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.activityEfforts.getForProfile.invalidate(),
        utils.activities.invalidate(),
        utils.events.invalidate(),
        utils.trainingPlans.invalidate(),
      ]);
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
    setShowDeleteConfirm(true);
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
  const activityOwner = user?.id
    ? {
        avatar_url: profile?.avatar_url ?? null,
        id: user.id,
        username: profile?.username ?? user.email?.split("@")[0] ?? "You",
      }
    : null;
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
            <ActivityCard
              activity={{
                ...(linkedActivity as any),
                derived: {
                  ...((linkedActivity as any).derived ?? {}),
                  stress: derived?.stress ?? null,
                },
              }}
              dateMode="absolute"
              onPress={() => navigateTo(ROUTES.ACTIVITIES.DETAIL(linkedActivity.id) as any)}
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
      {showDeleteConfirm ? (
        <AppConfirmModal
          description="Are you sure you want to delete this activity effort?"
          onClose={() => setShowDeleteConfirm(false)}
          primaryAction={{
            label: deleteMutation.isPending ? "Deleting..." : "Delete Effort",
            onPress: () => deleteMutation.mutate({ id: effort.id }),
            testID: "activity-effort-detail-delete-confirm",
            variant: "destructive",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowDeleteConfirm(false),
            variant: "outline",
          }}
          testID="activity-effort-detail-delete-modal"
          title="Delete Effort"
        />
      ) : null}
    </View>
  );
}
