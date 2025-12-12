// apps/mobile/app/(internal)/(tabs)/plan/training-plan/modals/AddActivityModal.tsx

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import {
  ActivitySelector,
  type ActivityOption,
} from "./components/ActivitySelector";
import { ConstraintValidator } from "./components/ConstraintValidator";

interface AddActivityModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string; // ISO format date (YYYY-MM-DD)
  trainingPlanId: string;
  onSuccess?: () => void;
}

/**
 * AddActivityModal Component
 *
 * Modal for scheduling a activity with real-time constraint validation.
 * Allows users to:
 * 1. Select a activity from their activity plans
 * 2. See real-time validation against training plan constraints
 * 3. Schedule the activity
 *
 * Features:
 * - Searchable activity list
 * - Real-time constraint validation
 * - Visual feedback on constraint status
 * - Warning/error messages for violations
 *
 * Usage:
 * ```tsx
 * const [showModal, setShowModal] = useState(false);
 * <AddActivityModal
 *   visible={showModal}
 *   onClose={() => setShowModal(false)}
 *   selectedDate="2024-03-15"
 *   trainingPlanId={planId}
 *   onSuccess={() => {
 *     // Refresh data
 *     refetch();
 *   }}
 * />
 * ```
 */
export function AddActivityModal({
  visible,
  onClose,
  selectedDate,
  trainingPlanId,
  onSuccess,
}: AddActivityModalProps) {
  const [selectedActivity, setSelectedActivity] =
    useState<ActivityOption | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setSelectedActivity(null);
    }
  }, [visible]);

  // Fetch available activities
  const {
    data: activitiesData,
    isLoading: activitiesLoading,
    error: activitiesError,
  } = trpc.activityPlans.list.useQuery(
    {
      limit: 100,
    },
    {
      enabled: visible,
    },
  );

  // Validate constraints in real-time
  const {
    data: validation,
    isLoading: validationLoading,
    error: validationError,
  } = trpc.plannedActivities.validateConstraints.useQuery(
    {
      training_plan_id: trainingPlanId,
      scheduled_date: selectedDate,
      activity_plan_id: selectedActivity?.id ?? "",
    },
    {
      enabled: visible && !!selectedActivity,
    },
  );

  const utils = trpc.useUtils();

  // Schedule activity mutation
  const scheduleMutation = useReliableMutation(trpc.plannedActivities.create, {
    invalidate: [utils.plannedActivities],
    success: "Activity scheduled!",
    onSuccess: () => {
      onSuccess?.();
      onClose();
    },
  });

  const handleSchedule = async () => {
    if (!selectedActivity) return;
    await scheduleMutation.mutateAsync({
      activity_plan_id: selectedActivity.id,
      scheduled_date: selectedDate,
    });
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const canSchedule =
    selectedActivity &&
    (validation?.canSchedule ?? false) &&
    !scheduleMutation.isPending;

  const activities = activitiesData?.items || [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200">
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-900">
              Schedule Activity
            </Text>
            <Text className="text-sm text-gray-600 mt-0.5">
              {formatDate(selectedDate)}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            className="p-2 rounded-full bg-gray-100"
            disabled={scheduleMutation.isPending}
          >
            <X size={24} className="text-gray-600" />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4"
          showsVerticalScrollIndicator={true}
        >
          {/* Activity Selection Section */}
          <View className="mb-6">
            {activitiesLoading && (
              <View className="py-8 items-center">
                <ActivityIndicator size="large" />
                <Text className="text-gray-600 mt-2">
                  Loading activities...
                </Text>
              </View>
            )}

            {activitiesError && (
              <View className="p-4 bg-red-50 rounded-lg">
                <Text className="text-red-700">
                  Failed to load activities. Please try again.
                </Text>
              </View>
            )}

            {!activitiesLoading && !activitiesError && (
              <View style={{ height: 300 }}>
                <ActivitySelector
                  activities={activities}
                  selectedActivityId={selectedActivity?.id ?? null}
                  onSelect={setSelectedActivity}
                  disabled={scheduleMutation.isPending}
                />
              </View>
            )}
          </View>

          {/* Constraint Validation Section */}
          {selectedActivity && (
            <View className="mb-6">
              {validationError && (
                <View className="p-4 bg-red-50 rounded-lg mb-4">
                  <Text className="text-red-700">
                    Failed to validate constraints. Please try again.
                  </Text>
                </View>
              )}

              <ConstraintValidator
                validation={validation ?? null}
                isLoading={validationLoading}
              />
            </View>
          )}

          {/* Error Message */}
          {scheduleMutation.error && (
            <View className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <Text className="text-red-700 font-medium">
                Failed to schedule activity
              </Text>
              <Text className="text-red-600 text-sm mt-1">
                {scheduleMutation.error.message || "Please try again"}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Footer Actions */}
        <View className="px-4 py-4 border-t border-gray-200 bg-white">
          <View className="flex-row space-x-3">
            <Button
              variant="outline"
              onPress={onClose}
              disabled={scheduleMutation.isPending}
              className="flex-1"
            >
              <Text>Cancel</Text>
            </Button>
            <Button
              onPress={handleSchedule}
              disabled={!canSchedule || scheduleMutation.isPending}
              className="flex-1"
            >
              {scheduleMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white">
                  {validation && !validation.canSchedule
                    ? "Schedule Anyway"
                    : "Schedule Activity"}
                </Text>
              )}
            </Button>
          </View>

          {/* Helper text */}
          {selectedActivity && (
            <Text className="text-xs text-gray-500 text-center mt-2">
              {validation && !validation.canSchedule
                ? "⚠️ This will override constraint violations"
                : validation?.hasWarnings
                  ? "⚠️ Close to constraint limits"
                  : "✓ Ready to schedule"}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
