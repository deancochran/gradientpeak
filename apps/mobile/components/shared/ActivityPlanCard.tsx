import type { ActivityPlanStructureV2 } from "@repo/core";
import { formatDurationSec } from "@repo/core";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { Calendar, Heart } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TouchableOpacity, View } from "react-native";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { api } from "@/lib/api";
import { getActivityCategoryConfig, getActivityConfig } from "@/lib/constants/activities";

// ============================================
// TYPES
// ============================================

// Database object types
export interface ActivityPlan {
  id: string;
  name: string;
  activity_category: string;
  description?: string | null;
  structure?: ActivityPlanStructureV2;
  estimated_duration?: number | null; // in seconds
  estimated_tss?: number | null;
  intensity_factor?: number | null;
  route_id?: string | null;
  notes?: string | null;
  profile_id?: string | null;
  created_at?: string;
  updated_at?: string;
  likes_count?: number;
  has_liked?: boolean;
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
  description?: string;
  structure?: ActivityPlanStructureV2;
  estimatedDuration?: number; // in seconds
  estimatedTss?: number;
  intensityFactor?: number;
  estimatedDistance?: number; // in km, if route provided
  routeId?: string;
  routeName?: string;
  notes?: string;

  // Scheduling info (optional)
  scheduledDate?: string; // ISO date string
  isCompleted?: boolean;

  likes_count?: number;
  has_liked?: boolean;
}

interface ActivityPlanCardProps {
  // New flexible prop: accepts activity_plan directly, or planned_activity with nested activity_plan
  activityPlan?: ActivityPlan;
  plannedActivity?: PlannedActivity;

  // Legacy support: accepts pre-formatted data
  activity?: ActivityPlanCardData;

  onPress?: () => void;
  variant?: "default" | "compact" | "hero";
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
  variant = "default",
  showScheduleInfo = false,
}: ActivityPlanCardProps) {
  // Transform database objects to internal format
  const activity = legacyActivity || transformToCardData(activityPlan, plannedActivity);

  const config =
    activity.activityType in { run: true, bike: true, swim: true, strength: true, other: true }
      ? getActivityCategoryConfig(activity.activityType)
      : getActivityConfig(activity.activityType);

  // Check if has structure with steps/intervals
  const hasStructure = Boolean(
    activity.structure?.intervals && activity.structure.intervals.length > 0,
  );

  // Determine if interactive
  const isInteractive = Boolean(onPress);

  // Determine card size based on variant
  const isCompact = variant === "compact";
  const isHero = variant === "hero";

  const CardWrapper = isInteractive ? TouchableOpacity : View;

  const [isLiked, setIsLiked] = useState(activity.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(activity.likes_count ?? 0);

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      // Revert optimistic update on error
      setIsLiked(activity.has_liked ?? false);
      setLikesCount(activity.likes_count ?? 0);
    },
  });

  const handleToggleLike = () => {
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev) => (newLikedState ? prev + 1 : prev - 1));
    toggleLikeMutation.mutate({
      entity_id: activity.id,
      entity_type: "activity_plan",
    });
  };

  return (
    <CardWrapper
      onPress={onPress}
      activeOpacity={isInteractive ? 0.7 : 1}
      disabled={!isInteractive}
      testID={`activity-plan-card-${activity.id}`}
    >
      <Card
        className={`${isHero ? "border-2 border-primary" : ""} ${activity.isCompleted ? "opacity-60" : ""}`}
      >
        <CardContent className={isCompact ? "p-3" : "p-4"}>
          <View className="mb-3 flex-row items-start gap-3">
            <View className={`shrink-0 rounded-full p-2 ${config.bgColor}`}>
              <Icon as={config.icon} size={isCompact ? 14 : 16} className={config.color} />
            </View>

            <View className="min-w-0 flex-1">
              <Text
                className={isCompact ? "text-sm font-semibold" : "text-base font-semibold"}
                numberOfLines={1}
              >
                {activity.name}
              </Text>
            </View>

            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleToggleLike();
              }}
              className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5"
            >
              <Icon
                as={Heart}
                size={14}
                className={isLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"}
              />
              <Text className="ml-1 text-xs font-medium text-muted-foreground">
                {likesCount > 0 ? `${likesCount}` : "Like"}
              </Text>
            </Pressable>
          </View>

          {showScheduleInfo && activity.scheduledDate && (
            <View className="mb-2 flex-row items-center">
              <Icon as={Calendar} size={12} className="text-muted-foreground mr-1.5" />
              <Text className="text-xs text-muted-foreground">
                {formatScheduledDateTime(activity.scheduledDate)}
              </Text>
            </View>
          )}

          {(activity.estimatedDuration !== undefined ||
            activity.estimatedTss !== undefined ||
            activity.intensityFactor !== undefined ||
            activity.structure?.intervals) && (
            <View className="mb-3 rounded-lg bg-muted/30 px-2.5 py-2">
              <View className="flex-row justify-between gap-2">
                <CompactMetric
                  label="Duration"
                  value={
                    activity.estimatedDuration && activity.estimatedDuration > 0
                      ? formatDurationSec(Math.round(activity.estimatedDuration))
                      : "--"
                  }
                />
                <CompactMetric
                  label="TSS"
                  value={
                    activity.estimatedTss !== undefined && activity.estimatedTss > 0
                      ? `${Math.round(activity.estimatedTss)}`
                      : "--"
                  }
                />
                <CompactMetric
                  label="Intensity"
                  value={
                    activity.intensityFactor !== undefined && activity.intensityFactor > 0
                      ? activity.intensityFactor.toFixed(2)
                      : "--"
                  }
                />
                <CompactMetric label="Steps" value={`${countStructureSteps(activity.structure)}`} />
              </View>
            </View>
          )}

          {hasStructure && !activity.isCompleted && activity.structure && (
            <View className="mb-3 overflow-hidden rounded-md">
              <TimelineChart structure={activity.structure} height={50} compact={true} />
            </View>
          )}

          {activity.notes && (
            <Text
              className="text-sm leading-5 text-muted-foreground"
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {activity.notes}
            </Text>
          )}
        </CardContent>
      </Card>
    </CardWrapper>
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

  // Extract route info from structure if available
  const routeInfo = (plan.structure as any)?.route;

  return {
    id: plannedActivity?.id || plan.id,
    name: plan.name,
    activityType: plan.activity_category,
    description: plan.description || undefined,
    structure: plan.structure,
    estimatedDuration: plan.estimated_duration || undefined,
    estimatedTss: plan.estimated_tss || undefined,
    intensityFactor: plan.intensity_factor || undefined,
    estimatedDistance: routeInfo?.distance,
    routeId: plan.route_id || undefined,
    routeName: routeInfo?.name,
    notes: plannedActivity?.notes || plan.description || plan.notes || undefined,
    scheduledDate: plannedActivity?.scheduled_date,
    isCompleted: Boolean(plannedActivity?.completed_activity_id),
    likes_count: plan.likes_count,
    has_liked: plan.has_liked,
  };
}

function countStructureSteps(structure?: ActivityPlanStructureV2): number {
  if (!structure?.intervals) return 0;

  return structure.intervals.reduce((total, interval) => {
    const repetitions = interval.repetitions || 1;
    return total + interval.steps.length * repetitions;
  }, 0);
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <Text className="text-[11px] font-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
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
