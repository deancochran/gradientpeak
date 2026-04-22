/**
 * @deprecated This component is deprecated. Use ActivityPlanCard from @/components/shared/ActivityPlanCard instead.
 *
 * ActivityPlanCard provides a unified interface that accepts:
 * - activityPlan prop: Direct activity_plan database object
 * - plannedActivity prop: planned_activity with nested activity_plan
 * - activity prop (legacy): Pre-formatted ActivityPlanCardData
 *
 * Migration example:
 * ```tsx
 * // Old:
 * <PlanCard plan={planData} onPress={handlePress} />
 *
 * // New:
 * <ActivityPlanCard activityPlan={planData} onPress={() => handlePress(planData.id)} />
 * ```
 */

import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";

/**
 * @deprecated Use ActivityPlanCard instead
 */
export interface PlanCardData {
  id: string;
  name: string;
  description?: string | null;
  activityType: string;
  estimatedDuration?: number | null; // in minutes
  estimatedTss?: number | null;
  stepCount?: number;
  profileId?: string | null;
  isOwned?: boolean;
}

/**
 * @deprecated Use ActivityPlanCard instead
 */
interface PlanCardProps {
  plan: PlanCardData;
  onPress?: (id: string) => void;
  onSchedule?: (id: string) => void;
  showScheduleButton?: boolean;
  compact?: boolean;
}

/**
 * @deprecated Use ActivityPlanCard from @/components/shared/ActivityPlanCard instead
 */
export function PlanCard({
  plan,
  onPress,
  onSchedule,
  showScheduleButton = false,
  compact = false,
}: PlanCardProps) {
  return (
    <ActivityPlanCard
      activity={{
        id: plan.id,
        name: plan.name,
        description: plan.description ?? undefined,
        activityType: plan.activityType,
        estimatedDuration: plan.estimatedDuration ?? undefined,
        estimatedTss: plan.estimatedTss ?? undefined,
        intensityFactor: undefined,
      }}
      onPress={onPress ? () => onPress(plan.id) : undefined}
      variant={compact ? "compact" : "default"}
    />
  );
}
