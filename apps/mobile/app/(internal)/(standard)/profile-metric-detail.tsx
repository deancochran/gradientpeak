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
import { Ellipsis, HeartPulse, Scale, TrendingUp } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
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

export default function ProfileMetricDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { profile, user } = useAuth();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const utils = api.useUtils();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const activityOwner = user?.id
    ? {
        avatar_url: profile?.avatar_url ?? null,
        id: user.id,
        username: profile?.username ?? user.email?.split("@")[0] ?? "You",
      }
    : null;

  const { data: metric, isLoading } = api.profileMetrics.getById.useQuery(
    { id: id! },
    { enabled: !!id },
  );
  const { data: activityData } = api.activities.getById.useQuery(
    metric?.reference_activity_id ? { id: metric.reference_activity_id } : skipToken,
  );

  const deleteMutation = api.profileMetrics.delete.useMutation({
    onSuccess: async () => {
      await utils.profileMetrics.invalidate();
      router.back();
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to delete profile metric");
    },
  });

  const handleDelete = () => {
    if (!metric) return;
    setShowDeleteConfirm(true);
  };

  const renderHeaderActions = () => (
    <DropdownMenu>
      <DropdownMenuTrigger testID="profile-metric-detail-options-trigger">
        <View className="rounded-full p-2">
          <Icon as={Ellipsis} size={18} className="text-foreground" />
        </View>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        <DropdownMenuItem
          onPress={handleDelete}
          variant="destructive"
          testID="profile-metric-detail-options-delete"
        >
          <Text>{deleteMutation.isPending ? "Deleting..." : "Delete Metric"}</Text>
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

  if (!metric) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">Profile metric not found</Text>
      </View>
    );
  }

  const MetricIcon = getMetricIcon(metric.metric_type);

  return (
    <View className="flex-1 bg-background" testID="profile-metric-detail-screen">
      <Stack.Screen options={{ headerRight: renderHeaderActions }} />
      <ScrollView className="flex-1">
        <View className="gap-4 p-4 pb-6">
          <Card className="rounded-3xl border border-border bg-card">
            <CardContent className="gap-4 p-4">
              <View className="flex-row items-start gap-3">
                <View className="rounded-full bg-muted/30 p-2.5">
                  <Icon as={MetricIcon} size={18} className="text-foreground" />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-2xl font-semibold text-foreground">
                    {getMetricLabel(metric.metric_type)}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    Recorded {new Date(metric.recorded_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <View className="flex-row flex-wrap gap-2">
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    Value: {metric.value} {metric.unit}
                  </Text>
                </View>
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    Type: {getMetricLabel(metric.metric_type)}
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>

          {metric.notes ? (
            <Card className="rounded-3xl border border-border bg-card">
              <CardContent className="gap-2 p-4">
                <Text className="text-sm font-semibold text-foreground">Notes</Text>
                <Text className="text-sm text-muted-foreground">{metric.notes}</Text>
              </CardContent>
            </Card>
          ) : null}

          {metric.reference_activity_id && activityData?.activity ? (
            <ActivityCard
              activity={{
                ...(activityData.activity as any),
                derived: {
                  ...((activityData.activity as any).derived ?? {}),
                  stress: activityData.derived?.stress ?? null,
                },
              }}
              dateMode="absolute"
              onPress={() =>
                navigateTo(ROUTES.ACTIVITIES.DETAIL(metric.reference_activity_id!) as any)
              }
              owner={activityOwner}
              testID="profile-metric-open-activity"
              variant="list"
            />
          ) : null}
        </View>
      </ScrollView>
      {showDeleteConfirm ? (
        <AppConfirmModal
          description="Are you sure you want to delete this profile metric?"
          onClose={() => setShowDeleteConfirm(false)}
          primaryAction={{
            label: deleteMutation.isPending ? "Deleting..." : "Delete Metric",
            onPress: () => deleteMutation.mutate({ id: metric.id }),
            testID: "profile-metric-detail-delete-confirm",
            variant: "destructive",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowDeleteConfirm(false),
            variant: "outline",
          }}
          testID="profile-metric-detail-delete-modal"
          title="Delete Metric"
        />
      ) : null}
    </View>
  );
}
