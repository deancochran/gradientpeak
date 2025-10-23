// apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/modals/components/ConstraintValidator.tsx

import { Text } from "@/components/ui/text";
import { View } from "react-native";
import {
  ConstraintIndicator,
  type ConstraintStatus,
} from "./ConstraintIndicator";

interface ConstraintValidationResult {
  constraints: {
    weeklyTSS: {
      status: ConstraintStatus;
      current: number;
      withNew: number;
      limit: number;
    };
    workoutsPerWeek: {
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
 * Displays real-time validation of training plan constraints when scheduling a workout.
 * Shows all constraint checks with visual status indicators (satisfied/warning/violated).
 *
 * Validation checks:
 * - Weekly TSS limit
 * - Workouts per week target
 * - Consecutive training days
 * - Minimum rest days per week
 *
 * Note: Hard workout spacing cannot be validated proactively (requires actual IF data).
 *
 * Visual feedback:
 * - Green checkmark: Constraint satisfied
 * - Yellow warning: Close to limit (warning)
 * - Red X: Constraint violated
 *
 * Usage:
 * ```tsx
 * const { data: validation, isLoading } = trpc.plannedActivities.validateConstraints.useQuery({
 *   training_plan_id: planId,
 *   scheduled_date: date,
 *   activity: { estimated_tss: 100, intensity: "moderate" }
 * });
 *
 * <ConstraintValidator validation={validation} isLoading={isLoading} />
 * ```
 */
export function ConstraintValidator({
  validation,
  isLoading = false,
}: ConstraintValidatorProps) {
  if (isLoading) {
    return (
      <View className="p-4 bg-gray-50 rounded-lg">
        <Text className="text-sm text-gray-600 text-center">
          Validating constraints...
        </Text>
      </View>
    );
  }

  if (!validation) {
    return (
      <View className="p-4 bg-gray-50 rounded-lg">
        <Text className="text-sm text-gray-500 text-center">
          Select a workout to see constraint validation
        </Text>
      </View>
    );
  }

  const { constraints, canSchedule, hasWarnings } = validation;

  return (
    <View className="space-y-3">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-base font-semibold text-gray-900">
          Constraint Validation
        </Text>
        {canSchedule && !hasWarnings && (
          <View className="flex-row items-center">
            <Text className="text-sm font-medium text-green-600">
              ✓ All constraints satisfied
            </Text>
          </View>
        )}
        {hasWarnings && canSchedule && (
          <View className="flex-row items-center">
            <Text className="text-sm font-medium text-yellow-600">
              ⚠️ Has warnings
            </Text>
          </View>
        )}
        {!canSchedule && (
          <View className="flex-row items-center">
            <Text className="text-sm font-medium text-red-600">
              ❌ Constraints violated
            </Text>
          </View>
        )}
      </View>

      {/* Weekly TSS Constraint */}
      <ConstraintIndicator
        label="Weekly TSS"
        status={constraints.weeklyTSS.status}
        currentValue={constraints.weeklyTSS.current}
        newValue={constraints.weeklyTSS.withNew}
        limit={constraints.weeklyTSS.limit}
        unit="TSS"
        description="Total Training Stress Score for this week"
      />

      {/* Workouts Per Week Constraint */}
      <ConstraintIndicator
        label="Workouts Per Week"
        status={constraints.workoutsPerWeek.status}
        currentValue={constraints.workoutsPerWeek.current}
        newValue={constraints.workoutsPerWeek.withNew}
        limit={constraints.workoutsPerWeek.limit}
        unit="workouts"
        description="Number of planned workouts this week"
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
      {!canSchedule && (
        <View className="p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
          <Text className="text-sm text-red-700 font-medium">
            ⚠️ This workout violates one or more training plan constraints.
          </Text>
          <Text className="text-xs text-red-600 mt-1">
            Scheduling is not recommended but can be overridden.
          </Text>
        </View>
      )}

      {hasWarnings && canSchedule && (
        <View className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mt-2">
          <Text className="text-sm text-yellow-700 font-medium">
            ⚠️ This workout is close to one or more limits.
          </Text>
          <Text className="text-xs text-yellow-600 mt-1">
            Consider adjusting your plan or workout selection.
          </Text>
        </View>
      )}
    </View>
  );
}
