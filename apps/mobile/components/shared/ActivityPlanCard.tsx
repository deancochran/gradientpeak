import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { getActivityConfig } from "@/lib/constants/activities";
import { formatDurationSec } from "@repo/core/utils/dates";
import type { ActivityPlanStructureV2 } from "@repo/core";
import { format } from "date-fns";
import { Heart, Calendar, CheckCircle2 } from "lucide-react-native";
import { TouchableOpacity, View, Pressable } from "react-native";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

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
  structure?: ActivityPlanStructureV2;
  estimatedDuration?: number; // in seconds
  estimatedTss?: number;
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
  const activity =
    legacyActivity || transformToCardData(activityPlan, plannedActivity);

  const config = getActivityConfig(activity.activityType);

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

  const toggleLikeMutation = trpc.social.toggleLike.useMutation({
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
    >
      <Card
        className={`${isHero ? "border-2 border-primary" : ""} ${activity.isCompleted ? "opacity-60" : ""}`}
      >
        <CardContent className="p-1.5">
          {/* Header Row: Icon + Title */}
          <View className="flex-row items-start mb-1">
            {/* Small Activity Icon */}
            <Icon
              as={config.icon}
              size={14}
              className="text-muted-foreground mr-1.5 mt-0.5 shrink-0"
            />

            {/* Title Column */}
            <View className="flex-1 min-w-0">
              <Text className="font-semibold text-xs" numberOfLines={1}>
                {activity.name}
              </Text>

              {/* Duration + TSS inline */}
              <View className="flex-row items-center gap-1.5">
                {activity.estimatedDuration !== undefined &&
                  activity.estimatedDuration > 0 && (
                    <Text className="text-xs text-muted-foreground">
                      {formatDurationSec(
                        Math.round(activity.estimatedDuration),
                      )}
                    </Text>
                  )}
                {activity.estimatedTss !== undefined &&
                  activity.estimatedTss > 0 && (
                    <Text className="text-xs text-muted-foreground">
                      {Math.round(activity.estimatedTss)} TSS
                    </Text>
                  )}
              </View>
            </View>
          </View>

          {/* Schedule Info Badge (if scheduled) */}
          {showScheduleInfo && activity.scheduledDate && (
            <View className="flex-row items-center mb-1.5">
              <Icon
                as={Calendar}
                size={12}
                className="text-muted-foreground mr-1.5"
              />
              <Text className="text-xs text-muted-foreground">
                {formatScheduledDateTime(activity.scheduledDate)}
              </Text>
            </View>
          )}

          {/* Intensity Profile Chart */}
          {hasStructure && !activity.isCompleted && activity.structure && (
            <View className="mb-1.5 rounded overflow-hidden">
              <TimelineChart
                structure={activity.structure}
                height={50}
                compact={true}
              />
            </View>
          )}

          {/* Description (2-line clamp with ellipsis) */}
          {activity.notes && (
            <Text
              className="text-[10px] text-muted-foreground leading-4"
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {activity.notes}
            </Text>
          )}

          {/* Completed Badge */}
          {activity.isCompleted && (
            <View className="flex-row items-center mt-1.5">
              <Icon
                as={CheckCircle2}
                size={12}
                className="text-green-600 mr-1"
              />
              <Text className="text-xs text-green-600">Completed</Text>
            </View>
          )}

          {/* Social Actions (Like) */}
          <View className="flex-row items-center mt-1 pt-1 border-t border-border">
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleToggleLike();
              }}
              className="flex-row items-center"
            >
              <Icon
                as={Heart}
                size={14}
                className={
                  isLiked
                    ? "text-red-500 fill-red-500"
                    : "text-muted-foreground"
                }
              />
              <Text className="ml-1.5 text-[10px] text-muted-foreground">
                {likesCount > 0 ? likesCount : ""}
              </Text>
            </Pressable>
          </View>
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
    structure: plan.structure,
    estimatedDuration: plan.estimated_duration || undefined,
    estimatedTss: plan.estimated_tss || undefined,
    estimatedDistance: routeInfo?.distance,
    routeId: plan.route_id || undefined,
    routeName: routeInfo?.name,
    notes: plannedActivity?.notes || plan.notes || undefined,
    scheduledDate: plannedActivity?.scheduled_date,
    isCompleted: Boolean(plannedActivity?.completed_activity_id),
    likes_count: plan.likes_count,
    has_liked: plan.has_liked,
  };
}

/**
 * Format scheduled date/time for compact display
 */
function formatScheduledDateTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const activityDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  const diffDays = Math.floor(
    (activityDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

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
