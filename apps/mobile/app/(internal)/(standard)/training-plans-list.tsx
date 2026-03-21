import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { ListSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { ChevronRight, Eye, EyeOff, Plus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ROUTES } from "@/lib/constants/routes";
import { trpc } from "@/lib/trpc";

function TrainingPlansListScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: plans,
    isLoading,
    refetch,
  } = trpc.trainingPlans.list.useQuery({
    ownerScope: "own",
    includeOwnOnly: true,
    includeSystemTemplates: false,
  });

  const sortedPlans = useMemo(() => plans ?? [], [plans]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <ScrollView className="flex-1 bg-background">
        <View className="p-4">
          <ListSkeleton count={6} />
        </View>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 py-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Button onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.CREATE as any)}>
          <Icon as={Plus} size={16} className="text-primary-foreground mr-2" />
          <Text className="text-primary-foreground">Create Training Plan</Text>
        </Button>

        {sortedPlans.length === 0 ? (
          <Card>
            <CardContent className="p-4 gap-2">
              <Text className="text-base font-semibold text-foreground">No training plans yet</Text>
              <Text className="text-sm text-muted-foreground">
                Create your first plan to start scheduling structured training.
              </Text>
            </CardContent>
          </Card>
        ) : (
          sortedPlans.map((plan) => {
            const isPublic = plan.template_visibility === "public";
            const visibilityLabel = isPublic ? "Public" : "Private";

            return (
              <TouchableOpacity
                key={plan.id}
                onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.DETAIL(plan.id) as any)}
                activeOpacity={0.8}
              >
                <Card>
                  <CardContent className="p-4 gap-3">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 gap-1">
                        <Text className="text-base font-semibold text-foreground">
                          {plan.name || "Untitled training plan"}
                        </Text>
                        <Text className="text-sm text-muted-foreground">
                          {plan.description?.trim() ||
                            "No description added for this training plan."}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1 rounded-full border border-border px-2 py-1">
                        <Icon
                          as={isPublic ? Eye : EyeOff}
                          size={12}
                          className="text-muted-foreground"
                        />
                        <Text className="text-xs text-muted-foreground">{visibilityLabel}</Text>
                      </View>
                    </View>

                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-muted-foreground">
                        Open to edit, apply, or delete.
                      </Text>
                      <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
                    </View>
                  </CardContent>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

export default function TrainingPlansListScreenWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <TrainingPlansListScreen />
    </ErrorBoundary>
  );
}
