// apps/mobile/app/(internal)/(tabs)/plan/training-plan/modals/components/ConstraintValidator.tsx

import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { ConstraintIndicator, type ConstraintStatus } from "./ConstraintIndicator";

interface ConstraintValidationResult {
  constraints: {
    weeklyLoad: {
      status: ConstraintStatus;
      current: number | null;
      withNew: number | null;
      limit: number;
    };
    activitiesPerWeek: {
      status: ConstraintStatus;
      current: number;
      withNew: number;
      limit: number;
    };
    consecutiveDays: {
      status: ConstraintStatus;
      current: number;
      withNew: number;
      limit: number;
    };
    restDays: {
      status: ConstraintStatus;
      current: number;
      withNew: number;
      minimum: number;
    };
  };
  canSchedule: boolean;
  hasWarnings: boolean;
}

interface ConstraintValidatorProps {
  validation: ConstraintValidationResult | null;
  isLoading?: boolean;
}

/**
 * ConstraintValidator Component
 *
 * Displays real-time validation of training plan constraints when scheduling a activity.
 * Shows all constraint checks with visual status indicators (satisfied/warning/violated).
 *
 * Validation checks:
 * - Weekly Load limit
 * - Activities per week target
 * - Consecutive training days
 * - Minimum rest days per week
 *
 * Note: Hard activity spacing cannot be validated proactively without normalized-intensity data.
 *
 * Visual feedback:
 * - Green checkmark: Constraint satisfied
 * - Yellow warning: Close to limit (warning)
 * - Red X: Constraint violated
 *
 * Usage:
 * ```tsx
 * const { data: validation, isLoading } = api.events.validateConstraints.useQuery({
 *   training_plan_id: planId,
 *   scheduled_date: date,
 *   activity: { estimated_duration: 100, intensity: "moderate" }
 * });
 *
 * <ConstraintValidator validation={validation} isLoading={isLoading} />
 * ```
 */
export function ConstraintValidator({ validation, isLoading = false }: ConstraintValidatorProps) {
  if (isLoading) {
    return (
      <View className="p-4 bg-muted rounded-lg">
        <Text className="text-sm text-muted-foreground text-center">Validating constraints...</Text>
      </View>
    );
  }

  if (!validation) {
    return (
      <View className="p-4 bg-muted rounded-lg">
        <Text className="text-sm text-muted-foreground text-center">
          Select a activity to see constraint validation
        </Text>
      </View>
    );
  }

  const { constraints, canSchedule, hasWarnings } = validation;
  const isWeeklyLoadUnavailable =
    constraints.weeklyLoad.current === null || constraints.weeklyLoad.withNew === null;

  return (
    <View className="space-y-3">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-base font-semibold text-foreground">Constraint Validation</Text>
        {canSchedule && !hasWarnings && (
          <View className="flex-row items-center">
            <Text className="text-sm font-medium text-green-600">✓ All constraints satisfied</Text>
          </View>
        )}
        {hasWarnings && canSchedule && (
          <View className="flex-row items-center">
            <Text className="text-sm font-medium text-yellow-600">⚠️ Has warnings</Text>
          </View>
        )}
        {!canSchedule && isWeeklyLoadUnavailable && (
          <View className="flex-row items-center">
            <Text className="text-sm font-medium text-red-600">❌ Load cannot be evaluated</Text>
          </View>
        )}
        {!canSchedule && !isWeeklyLoadUnavailable && (
          <View className="flex-row items-center">
            <Text className="text-sm font-medium text-red-600">❌ Constraints violated</Text>
          </View>
        )}
      </View>

      {/* Weekly Load Constraint */}
      <ConstraintIndicator
        label="Weekly Load"
        status={constraints.weeklyLoad.status}
        currentValue={constraints.weeklyLoad.current}
        newValue={constraints.weeklyLoad.withNew}
        limit={constraints.weeklyLoad.limit}
        unit="Common Load"
        description="Total training Load for this week"
      />

      {/* Activities Per Week Constraint */}
      <ConstraintIndicator
        label="Activities Per Week"
        status={constraints.activitiesPerWeek.status}
        currentValue={constraints.activitiesPerWeek.current}
        newValue={constraints.activitiesPerWeek.withNew}
        limit={constraints.activitiesPerWeek.limit}
        unit="activities"
        description="Number of planned activities this week"
      />

      {/* Consecutive Days Constraint */}
      <ConstraintIndicator
        label="Consecutive Training Days"
        status={constraints.consecutiveDays.status}
        currentValue={constraints.consecutiveDays.current}
        newValue={constraints.consecutiveDays.withNew}
        limit={constraints.consecutiveDays.limit}
        unit="days"
        description="Maximum streak of training days without rest"
      />

      {/* Rest Days Constraint */}
      <ConstraintIndicator
        label="Rest Days Per Week"
        status={constraints.restDays.status}
        currentValue={constraints.restDays.current}
        newValue={constraints.restDays.withNew}
        limit={constraints.restDays.minimum}
        unit="days"
        description="Minimum rest days required this week"
      />

      {/* Bottom Warning/Error Message */}
      {!canSchedule && isWeeklyLoadUnavailable && (
        <View className="p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
          <Text className="text-sm text-red-700 font-medium">
            Weekly Common Load cannot be evaluated because comparable Common Load is unavailable.
          </Text>
          <Text className="text-xs text-red-600 mt-1">
            Scheduling remains blocked until all included activities have comparable Load.
          </Text>
        </View>
      )}

      {!canSchedule && !isWeeklyLoadUnavailable && (
        <View className="p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
          <Text className="text-sm text-red-700 font-medium">
            ⚠️ This activity violates one or more training plan constraints.
          </Text>
          <Text className="text-xs text-red-600 mt-1">
            Scheduling is not recommended but can be overridden.
          </Text>
        </View>
      )}

      {hasWarnings && canSchedule && (
        <View className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mt-2">
          <Text className="text-sm text-yellow-700 font-medium">
            ⚠️ This activity is close to one or more limits.
          </Text>
          <Text className="text-xs text-yellow-600 mt-1">
            Consider adjusting your plan or activity selection.
          </Text>
        </View>
      )}
    </View>
  );
}
