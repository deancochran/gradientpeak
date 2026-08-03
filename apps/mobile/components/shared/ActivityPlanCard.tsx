import { deriveActivityPlanPresentation } from "@repo/core/activity-plan";
import type { ActivityPrescriptionQuantificationBundle } from "@repo/core/activity-quantification";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { Calendar } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";
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

// ============================================
// TYPES
// ============================================

// Database object types
export interface ActivityPlan {
  id: string;
  name: string;
  activity_category?: string | null;
  structure_hash?: string;
  description?: string | null;
  structure?: unknown;
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
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

/** Preformatted data for plan/card adapters that do not have a database object. */
export interface ActivityPlanCardData {
  id: string;
  name: string;
  activity_category: string;
  description?: string;
  structure?: unknown;
  estimatedDuration?: number; // in seconds
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
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

  // Accepts preformatted data from plan/card adapters.
  cardData?: ActivityPlanCardData;

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
  cardData: providedCardData,
  onPress,
  testID,
  variant = "default",
  showScheduleInfo = false,
}: ActivityPlanCardProps) {
  // Normalize database objects and adapter data to the card's presentation contract.
  const cardData = providedCardData || transformToCardData(activityPlan, plannedActivity);

  // Determine card size based on variant
  const isCompact = variant === "compact";
  const presentation = useMemo(
    () => deriveActivityPlanPresentation(cardData.structure),
    [cardData.structure],
  );
  const categoryItems = getUniqueActivityCategoryConfigs([
    presentation?.activity_category ?? cardData.activity_category,
  ]).map((activity_category) => ({
    icon: activity_category.icon,
    iconClassName: activity_category.color,
    label: activity_category.name,
  }));

  const {
    isLiked,
    isPending: isLikePending,
    likeCount,
    toggleLike,
  } = useResourceLike({
    entityId: cardData.id,
    entityType: "activity_plan",
    initialCount: cardData.likes_count,
    initialLiked: cardData.has_liked,
  });

  return (
    <ResourceCardShell
      accessibilityLabel={
        onPress ? `Open activity plan ${cardData.name || "Untitled activity plan"}` : undefined
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
            owner={cardData.owner}
            timestamp={cardData.createdAt ?? cardData.updatedAt}
          />
        )
      }
      cardClassName={cardData.isCompleted ? "opacity-60" : undefined}
      compact={isCompact}
      contentClassName={isCompact ? "gap-3 px-2" : "gap-3 px-3"}
      onPress={onPress}
      testID={testID ?? `activity-plan-card-${cardData.id}`}
    >
      {isCompact ? <ResourceCategoryItems items={categoryItems} /> : null}

      <ActivityPlanSummary
        description={cardData.description || cardData.notes || null}
        estimatedDuration={cardData.estimatedDuration}
        owner={cardData.owner}
        presentation={presentation}
        prescriptionQuantification={cardData.prescriptionQuantification}
        structure={cardData.structure}
        title={cardData.name}
        variant="standalone"
        showAttribution={false}
      />

      {showScheduleInfo && cardData.scheduledDate && (
        <View className="mb-2 mt-3 flex-row items-center">
          <Icon as={Calendar} size={12} className="text-muted-foreground mr-1.5" />
          <Text className="text-xs text-muted-foreground">
            {formatScheduledDateTime(cardData.scheduledDate)}
          </Text>
        </View>
      )}

      <ActivityPlanContentPreview
        compact={isCompact}
        size={isCompact ? "small" : "medium"}
        plan={{
          structure: cardData.structure,
        }}
        presentation={presentation}
        testIDPrefix={`activity-plan-card-preview-${cardData.id}`}
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

  const quantitySummary = getActivityPlanQuantitySummary(plan);

  return {
    id: plannedActivity?.id || plan.id,
    name: plan.name,
    activity_category: plan.activity_category ?? "other",
    description: plan.description || undefined,
    structure: plan.structure,
    estimatedDuration: quantitySummary.durationSeconds ?? undefined,
    prescriptionQuantification: plan.prescriptionQuantification,
    estimatedDistance: quantitySummary.distanceMeters ?? undefined,
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
