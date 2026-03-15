import React from "react";
import { View, FlatList, Alert } from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { Text } from "@/components/ui/text";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Plus, Trash2, Activity, Zap, Timer } from "lucide-react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { format } from "date-fns";

function ActivityEffortsList() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const {
    data: efforts,
    isLoading,
    error,
  } = trpc.activityEfforts.getForProfile.useQuery();

  const deleteMutation = trpc.activityEfforts.delete.useMutation({
    onSuccess: () => {
      utils.activityEfforts.getForProfile.invalidate();
    },
    onError: (err) => {
      Alert.alert("Error", err.message || "Failed to delete effort");
    },
  });

  const handleDelete = (id: string) => {
    Alert.alert(
      "Delete Effort",
      "Are you sure you want to delete this activity effort?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ id }),
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">
          Loading efforts...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-base font-semibold text-foreground">
          Unable to load efforts
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">
          {error.message}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={efforts}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 gap-4"
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            <Icon
              as={Activity}
              size={48}
              className="text-muted-foreground mb-4"
            />
            <Text className="text-lg font-medium text-foreground">
              No efforts recorded
            </Text>
            <Text className="text-sm text-muted-foreground text-center mt-2">
              Record your best efforts for power and speed across different
              activities.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <CardHeader className="flex-row justify-between items-start pb-2">
              <View>
                <CardTitle className="capitalize text-lg text-foreground">
                  {item.activity_category} - {item.effort_type}
                </CardTitle>
                <CardDescription>
                  {format(new Date(item.recorded_at), "MMM d, yyyy")}
                </CardDescription>
              </View>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => handleDelete(item.id)}
                disabled={deleteMutation.isPending}
              >
                <Icon as={Trash2} size={18} className="text-destructive" />
              </Button>
            </CardHeader>
            <CardContent>
              <View className="flex-row justify-between mt-2">
                <View className="flex-row items-center gap-2">
                  <Icon
                    as={Timer}
                    size={16}
                    className="text-muted-foreground"
                  />
                  <Text className="text-foreground font-medium">
                    {item.duration_seconds}s
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Icon as={Zap} size={16} className="text-primary" />
                  <Text className="text-foreground font-bold text-lg">
                    {item.value} {item.unit}
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>
        )}
      />

      <View className="absolute bottom-6 right-6">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg"
          onPress={() =>
            router.push("/(internal)/(standard)/activity-effort-create" as any)
          }
        >
          <Icon as={Plus} size={24} className="text-primary-foreground" />
        </Button>
      </View>
    </View>
  );
}

export default function ActivityEffortsListWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ActivityEffortsList />
    </ErrorBoundary>
  );
}
