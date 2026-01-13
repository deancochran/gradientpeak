/**
 * Plan Picker Page
 *
 * Full-screen page for selecting/detaching training plans during recording.
 * Accessed via navigation from footer "Plan" tile.
 *
 * Features:
 * - Display list of available training plans
 * - "Detach Plan" option if plan currently attached
 * - Standard back navigation via header
 * - Recording continues in background
 */

import React, { useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Check } from "lucide-react-native";
import { trpc } from "@/lib/trpc";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { useRecordingConfiguration } from "@/lib/hooks/useRecordingConfiguration";
import { usePlan } from "@/lib/hooks/useActivityRecorder";

export default function PlanPickerPage() {
  const service = useSharedActivityRecorder();
  const plan = usePlan(service);
  const { attachPlan, detachPlan } = useRecordingConfiguration(service);

  // Fetch training plans
  const { data: plans, isLoading } = trpc.trainingPlans.list.useQuery();

  // Handle plan selection
  const handlePlanPress = useCallback(
    (planId: string) => {
      attachPlan(planId);
      router.back();
    },
    [attachPlan],
  );

  // Handle detach plan
  const handleDetach = useCallback(() => {
    detachPlan();
    router.back();
  }, [detachPlan]);

  const currentPlanId = service?.recordingMetadata?.plannedActivityId;

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Loading State */}
        {isLoading && (
          <View className="items-center justify-center py-8">
            <ActivityIndicator size="large" />
            <Text className="text-sm text-muted-foreground mt-2">
              Loading plans...
            </Text>
          </View>
        )}

        {/* Detach Plan Option (if plan attached) */}
        {!isLoading && currentPlanId && (
          <Pressable
            onPress={handleDetach}
            className="bg-card p-4 rounded-lg border border-border mb-3"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-medium text-destructive">
                  Detach Current Plan
                </Text>
                <Text className="text-sm text-muted-foreground mt-1">
                  Remove plan from this workout
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Plans List */}
        {!isLoading && plans && plans.length > 0 ? (
          <View className="gap-3 pb-6">
            {plans.map((plan) => (
              <PlanListItem
                key={plan.id}
                plan={plan}
                isSelected={plan.id === currentPlanId}
                onPress={() => handlePlanPress(plan.id)}
              />
            ))}
          </View>
        ) : (
          !isLoading && (
            <View className="items-center justify-center py-8">
              <Text className="text-sm text-muted-foreground">
                No training plans available
              </Text>
              <Text className="text-xs text-muted-foreground mt-1">
                Create a plan from the Library tab
              </Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Plan List Item Component
 */
interface PlanListItemProps {
  plan: {
    id: string;
    name: string;
    description: string | null;
  };
  isSelected: boolean;
  onPress: () => void;
}

function PlanListItem({ plan, isSelected, onPress }: PlanListItemProps) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-card p-4 rounded-lg border border-border"
      style={{
        borderColor: isSelected ? "rgb(34, 197, 94)" : undefined,
        borderWidth: isSelected ? 2 : 1,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-base font-medium">{plan.name}</Text>
          {plan.description && (
            <Text className="text-sm text-muted-foreground mt-1">
              {plan.description}
            </Text>
          )}
        </View>

        {isSelected && (
          <Icon as={Check} size={20} className="text-green-500 ml-2" />
        )}
      </View>
    </Pressable>
  );
}
