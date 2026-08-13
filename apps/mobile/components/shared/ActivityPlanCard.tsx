import type {
  ActivityPlanDetail,
  ActivityPlanSummary as ActivityPlanSummaryProjection,
  ScheduledActivityPlanSummary,
} from "@repo/core";
import { deriveActivityPlanPresentation } from "@repo/core/activity-plan";
import type { ActivityPrescriptionQuantificationBundle } from "@repo/core/activity-quantification";
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

/** Legacy authoring/query source retained outside the card prop boundary during caller migration. */
export type ActivityPlan = {
  id: string;
  name: string;
  activity_category?: string | null;
  structure_hash?: string;
  description?: string | null;
  structure?: unknown;
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
  notes?: string | null;
  profile_id?: string | null;
  content_visibility?: string | null;
  is_system_template?: boolean | null;
  created_at?: string | Date;
  updated_at?: string | Date;
  likes_count?: number | null;
  has_liked?: boolean;
  owner?: EntityOwner | null;
};

export type PlannedActivity = {
  id: string;
  activity_plan_id: string;
  activity_plan?: ActivityPlan;
  scheduled_date: string;
  notes?: string | null;
  completed_activity_id?: string | null;
  profile_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ActivityPlanCardData = {
  id: string;
  name: string;
  activity_category: string;
  description?: string;
  structure?: unknown;
  estimatedDuration?: number;
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
  estimatedDistance?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  scheduledDate?: string;
  isCompleted?: boolean;
  likes_count?: number | null;
  has_liked?: boolean;
  owner?: EntityOwner | null;
};

interface ActivityPlanCardProps {
  plan: ActivityPlanSummaryProjection | ActivityPlanDetail | ScheduledActivityPlanSummary;
  onPress?: () => void;
  testID?: string;
  variant?: "default" | "compact";
  showScheduleInfo?: boolean; // Show date/time badge
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ActivityPlanCard({
  plan,
  onPress,
  testID,
  variant = "default",
  showScheduleInfo = false,
}: ActivityPlanCardProps) {
  const isCompact = variant === "compact";
  const presentation = useMemo(
    () => deriveActivityPlanPresentation(plan.structure),
    [plan.structure],
  );
  const scheduledDate =
    plan.contractVersion === "scheduled-activity-plan-summary-v1"
      ? (plan.schedule.startsAt ?? plan.schedule.calendarDate)
      : null;
  const estimatedDuration = plan.metrics.find((metric) => metric.key === "elapsed_duration")?.value;
  const categoryItems = getUniqueActivityCategoryConfigs([
    presentation?.activity_category ?? plan.activityCategory,
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
    entityId: plan.id,
    entityType: "activity_plan",
    initialCount: plan.engagement.likes,
    initialLiked: plan.engagement.viewerHasLiked,
  });

  return (
    <ResourceCardShell
      accessibilityLabel={onPress ? `Open activity plan ${plan.name}` : undefined}
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
            owner={
              plan.owner
                ? {
                    id: plan.owner.id,
                    username: plan.owner.username,
                    avatar_url: plan.owner.avatarUrl,
                  }
                : null
            }
          />
        )
      }
      cardClassName={
        plan.contractVersion === "scheduled-activity-plan-summary-v1" &&
        plan.schedule.status === "completed"
          ? "opacity-60"
          : undefined
      }
      compact={isCompact}
      contentClassName={isCompact ? "gap-3 px-2" : "gap-3 px-3"}
      onPress={onPress}
      testID={testID ?? `activity-plan-card-${plan.id}`}
    >
      {isCompact ? <ResourceCategoryItems items={categoryItems} /> : null}

      <ActivityPlanSummary
        description={plan.description}
        estimatedDuration={estimatedDuration ?? undefined}
        owner={
          plan.owner
            ? { id: plan.owner.id, username: plan.owner.username, avatar_url: plan.owner.avatarUrl }
            : null
        }
        presentation={presentation}
        projectionMetrics={plan.metrics}
        structure={plan.structure}
        title={plan.name}
        variant="standalone"
        showAttribution={false}
      />

      {showScheduleInfo &&
      plan.contractVersion === "scheduled-activity-plan-summary-v1" &&
      (scheduledDate || plan.schedule.trainingPlanId) ? (
        <View className="mb-2 mt-3 flex-row items-center">
          <Icon as={Calendar} size={12} className="text-muted-foreground mr-1.5" />
          <View>
            {scheduledDate ? (
              <Text className="text-xs text-muted-foreground">
                {formatScheduledDateTime(scheduledDate)}
              </Text>
            ) : null}
            {plan.schedule.trainingPlanId ? (
              <Text className="text-xs text-muted-foreground">From training plan</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <ActivityPlanContentPreview
        compact={isCompact}
        size={isCompact ? "small" : "medium"}
        plan={{
          structure: plan.structure,
        }}
        presentation={presentation}
        testIDPrefix={`activity-plan-card-preview-${plan.id}`}
      />
    </ResourceCardShell>
  );
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
