import {
  deriveActivityPlanPresentation,
  getAuthoritativeActivityPlanMetrics,
} from "@repo/core/activity-plan";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { Calendar } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { getUniqueActivityCategoryConfigs } from "@/lib/constants/activities";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { ActivityPlanSummary } from "./ActivityPlanSummary";
import type { EntityOwner } from "./EntityOwnerRow";
import {
  ResourceCardShell,
  ResourceCategoryItems,
  ResourceLikeButton,
  ResourceOwnerActionRow,
} from "./ResourceCardPrimitives";
import type { SportLoadMeasurement } from "./SportLoadBreakdown";

// ============================================
// TYPES
// ============================================

// Database object types
export interface ActivityPlan {
  id: string;
  name: string;
  categories?: readonly string[];
  primary_category?: string;
  structure_hash?: string;
  description?: string | null;
  structure?: unknown;
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    estimated_distance?: number | null;
  } | null;
  common_load?: unknown;
  category_loads?: readonly SportLoadMeasurement[];
  notes?: string | null;
  profile_id?: string | null;
  template_visibility?: string | null;
  is_system_template?: boolean | null;
  created_at?: string | Date;
  updated_at?: string | Date;
  likes_count?: number | null;
  has_liked?: boolean;
  owner?: EntityOwner | null;
}

export interface PlannedActivity {
  id: string;
  activity_plan_id: string;
  activity_plan?: ActivityPlan;
  scheduled_date: string;
  notes?: string | null;
  completed_activity_id?: string | null;
  profile_id?: string;
  created_at?: string;
  updated_at?: string;
}

// Legacy data interface (for backwards compatibility)
export interface ActivityPlanCardData {
  id: string;
  name: string;
  activityType: string; // activity_category
  activityCategories?: readonly string[];
  description?: string;
  structure?: unknown;
  estimatedDuration?: number; // in seconds
  estimatedTss?: number;
  intensityFactor?: number;
  commonLoad?: unknown;
  categoryLoads?: readonly SportLoadMeasurement[];
  estimatedDistance?: number; // meters
  notes?: string;
  createdAt?: string;
  updatedAt?: string;

  // Scheduling info (optional)
  scheduledDate?: string; // ISO date string
  isCompleted?: boolean;

  likes_count?: number | null;
  has_liked?: boolean;
  owner?: EntityOwner | null;
}

interface ActivityPlanCardProps {
  // New flexible prop: accepts activity_plan directly, or planned_activity with nested activity_plan
  activityPlan?: ActivityPlan;
  plannedActivity?: PlannedActivity;

  // Legacy support: accepts pre-formatted data
  activity?: ActivityPlanCardData;

  onPress?: () => void;
  testID?: string;
  variant?: "default" | "compact";
  showScheduleInfo?: boolean; // Show date/time badge
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ActivityPlanCard({
  activityPlan,
  plannedActivity,
  activity: legacyActivity,
  onPress,
  testID,
  variant = "default",
  showScheduleInfo = false,
}: ActivityPlanCardProps) {
  // Transform database objects to internal format
  const activity = legacyActivity || transformToCardData(activityPlan, plannedActivity);

  // Determine card size based on variant
  const isCompact = variant === "compact";
  const presentation = useMemo(
    () => deriveActivityPlanPresentation(activity.structure),
    [activity.structure],
  );
  const categoryItems = getUniqueActivityCategoryConfigs(
    presentation?.categories ?? activity.activityCategories ?? [activity.activityType],
  ).map((category) => ({
    icon: category.icon,
    iconClassName: category.color,
    label: category.name,
  }));

  const {
    isLiked,
    isPending: isLikePending,
    likeCount,
    toggleLike,
  } = useResourceLike({
    entityId: activity.id,
    entityType: "activity_plan",
    initialCount: activity.likes_count,
    initialLiked: activity.has_liked,
  });

  return (
    <ResourceCardShell
      accessibilityLabel={
        onPress ? `Open activity plan ${activity.name || "Untitled activity plan"}` : undefined
      }
      actionRegion={
        isCompact ? undefined : (
          <ResourceOwnerActionRow
            actions={
              <ResourceLikeButton
                disabled={isLikePending}
                isLiked={isLiked}
                likeCount={likeCount}
                onPress={toggleLike}
              />
            }
            compact={isCompact}
            categoryItems={categoryItems}
            fallbackLabel="GradientPeak"
            owner={activity.owner}
            timestamp={activity.createdAt ?? activity.updatedAt}
          />
        )
      }
      cardClassName={activity.isCompleted ? "opacity-60" : undefined}
      compact={isCompact}
      contentClassName={isCompact ? "gap-3 px-2" : "gap-3 px-3"}
      onPress={onPress}
      testID={testID ?? `activity-plan-card-${activity.id}`}
    >
      {isCompact ? <ResourceCategoryItems items={categoryItems} /> : null}

      <ActivityPlanSummary
        activityCategory={activity.activityType}
        categoryLoads={activity.categoryLoads}
        description={activity.description || activity.notes || null}
        estimatedDuration={activity.estimatedDuration}
        estimatedTss={activity.estimatedTss}
        intensityFactor={activity.intensityFactor}
        commonLoad={activity.commonLoad}
        owner={activity.owner}
        presentation={presentation}
        structure={activity.structure}
        title={activity.name}
        variant="standalone"
        showAttribution={false}
      />

      {showScheduleInfo && activity.scheduledDate && (
        <View className="mb-2 mt-3 flex-row items-center">
          <Icon as={Calendar} size={12} className="text-muted-foreground mr-1.5" />
          <Text className="text-xs text-muted-foreground">
            {formatScheduledDateTime(activity.scheduledDate)}
          </Text>
        </View>
      )}

      <ActivityPlanContentPreview
        compact={isCompact}
        size={isCompact ? "small" : "medium"}
        plan={{
          authoritative_metrics: {
            estimated_duration: activity.estimatedDuration,
            estimated_tss: activity.estimatedTss,
            intensity_factor: activity.intensityFactor,
            estimated_distance: activity.estimatedDistance,
          },
          structure: activity.structure,
        }}
        presentation={presentation}
        testIDPrefix={`activity-plan-card-preview-${activity.id}`}
      />
    </ResourceCardShell>
  );
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Transform database objects to internal card data format
 */
function transformToCardData(
  activityPlan?: ActivityPlan,
  plannedActivity?: PlannedActivity,
): ActivityPlanCardData {
  // Determine the source of activity_plan data
  const plan = plannedActivity?.activity_plan || activityPlan;

  if (!plan) {
    throw new Error(
      "ActivityPlanCard: Either activityPlan or plannedActivity with nested activity_plan must be provided",
    );
  }

  const authoritativeMetrics = getAuthoritativeActivityPlanMetrics(plan);

  return {
    id: plannedActivity?.id || plan.id,
    name: plan.name,
    activityType: plan.primary_category ?? plan.categories?.[0] ?? "other",
    activityCategories: plan.categories,
    description: plan.description || undefined,
    structure: plan.structure,
    estimatedDuration: authoritativeMetrics.estimated_duration ?? undefined,
    estimatedTss: authoritativeMetrics.estimated_tss ?? undefined,
    intensityFactor: authoritativeMetrics.intensity_factor ?? undefined,
    commonLoad: plan.common_load,
    categoryLoads: plan.category_loads,
    estimatedDistance: authoritativeMetrics.estimated_distance ?? undefined,
    notes: plannedActivity?.notes || plan.description || plan.notes || undefined,
    createdAt:
      plan.created_at instanceof Date
        ? plan.created_at.toISOString()
        : plan.created_at || undefined,
    updatedAt:
      plan.updated_at instanceof Date
        ? plan.updated_at.toISOString()
        : plan.updated_at || undefined,
    scheduledDate: plannedActivity?.scheduled_date,
    isCompleted: Boolean(plannedActivity?.completed_activity_id),
    likes_count: plan.likes_count,
    has_liked: plan.has_liked,
    owner: plan.owner ?? null,
  };
}

/**
 * Format scheduled date/time for compact display
 */
function formatScheduledDateTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.floor((activityDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  // Check if time component exists (not midnight)
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;

  // Format date part
  let datePart = "";
  if (diffDays === 0) datePart = "Today";
  else if (diffDays === 1) datePart = "Tomorrow";
  else if (diffDays === -1) datePart = "Yesterday";
  else if (diffDays > 1 && diffDays < 7) datePart = format(date, "EEEE");
  else datePart = format(date, "MMM d");

  // Add time if specified
  if (hasTime) {
    const timePart = format(date, "h:mm a");
    return `${datePart} • ${timePart}`;
  }

  return datePart;
}
